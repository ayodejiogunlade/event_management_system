import math
from typing import List, Tuple
from sqlalchemy.orm import Session
from datetime import datetime
import app.models as models
from app.schemas import MatchQuery, VendorMatchResult, VendorOut, LocationOut


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Compute great-circle distance in km using the Haversine formula."""
    R = 6371.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def match_vendors(db: Session, query: MatchQuery) -> List[VendorMatchResult]:
    """
    MCDM matching:
    Stage 1 – Hard constraints: service_type, available, verified, not booked on date.
    Stage 2 – Composite score ranking: distance (40%), price (30%), rating (30%).
    """
    # Hard filter
    vendors = db.query(models.Vendor).filter(
        models.Vendor.service_type == query.service_type,
        models.Vendor.availability_status == True,
        models.Vendor.is_verified == True,
    ).all()

    results = []
    for v in vendors:
        # Check not already booked (confirmed) on this date
        event_date_str = query.event_date.date()
        conflict = db.query(models.Booking).join(models.Event).filter(
            models.Booking.vendor_id == v.id,
            models.Booking.status == models.BookingStatus.confirmed,
            models.Event.event_date >= datetime.combine(event_date_str, datetime.min.time()),
            models.Event.event_date <  datetime.combine(event_date_str, datetime.max.time()),
        ).first()
        if conflict:
            continue

        if not v.location:
            continue

        dist = haversine_km(
            query.event_lat, query.event_lng,
            float(v.location.latitude), float(v.location.longitude)
        )
        # Respect both the search radius and the vendor's service radius
        if dist > query.search_radius_km or dist > v.service_radius_km:
            continue

        # Pricing filter
        if query.budget and v.pricing and float(v.pricing) > float(query.budget):
            continue

        results.append((v, dist))

    if not results:
        return []

    # Normalise scores
    max_dist  = max(d for _, d in results) or 1
    max_price = max((float(v.pricing) if v.pricing else 0) for v, _ in results) or 1
    max_rating = 5.0

    W_DIST, W_PRICE, W_RATE = 0.4, 0.3, 0.3

    scored = []
    for v, dist in results:
        price_val = float(v.pricing) if v.pricing else 0
        s_dist  = 1 - (dist / max_dist)
        s_price = 1 - (price_val / max_price)
        s_rate  = v.rating / max_rating
        score   = W_DIST * s_dist + W_PRICE * s_price + W_RATE * s_rate

        loc_out = None
        if v.location:
            loc_out = LocationOut(
                id=v.location.id,
                address=v.location.address,
                latitude=float(v.location.latitude),
                longitude=float(v.location.longitude),
            )

        vendor_out = VendorOut(
            id=v.id,
            business_name=v.business_name,
            service_type=v.service_type,
            description=v.description,
            pricing=float(v.pricing) if v.pricing else None,
            availability_status=v.availability_status,
            rating=v.rating,
            rating_count=v.rating_count,
            service_radius_km=v.service_radius_km,
            is_verified=v.is_verified,
            user_id=v.user_id,
            created_at=v.created_at,
            location=loc_out,
            owner_name=v.user.name if v.user else None,
            owner_email=v.user.email if v.user else None,
        )
        scored.append(VendorMatchResult(vendor=vendor_out, distance_km=round(dist, 2), composite_score=round(score, 4)))

    scored.sort(key=lambda x: x.composite_score, reverse=True)
    return scored
