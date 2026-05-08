"""
matching.py — High-Performance MCDM Vendor Matching Engine
===========================================================

Performance fixes that bring search time from minutes → milliseconds:

  FIX 1 — Batch availability check (biggest win)
    Old: _is_available() fired one SQL query per vendor → 1,000 queries
    New: _batch_conflict_ids() fires ONE query, returns a Python set.
         Availability check becomes "if vendor_id in conflict_set" — O(1).

  FIX 2 — Bounding box DB pre-filter (already applied in previous patch)
    Eliminates vendors outside the search radius before any Python runs.

  FIX 3 — Candidate cap before iterproduct
    Caps candidates at MAX_CANDIDATES_PER_CATEGORY per category so the
    combinatorial step stays bounded.

Progressive fallback when no exact results are found:
  Level 1 — Exact:              strict radius, strict budget, check availability
  Level 2 — Expand radius:      radius × 5 (up to 1000 km)
  Level 3 — Relax budget:       allow each category budget × 1.35
  Level 4 — Expand + Relax:     both above combined
  Level 5 — Ignore date:        skip availability, show "needs confirmation"
  Level 6 — All relaxed:        radius × 10, budget × 1.5, ignore date

Per-category breakdown is always computed so the UI can show the user
exactly which categories have vendors and which don't.
"""

import math
from typing import List, Optional, Set, Tuple
from itertools import product as iterproduct
from datetime import datetime, date

from sqlalchemy.orm import Session, joinedload
from sqlalchemy import and_

import app.models as models
from app.schemas import (
    PlannerQuery, BudgetPackage, MatchedVendor,
    MatchQuery, VendorMatchResult, VendorOut,
    LocationOut, VendorServiceOut,
    PlannerResponse, CategoryBest,
)


# ── Constants ──────────────────────────────────────────────────────────────────
KM_PER_LAT_DEGREE       = 111.0
MAX_CANDIDATES_PER_CATEGORY = 12   # caps iterproduct; 12^5 = 248,832 max combos


# ── Haversine ──────────────────────────────────────────────────────────────────

def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R  = 6371.0
    p1 = math.radians(float(lat1))
    p2 = math.radians(float(lat2))
    dp = math.radians(float(lat2) - float(lat1))
    dl = math.radians(float(lon2) - float(lon1))
    a  = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


# ── Bounding box ───────────────────────────────────────────────────────────────

def bounding_box(lat: float, lng: float, radius_km: float):
    lat_delta = radius_km / KM_PER_LAT_DEGREE
    lng_delta = radius_km / (KM_PER_LAT_DEGREE * max(math.cos(math.radians(lat)), 0.01))
    return lat - lat_delta, lat + lat_delta, lng - lng_delta, lng + lng_delta


# ── BATCH availability check ───────────────────────────────────────────────────

def _batch_conflict_ids(db: Session, event_date: datetime) -> Set[int]:
    """
    Return the set of vendor_ids that already have a CONFIRMED booking on the
    same calendar date as event_date.

    Fires exactly ONE SQL query regardless of how many vendors exist.
    Replaces the old per-vendor _is_available() which fired N queries.
    """
    day_start = datetime.combine(event_date.date(), datetime.min.time())
    day_end   = datetime.combine(event_date.date(), datetime.max.time())

    rows = (
        db.query(models.Booking.vendor_id)
        .join(models.Event, models.Booking.event_id == models.Event.id)
        .filter(
            models.Booking.status   == models.BookingStatus.confirmed,
            models.Event.event_date >= day_start,
            models.Event.event_date <  day_end,
        )
        .all()
    )
    return {row[0] for row in rows}


# ── Base vendor query ──────────────────────────────────────────────────────────

def _vendor_query(db: Session, lat: float, lng: float, radius_km: float):
    """
    One SQL query that returns all verified, available vendors within the
    bounding box, with services and location eagerly loaded (no N+1).
    """
    lat_min, lat_max, lng_min, lng_max = bounding_box(lat, lng, radius_km)
    return (
        db.query(models.Vendor)
        .join(models.Location, models.Vendor.id == models.Location.vendor_id)
        .filter(
            models.Vendor.is_verified         == True,
            models.Vendor.availability_status == True,
            models.Location.latitude.between(lat_min, lat_max),
            models.Location.longitude.between(lng_min, lng_max),
        )
        .options(
            joinedload(models.Vendor.services),
            joinedload(models.Vendor.location),
            joinedload(models.Vendor.user),
        )
    )


# ── Price calculator ───────────────────────────────────────────────────────────

def _effective_price(
    svc: models.VendorService,
    budget: float,
    guests: int,
) -> Optional[float]:
    pm = svc.pricing_model_key
    if pm == "fixed_fee"  and svc.fixed_price:     return float(svc.fixed_price)
    if pm == "per_head"   and svc.price_per_head:  return float(svc.price_per_head) * guests
    if pm == "percentage" and svc.percentage_rate: return (svc.percentage_rate / 100.0) * budget
    if pm == "hourly"     and svc.hourly_rate:     return float(svc.hourly_rate) * (svc.min_hours or 1)
    return None


def _svc_out(s: models.VendorService) -> VendorServiceOut:
    return VendorServiceOut(
        id=s.id, vendor_id=s.vendor_id, service_name=s.service_name,
        category_key=s.category_key, description=s.description,
        pricing_model_key=s.pricing_model_key,
        fixed_price=float(s.fixed_price)      if s.fixed_price      else None,
        price_per_head=float(s.price_per_head) if s.price_per_head   else None,
        min_guests=s.min_guests, percentage_rate=s.percentage_rate,
        hourly_rate=float(s.hourly_rate)      if s.hourly_rate       else None,
        min_hours=s.min_hours, deposit_percent=s.deposit_percent,
        vat_applicable=s.vat_applicable, is_active=s.is_active,
        extra_info=s.extra_info, created_at=s.created_at,
    )


# ── Core candidate finder ──────────────────────────────────────────────────────

def _find_candidates(
    vendors: List[models.Vendor],
    cat_key: str,
    cat_label: str,
    allocated_budget: float,
    attendee_count: int,
    event_lat: float,
    event_lng: float,
    search_radius_km: float,
    conflict_ids: Set[int],
    budget_multiplier: float = 1.0,
    skip_availability: bool = False,
) -> List[MatchedVendor]:
    """
    Filter vendors down to candidates for a single service category.
    Returns list sorted by price ascending.
    """
    effective_budget = allocated_budget * budget_multiplier
    candidates = []

    for v in vendors:
        if not v.location:
            continue
        if not skip_availability and v.id in conflict_ids:
            continue

        dist = haversine_km(
            event_lat, event_lng,
            float(v.location.latitude), float(v.location.longitude),
        )
        if dist > search_radius_km or dist > v.service_radius_km:
            continue

        for svc in v.services:
            if not svc.is_active or svc.category_key != cat_key:
                continue
            price = _effective_price(svc, effective_budget, attendee_count)
            if price is None or price > effective_budget:
                continue

            candidates.append(MatchedVendor(
                vendor_id=v.id,
                vendor_name=v.business_name,
                address=(
                    v.location.address
                    or f"{float(v.location.latitude):.4f}, {float(v.location.longitude):.4f}"
                ),
                service_name=svc.service_name,
                category_key=cat_key,
                category_label=cat_label,
                pricing_model=svc.pricing_model_key,
                price=round(price, 2),
                distance_km=round(dist, 2),
                rating=v.rating,
                deposit_percent=svc.deposit_percent,
                vat_applicable=svc.vat_applicable,
                extra_info=svc.extra_info,
            ))
            break  # one service per vendor per category

    candidates.sort(key=lambda x: x.price)
    return candidates


# ── Package assembler ──────────────────────────────────────────────────────────

def _assemble_packages(
    per_service_candidates: List[List[MatchedVendor]],
    total_budget: float,
) -> List[BudgetPackage]:
    """
    Build vendor packages from per-category candidate lists.
    Caps at MAX_CANDIDATES_PER_CATEGORY per category before iterproduct.
    Returns up to 8 packages sorted by total cost ascending.
    """
    capped = [c[:MAX_CANDIDATES_PER_CATEGORY] for c in per_service_candidates]

    packages   = []
    seen_combos: set = set()

    for combo in iterproduct(*capped):
        vendor_ids = [m.vendor_id for m in combo]
        if len(vendor_ids) != len(set(vendor_ids)):
            continue

        key = tuple(sorted((m.vendor_id, m.category_key) for m in combo))
        if key in seen_combos:
            continue
        seen_combos.add(key)

        total = sum(m.price for m in combo)
        if total > total_budget:
            continue

        packages.append(BudgetPackage(
            package_number=len(packages) + 1,
            vendors=list(combo),
            total_cost=round(total, 2),
            total_budget=total_budget,
            savings=round(total_budget - total, 2),
        ))

        if len(packages) >= 8:
            break

    packages.sort(key=lambda p: p.total_cost)
    for i, p in enumerate(packages[:8], 1):
        p.package_number = i
    return packages[:8]


# ── Per-category best (for the fallback UI) ────────────────────────────────────

def _per_category_best(
    db: Session,
    query: PlannerQuery,
    vendors: List[models.Vendor],
    conflict_ids: Set[int],
    cat_map: dict,
    radius_km: float,
    budget_multiplier: float = 1.0,
    skip_availability: bool = False,
) -> List[CategoryBest]:
    """
    For each requested service category, find the top 3 vendors regardless
    of whether a full package is possible.  Used to populate the
    "Closest Recommendations" section in the UI.
    """
    results = []
    for req in query.services:
        allocated     = query.total_budget * (req.budget_percent / 100.0)
        cat_label     = cat_map.get(req.category_key, req.category_key)

        # Get candidates with no budget cap to find what IS available
        any_candidates = _find_candidates(
            vendors=vendors,
            cat_key=req.category_key,
            cat_label=cat_label,
            allocated_budget=allocated * 100,   # no budget ceiling here
            attendee_count=query.attendee_count,
            event_lat=query.event_lat,
            event_lng=query.event_lng,
            search_radius_km=radius_km,
            conflict_ids=conflict_ids,
            budget_multiplier=1.0,
            skip_availability=skip_availability,
        )

        # Then get budget-fit candidates at relaxed budget
        fit_candidates = _find_candidates(
            vendors=vendors,
            cat_key=req.category_key,
            cat_label=cat_label,
            allocated_budget=allocated,
            attendee_count=query.attendee_count,
            event_lat=query.event_lat,
            event_lng=query.event_lng,
            search_radius_km=radius_km,
            conflict_ids=conflict_ids,
            budget_multiplier=budget_multiplier,
            skip_availability=skip_availability,
        )

        min_price = min((c.price for c in any_candidates), default=None)
        shortfall = round(min_price - allocated, 2) if min_price and min_price > allocated else None

        top_3 = fit_candidates[:3] or any_candidates[:3]

        results.append(CategoryBest(
            category_key=req.category_key,
            category_label=cat_label,
            allocated_budget=round(allocated, 2),
            vendors_found=len(fit_candidates),
            any_vendors_found=len(any_candidates),
            top_vendors=top_3,
            min_price_available=round(min_price, 2) if min_price else None,
            budget_shortfall=shortfall,
        ))

    return results


# ── Progressive fallback planner ───────────────────────────────────────────────

def plan_event_with_fallback(db: Session, query: PlannerQuery) -> PlannerResponse:
    """
    Main entry point for the Find Vendors planner.

    Tries increasingly relaxed search constraints until packages are found.
    Always returns a PlannerResponse — never silently returns nothing.

    Fallback levels (tried in order):
      1. Exact           — all constraints strict
      2. Radius × 5      — expand search area
      3. Budget × 1.35   — allow 35% over category budget
      4. Radius × 5 + Budget × 1.35
      5. Ignore date     — skip availability check
      6. All relaxed     — radius × 10, budget × 1.5, no date check
    """

    # Pre-load data used by all fallback levels ─────────────────────────────────
    cat_map: dict = {
        c.key: c.label
        for c in db.query(models.ServiceCategoryDef)
                   .filter(models.ServiceCategoryDef.is_active == True)
                   .all()
    }

    # ONE query for all conflicts on this date (replaces N queries)
    conflict_ids = _batch_conflict_ids(db, query.event_date)

    # Define fallback levels ────────────────────────────────────────────────────
    fallback_levels = [
        {
            "label":             "exact",
            "radius_km":         query.search_radius_km,
            "budget_multiplier": 1.0,
            "skip_availability": False,
            "is_recommendation": False,
            "reason":            None,
            "labels":            [],
        },
        {
            "label":             "radius_expanded",
            "radius_km":         min(query.search_radius_km * 5, 1000),
            "budget_multiplier": 1.0,
            "skip_availability": False,
            "is_recommendation": True,
            "reason":            (
                f"No vendors found within {query.search_radius_km:.0f} km. "
                f"Showing the closest matches within "
                f"{min(query.search_radius_km * 5, 1000):.0f} km of your venue."
            ),
            "labels": [f"Search radius expanded to {min(query.search_radius_km * 5, 1000):.0f} km"],
        },
        {
            "label":             "budget_relaxed",
            "radius_km":         query.search_radius_km,
            "budget_multiplier": 1.35,
            "skip_availability": False,
            "is_recommendation": True,
            "reason":            (
                "No vendors fit within your exact budget. "
                "Showing packages that are up to 35% above each category's allocation."
            ),
            "labels": ["Category budgets relaxed by up to 35%"],
        },
        {
            "label":             "radius_and_budget",
            "radius_km":         min(query.search_radius_km * 5, 1000),
            "budget_multiplier": 1.35,
            "skip_availability": False,
            "is_recommendation": True,
            "reason":            (
                f"Expanded search to {min(query.search_radius_km * 5, 1000):.0f} km "
                "and relaxed category budgets by 35%."
            ),
            "labels": [
                f"Search radius expanded to {min(query.search_radius_km * 5, 1000):.0f} km",
                "Category budgets relaxed by 35%",
            ],
        },
        {
            "label":             "ignore_date",
            "radius_km":         min(query.search_radius_km * 5, 1000),
            "budget_multiplier": 1.0,
            "skip_availability": True,
            "is_recommendation": True,
            "reason":            (
                "No fully-available vendors found for your date. "
                "Showing vendors who may have a booking on that day — "
                "contact them to confirm availability before booking."
            ),
            "labels": [
                f"Radius expanded to {min(query.search_radius_km * 5, 1000):.0f} km",
                "Date availability not verified — confirm with vendor",
            ],
        },
        {
            "label":             "all_relaxed",
            "radius_km":         min(query.search_radius_km * 15, 2000),
            "budget_multiplier": 1.5,
            "skip_availability": True,
            "is_recommendation": True,
            "reason":            (
                "Very few vendors matched your criteria. "
                "Showing the widest possible search — "
                "all budget and distance limits have been relaxed."
            ),
            "labels": [
                f"Nationwide search ({min(query.search_radius_km * 15, 2000):.0f} km radius)",
                "Budgets relaxed by 50%",
                "Date availability not verified",
            ],
        },
    ]

    # Try each fallback level ───────────────────────────────────────────────────
    for level in fallback_levels:
        radius_km    = level["radius_km"]
        budget_mult  = level["budget_multiplier"]
        skip_avail   = level["skip_availability"]

        # Fetch vendors within this level's bounding box (one query)
        vendors = _vendor_query(db, query.event_lat, query.event_lng, radius_km).all()

        # Build candidate list per service category
        per_service: List[List[MatchedVendor]] = []
        for req in query.services:
            allocated = query.total_budget * (req.budget_percent / 100.0)
            cat_label = cat_map.get(req.category_key, req.category_key)

            candidates = _find_candidates(
                vendors=vendors,
                cat_key=req.category_key,
                cat_label=cat_label,
                allocated_budget=allocated,
                attendee_count=query.attendee_count,
                event_lat=query.event_lat,
                event_lng=query.event_lng,
                search_radius_km=radius_km,
                conflict_ids=conflict_ids if not skip_avail else set(),
                budget_multiplier=budget_mult,
                skip_availability=skip_avail,
            )
            per_service.append(candidates)

        # Check if every category has at least one candidate
        if all(len(c) > 0 for c in per_service):
            packages = _assemble_packages(per_service, query.total_budget * budget_mult)
            if packages:
                per_cat = _per_category_best(
                    db, query, vendors, conflict_ids, cat_map,
                    radius_km, budget_mult, skip_avail,
                )
                return PlannerResponse(
                    packages=packages,
                    is_recommendation=level["is_recommendation"],
                    recommendation_reason=level["reason"],
                    recommendation_labels=level["labels"],
                    per_category=per_cat,
                )

    # Absolute fallback — no packages possible, return per-category best only ──
    # Use widest possible radius to give the user SOMETHING useful
    wide_radius = 2000
    all_vendors = _vendor_query(db, query.event_lat, query.event_lng, wide_radius).all()
    per_cat = _per_category_best(
        db, query, all_vendors, set(), cat_map,
        wide_radius, budget_multiplier=2.0, skip_availability=True,
    )

    return PlannerResponse(
        packages=[],
        is_recommendation=True,
        recommendation_reason=(
            "No vendor packages could be assembled for your search. "
            "Below are the best individual vendors available per category — "
            "you can contact them directly to arrange a custom package."
        ),
        recommendation_labels=[
            "No complete package found",
            "Showing best individual vendors per category",
            "Budgets and distance limits fully relaxed",
        ],
        per_category=per_cat,
    )


# ── Legacy single-service match (for /discover page) ──────────────────────────

def match_vendors(db: Session, query: MatchQuery) -> List[VendorMatchResult]:
    """
    Single-category MCDM vendor matching.
    S = 0.4 × S_distance + 0.3 × S_price + 0.3 × S_rating
    """
    conflict_ids = _batch_conflict_ids(db, query.event_date)
    vendors      = _vendor_query(db, query.event_lat, query.event_lng,
                                  min(query.search_radius_km, 1500)).all()
    results = []
    for v in vendors:
        if not v.location or v.id in conflict_ids:
            continue
        svc = next(
            (s for s in v.services
             if s.is_active and s.category_key == query.service_category),
            None,
        )
        if not svc:
            continue
        dist = haversine_km(
            query.event_lat, query.event_lng,
            float(v.location.latitude), float(v.location.longitude),
        )
        if dist > query.search_radius_km or dist > v.service_radius_km:
            continue
        price = _effective_price(svc, query.budget or 999_999_999, 100)
        if query.budget and price and price > query.budget:
            continue
        results.append((v, dist, svc, price or 0.0))

    if not results:
        return []

    max_dist  = max(d for _, d, _, _ in results) or 1.0
    max_price = max(p for _, _, _, p in results) or 1.0

    scored = []
    for v, dist, svc, price in results:
        score = (
            0.4 * (1.0 - dist / max_dist) +
            0.3 * (1.0 - price / max_price) +
            0.3 * (v.rating / 5.0)
        )
        loc = LocationOut(
            id=v.location.id, address=v.location.address,
            latitude=float(v.location.latitude),
            longitude=float(v.location.longitude),
        )
        vo = VendorOut(
            id=v.id, business_name=v.business_name, description=v.description,
            availability_status=v.availability_status, rating=v.rating,
            rating_count=v.rating_count, service_radius_km=v.service_radius_km,
            is_verified=v.is_verified, service_limit=v.service_limit,
            user_id=v.user_id, created_at=v.created_at, location=loc,
            services=[_svc_out(s) for s in v.services if s.is_active],
            owner_name=v.user.name   if v.user else None,
            owner_email=v.user.email if v.user else None,
        )
        scored.append(VendorMatchResult(
            vendor=vo,
            distance_km=round(dist, 2),
            composite_score=round(score, 4),
            matched_service=_svc_out(svc),
        ))

    scored.sort(key=lambda x: x.composite_score, reverse=True)
    return scored
