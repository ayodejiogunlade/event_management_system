"""
matching.py — MCDM Vendor Matching Engine

Implements a two-stage vendor matching process:
  Stage 1: Hard constraint filtering (category, availability, verification, radius, date)
  Stage 2: Composite MCDM scoring:
           S = 0.4 × S_distance + 0.3 × S_price + 0.3 × S_rating

Distance is computed using the Haversine formula (great-circle distance in km).
"""

import math
from typing import List, Dict, Optional
from itertools import product as iterproduct
from sqlalchemy.orm import Session
from datetime import datetime
import app.models as models
from app.schemas import (PlannerQuery, BudgetPackage, MatchedVendor,
                          MatchQuery, VendorMatchResult, VendorOut,
                          LocationOut, VendorServiceOut)


def haversine_km(lat1, lon1, lat2, lon2) -> float:
    """
    Compute great-circle distance in kilometres between two points
    on the Earth's surface using the Haversine formula.
    """
    R = 6371.0
    p1 = math.radians(float(lat1))
    p2 = math.radians(float(lat2))
    dp = math.radians(float(lat2) - float(lat1))
    dl = math.radians(float(lon2) - float(lon1))
    a  = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _effective_price(svc: models.VendorService, budget: float, guests: int) -> Optional[float]:
    """
    Return the effective price of a service given a budget and guest count.
    Returns None if the service has no valid price configured.
    """
    pm = svc.pricing_model_key
    if pm == "fixed_fee":
        return float(svc.fixed_price) if svc.fixed_price else None
    if pm == "per_head":
        return float(svc.price_per_head) * guests if svc.price_per_head else None
    if pm == "percentage":
        return (svc.percentage_rate / 100.0) * budget if svc.percentage_rate else None
    if pm == "hourly":
        return float(svc.hourly_rate) * (svc.min_hours or 1) if svc.hourly_rate else None
    return None


def _is_available(db: Session, vendor_id: int, event_date: datetime) -> bool:
    """
    Return True if the vendor has no confirmed booking on the same calendar date.
    """
    date = event_date.date()
    conflict = (
        db.query(models.Booking)
        .join(models.Event)
        .filter(
            models.Booking.vendor_id == vendor_id,
            models.Booking.status == models.BookingStatus.confirmed,
            models.Event.event_date >= datetime.combine(date, datetime.min.time()),
            models.Event.event_date <  datetime.combine(date, datetime.max.time()),
        )
        .first()
    )
    return conflict is None


def _check_extra_info(svc: models.VendorService, req_extra: Optional[dict]) -> bool:
    """Check service-specific constraints (e.g. venue capacity >= attendees)."""
    if not req_extra or not svc.extra_info:
        return True
    if "min_capacity" in req_extra:
        cap = svc.extra_info.get("capacity")
        if cap is not None and int(cap) < int(req_extra["min_capacity"]):
            return False
    return True


def _svc_out(s: models.VendorService) -> VendorServiceOut:
    return VendorServiceOut(
        id=s.id, vendor_id=s.vendor_id, service_name=s.service_name,
        category_key=s.category_key, description=s.description,
        pricing_model_key=s.pricing_model_key,
        fixed_price=float(s.fixed_price) if s.fixed_price else None,
        price_per_head=float(s.price_per_head) if s.price_per_head else None,
        min_guests=s.min_guests, percentage_rate=s.percentage_rate,
        hourly_rate=float(s.hourly_rate) if s.hourly_rate else None,
        min_hours=s.min_hours, deposit_percent=s.deposit_percent,
        vat_applicable=s.vat_applicable, is_active=s.is_active,
        extra_info=s.extra_info, created_at=s.created_at,
    )


# ── Multi-service Budget Planner ──────────────────────────────────────────────

def plan_event(db: Session, query: PlannerQuery) -> List[BudgetPackage]:
    """
    Multi-service budget planner.

    For each requested service category, finds all vendors whose price fits
    the allocated budget slice, are available on the event date, are within
    the search radius, and pass any extra constraints.

    Builds all valid vendor combinations (one vendor per category) and returns
    up to 8 packages sorted by total cost ascending.
    """
    cat_map: Dict[str, str] = {
        c.key: c.label
        for c in db.query(models.ServiceCategoryDef)
                   .filter(models.ServiceCategoryDef.is_active == True).all()
    }

    per_service_candidates: List[List[MatchedVendor]] = []

    for req in query.services:
        allocated  = query.total_budget * (req.budget_percent / 100.0)
        candidates: List[MatchedVendor] = []

        vendors = db.query(models.Vendor).filter(
            models.Vendor.availability_status == True,
            models.Vendor.is_verified == True,
        ).all()

        for v in vendors:
            if not v.location:
                continue
            dist = haversine_km(
                query.event_lat, query.event_lng,
                float(v.location.latitude), float(v.location.longitude),
            )
            if dist > query.search_radius_km or dist > v.service_radius_km:
                continue
            if not _is_available(db, v.id, query.event_date):
                continue

            for svc in v.services:
                if not svc.is_active:
                    continue
                if svc.category_key != req.category_key:
                    continue
                if not _check_extra_info(svc, req.extra_info):
                    continue

                price = _effective_price(svc, allocated, query.attendee_count)
                if price is None or price > allocated:
                    continue

                candidates.append(MatchedVendor(
                    vendor_id=v.id,
                    vendor_name=v.business_name,
                    address=v.location.address or f"{float(v.location.latitude):.4f},{float(v.location.longitude):.4f}",
                    service_name=svc.service_name,
                    category_key=req.category_key,
                    category_label=cat_map.get(req.category_key, req.category_key),
                    pricing_model=svc.pricing_model_key,
                    price=round(price, 2),
                    distance_km=round(dist, 2),
                    rating=v.rating,
                    deposit_percent=svc.deposit_percent,
                    vat_applicable=svc.vat_applicable,
                    extra_info=svc.extra_info,
                ))

        candidates.sort(key=lambda x: x.price)
        per_service_candidates.append(candidates[:5] if candidates else [])

    if any(len(c) == 0 for c in per_service_candidates):
        return []

    packages: List[BudgetPackage] = []
    seen_combos = set()

    for combo in iterproduct(*per_service_candidates):
        vendor_ids = [m.vendor_id for m in combo]
        if len(vendor_ids) != len(set(vendor_ids)):
            continue

        key = tuple(sorted((m.vendor_id, m.category_key) for m in combo))
        if key in seen_combos:
            continue
        seen_combos.add(key)

        total = sum(m.price for m in combo)
        if total > query.total_budget:
            continue

        packages.append(BudgetPackage(
            package_number=len(packages) + 1,
            vendors=list(combo),
            total_cost=round(total, 2),
            total_budget=query.total_budget,
            savings=round(query.total_budget - total, 2),
        ))

    packages.sort(key=lambda p: p.total_cost)
    for i, p in enumerate(packages[:8], 1):
        p.package_number = i
    return packages[:8]


# ── Legacy single-service match ───────────────────────────────────────────────

def match_vendors(db: Session, query: MatchQuery) -> List[VendorMatchResult]:
    """
    Single-category MCDM vendor matching.
    Applies hard constraints then scores with:
      S = 0.4 × S_distance + 0.3 × S_price + 0.3 × S_rating
    """
    vendors = db.query(models.Vendor).filter(
        models.Vendor.availability_status == True,
        models.Vendor.is_verified == True,
    ).all()

    results = []
    for v in vendors:
        svc = next(
            (s for s in v.services if s.is_active and s.category_key == query.service_category),
            None,
        )
        if not svc or not v.location:
            continue
        if not _is_available(db, v.id, query.event_date):
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

        results.append((v, dist, svc, price or 0))

    if not results:
        return []

    max_dist  = max(d for _, d, _, _ in results) or 1
    max_price = max(p for _, _, _, p in results) or 1

    scored = []
    for v, dist, svc, price in results:
        s_dist  = 1 - (dist  / max_dist)
        s_price = 1 - (price / max_price)
        s_rate  = v.rating / 5.0
        score   = 0.4 * s_dist + 0.3 * s_price + 0.3 * s_rate

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
            owner_name=v.user.name if v.user else None,
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
