"""
matching.py — High-Performance MCDM Vendor Matching Engine

Key changes in this version:
  - MatchedVendor now includes vendor_service_id so the frontend can
    pass it directly to the booking API when building a custom package.
  - Batch availability check replaces N+1 per-vendor queries.
  - Progressive fallback produces recommendations instead of empty results.
"""

import math
from typing import List, Optional, Set
from itertools import product as iterproduct
from datetime import datetime

from sqlalchemy.orm import Session, joinedload

import app.models as models
from app.schemas import (
    PlannerQuery, BudgetPackage, MatchedVendor,
    MatchQuery, VendorMatchResult, VendorOut,
    LocationOut, VendorServiceOut,
    PlannerResponse, CategoryBest,
)

KM_PER_LAT_DEGREE           = 111.0
MAX_CANDIDATES_PER_CATEGORY = 12


# ── Haversine ──────────────────────────────────────────────────────────────────

def haversine_km(lat1, lon1, lat2, lon2) -> float:
    R  = 6371.0
    p1 = math.radians(float(lat1))
    p2 = math.radians(float(lat2))
    dp = math.radians(float(lat2) - float(lat1))
    dl = math.radians(float(lon2) - float(lon1))
    a  = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def bounding_box(lat, lng, radius_km):
    lat_d = radius_km / KM_PER_LAT_DEGREE
    lng_d = radius_km / (KM_PER_LAT_DEGREE * max(math.cos(math.radians(lat)), 0.01))
    return lat - lat_d, lat + lat_d, lng - lng_d, lng + lng_d


# ── Batch availability check (ONE query, not N) ────────────────────────────────

def _batch_conflict_ids(db: Session, event_date: datetime) -> Set[int]:
    """Return set of vendor_ids with a confirmed booking on the same date."""
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
    return {r[0] for r in rows}


def _vendor_query(db: Session, lat, lng, radius_km):
    """One SQL query: bounding box + joins + eager loads. No N+1."""
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


def _effective_price(svc, budget, guests) -> Optional[float]:
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


# ── Candidate finder ───────────────────────────────────────────────────────────

def _find_candidates(
    vendors, cat_key, cat_label, allocated_budget, attendee_count,
    event_lat, event_lng, search_radius_km, conflict_ids,
    budget_multiplier=1.0, skip_availability=False,
) -> List[MatchedVendor]:
    effective_budget = allocated_budget * budget_multiplier
    candidates = []

    for v in vendors:
        if not v.location:
            continue
        if not skip_availability and v.id in conflict_ids:
            continue

        dist = haversine_km(event_lat, event_lng,
                            float(v.location.latitude), float(v.location.longitude))
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
                vendor_service_id=svc.id,          # ← included for direct booking
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


def _assemble_packages(per_service_candidates, total_budget) -> List[BudgetPackage]:
    capped   = [c[:MAX_CANDIDATES_PER_CATEGORY] for c in per_service_candidates]
    packages = []
    seen: set = set()

    for combo in iterproduct(*capped):
        vids = [m.vendor_id for m in combo]
        if len(vids) != len(set(vids)):
            continue
        key = tuple(sorted((m.vendor_id, m.category_key) for m in combo))
        if key in seen:
            continue
        seen.add(key)
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


def _per_category_best(db, query, vendors, conflict_ids, cat_map,
                        radius_km, budget_multiplier=1.0,
                        skip_availability=False) -> List[CategoryBest]:
    results = []
    for req in query.services:
        allocated = query.total_budget * (req.budget_percent / 100.0)
        cat_label = cat_map.get(req.category_key, req.category_key)

        any_c = _find_candidates(
            vendors=vendors, cat_key=req.category_key, cat_label=cat_label,
            allocated_budget=allocated * 100, attendee_count=query.attendee_count,
            event_lat=query.event_lat, event_lng=query.event_lng,
            search_radius_km=radius_km, conflict_ids=conflict_ids,
            budget_multiplier=1.0, skip_availability=skip_availability,
        )
        fit_c = _find_candidates(
            vendors=vendors, cat_key=req.category_key, cat_label=cat_label,
            allocated_budget=allocated, attendee_count=query.attendee_count,
            event_lat=query.event_lat, event_lng=query.event_lng,
            search_radius_km=radius_km, conflict_ids=conflict_ids,
            budget_multiplier=budget_multiplier, skip_availability=skip_availability,
        )

        min_price = min((c.price for c in any_c), default=None)
        shortfall = round(min_price - allocated, 2) if min_price and min_price > allocated else None
        top_5     = fit_c[:5] or any_c[:5]   # show up to 5 vendors per category

        results.append(CategoryBest(
            category_key=req.category_key,
            category_label=cat_label,
            allocated_budget=round(allocated, 2),
            vendors_found=len(fit_c),
            any_vendors_found=len(any_c),
            top_vendors=top_5,
            min_price_available=round(min_price, 2) if min_price else None,
            budget_shortfall=shortfall,
        ))
    return results


# ── Progressive fallback planner ───────────────────────────────────────────────

def plan_event_with_fallback(db: Session, query: PlannerQuery) -> PlannerResponse:
    cat_map = {
        c.key: c.label
        for c in db.query(models.ServiceCategoryDef)
                   .filter(models.ServiceCategoryDef.is_active == True).all()
    }
    conflict_ids = _batch_conflict_ids(db, query.event_date)

    fallback_levels = [
        {"radius_km": query.search_radius_km, "budget_multiplier": 1.0,
         "skip_availability": False, "is_recommendation": False,
         "reason": None, "labels": []},
        {"radius_km": min(query.search_radius_km * 5, 1000), "budget_multiplier": 1.0,
         "skip_availability": False, "is_recommendation": True,
         "reason": f"No vendors within {query.search_radius_km:.0f} km. Showing closest within {min(query.search_radius_km*5,1000):.0f} km.",
         "labels": [f"Radius expanded to {min(query.search_radius_km*5,1000):.0f} km"]},
        {"radius_km": query.search_radius_km, "budget_multiplier": 1.35,
         "skip_availability": False, "is_recommendation": True,
         "reason": "No vendors fit your exact budget. Showing packages up to 35% above each category allocation.",
         "labels": ["Category budgets relaxed by 35%"]},
        {"radius_km": min(query.search_radius_km * 5, 1000), "budget_multiplier": 1.35,
         "skip_availability": False, "is_recommendation": True,
         "reason": f"Expanded to {min(query.search_radius_km*5,1000):.0f} km and relaxed budgets by 35%.",
         "labels": [f"Radius expanded to {min(query.search_radius_km*5,1000):.0f} km", "Budgets relaxed 35%"]},
        {"radius_km": min(query.search_radius_km * 5, 1000), "budget_multiplier": 1.0,
         "skip_availability": True, "is_recommendation": True,
         "reason": "No fully available vendors on that date. Showing vendors who may have a prior booking — confirm availability before booking.",
         "labels": [f"Radius expanded to {min(query.search_radius_km*5,1000):.0f} km", "Date availability not verified"]},
        {"radius_km": min(query.search_radius_km * 15, 2000), "budget_multiplier": 1.5,
         "skip_availability": True, "is_recommendation": True,
         "reason": "Very few vendors matched. Showing widest possible search — all limits relaxed.",
         "labels": ["Nationwide search", "Budgets relaxed 50%", "Date availability not verified"]},
    ]

    for level in fallback_levels:
        radius_km   = level["radius_km"]
        budget_mult = level["budget_multiplier"]
        skip_avail  = level["skip_availability"]

        vendors = _vendor_query(db, query.event_lat, query.event_lng, radius_km).all()

        per_service = []
        for req in query.services:
            allocated = query.total_budget * (req.budget_percent / 100.0)
            cat_label = cat_map.get(req.category_key, req.category_key)
            candidates = _find_candidates(
                vendors=vendors, cat_key=req.category_key, cat_label=cat_label,
                allocated_budget=allocated, attendee_count=query.attendee_count,
                event_lat=query.event_lat, event_lng=query.event_lng,
                search_radius_km=radius_km,
                conflict_ids=conflict_ids if not skip_avail else set(),
                budget_multiplier=budget_mult, skip_availability=skip_avail,
            )
            per_service.append(candidates)

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

    # Absolute fallback — return per-category best only
    wide_vendors = _vendor_query(db, query.event_lat, query.event_lng, 2000).all()
    per_cat = _per_category_best(
        db, query, wide_vendors, set(), cat_map,
        2000, budget_multiplier=2.0, skip_availability=True,
    )
    return PlannerResponse(
        packages=[],
        is_recommendation=True,
        recommendation_reason=(
            "No complete package could be assembled. "
            "Below are the best individual vendors per category — "
            "select the ones you want to build your own custom package."
        ),
        recommendation_labels=["No complete package found",
                                "Select vendors below to build a custom package"],
        per_category=per_cat,
    )


# ── Legacy single-service match ────────────────────────────────────────────────

def match_vendors(db: Session, query: MatchQuery) -> List[VendorMatchResult]:
    conflict_ids = _batch_conflict_ids(db, query.event_date)
    vendors      = _vendor_query(db, query.event_lat, query.event_lng,
                                  min(query.search_radius_km, 1500)).all()
    results = []
    for v in vendors:
        if not v.location or v.id in conflict_ids:
            continue
        svc = next((s for s in v.services
                    if s.is_active and s.category_key == query.service_category), None)
        if not svc:
            continue
        dist = haversine_km(query.event_lat, query.event_lng,
                            float(v.location.latitude), float(v.location.longitude))
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
        score = (0.4 * (1.0 - dist / max_dist) +
                 0.3 * (1.0 - price / max_price) +
                 0.3 * (v.rating / 5.0))
        loc = LocationOut(id=v.location.id, address=v.location.address,
                          latitude=float(v.location.latitude),
                          longitude=float(v.location.longitude))
        vo = VendorOut(
            id=v.id, business_name=v.business_name, description=v.description,
            availability_status=v.availability_status, rating=v.rating,
            rating_count=v.rating_count, service_radius_km=v.service_radius_km,
            is_verified=v.is_verified, service_limit=v.service_limit,
            user_id=v.user_id, created_at=v.created_at, location=loc,
            services=[_svc_out(s) for s in v.services if s.is_active],
            owner_name=v.user.name          if v.user else None,
            owner_email=v.user.email        if v.user else None,
            owner_phone=v.user.phone_number if v.user else None,
        )
        scored.append(VendorMatchResult(
            vendor=vo, distance_km=round(dist, 2),
            composite_score=round(score, 4), matched_service=_svc_out(svc),
        ))

    scored.sort(key=lambda x: x.composite_score, reverse=True)
    return scored
