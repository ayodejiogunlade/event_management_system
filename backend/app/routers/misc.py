from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from app.database import get_db
from app.schemas import (
    MatchQuery, VendorMatchResult, PlannerQuery, BudgetPackage,
    NotificationOut, VendorVerify, AdminUserUpdate, UserOut,
    VendorServiceLimitUpdate, DefaultServiceLimitUpdate,
    CategoryDefOut, CategoryDefCreate, CategoryDefUpdate,
    PricingModelDefOut, PricingModelDefCreate, PricingModelDefUpdate,
)
from app.auth import get_current_user
from app.matching import match_vendors, plan_event
import app.models as models

# ── Planner ───────────────────────────────────────────────────────────────────
planner_router = APIRouter(prefix="/api/planner", tags=["planner"])

@planner_router.post("", response_model=List[BudgetPackage])
def run_planner(query: PlannerQuery, db: Session = Depends(get_db),
                _=Depends(get_current_user)):
    total_pct = sum(s.budget_percent for s in query.services)
    if abs(total_pct - 100.0) > 0.5:
        raise HTTPException(400, f"Budget percentages must sum to 100% (got {total_pct:.1f}%)")
    return plan_event(db, query)


# ── Legacy single-service match ───────────────────────────────────────────────
matching_router = APIRouter(prefix="/api/match", tags=["matching"])

@matching_router.post("", response_model=List[VendorMatchResult])
def run_matching(query: MatchQuery, db: Session = Depends(get_db),
                 _=Depends(get_current_user)):
    return match_vendors(db, query)


# ── Meta ──────────────────────────────────────────────────────────────────────
meta_router = APIRouter(prefix="/api/meta", tags=["meta"])

@meta_router.get("/service-categories", response_model=List[CategoryDefOut])
def service_categories(db: Session = Depends(get_db)):
    return (db.query(models.ServiceCategoryDef)
              .filter(models.ServiceCategoryDef.is_active == True)
              .order_by(models.ServiceCategoryDef.sort_order, models.ServiceCategoryDef.label)
              .all())

@meta_router.get("/pricing-models", response_model=List[PricingModelDefOut])
def pricing_models(db: Session = Depends(get_db)):
    return (db.query(models.PricingModelDef)
              .filter(models.PricingModelDef.is_active == True)
              .all())

@meta_router.get("/default-service-limit")
def get_default_limit(db: Session = Depends(get_db)):
    s = db.query(models.SystemSetting).filter(
        models.SystemSetting.key == "default_service_limit").first()
    return {"default_service_limit": int(s.value) if s else 1}


# ── Notifications ─────────────────────────────────────────────────────────────
notif_router = APIRouter(prefix="/api/notifications", tags=["notifications"])

@notif_router.get("", response_model=List[NotificationOut])
def get_notifications(db: Session = Depends(get_db), cu=Depends(get_current_user)):
    return (db.query(models.Notification)
              .filter(models.Notification.user_id == cu.id)
              .order_by(models.Notification.created_at.desc())
              .limit(50).all())

@notif_router.put("/read-all", status_code=204)
def mark_all_read(db: Session = Depends(get_db), cu=Depends(get_current_user)):
    (db.query(models.Notification)
       .filter(models.Notification.user_id == cu.id,
               models.Notification.is_read == False)
       .update({"is_read": True}))
    db.commit()

@notif_router.put("/{notif_id}/read", status_code=204)
def mark_read(notif_id: int, db: Session = Depends(get_db), cu=Depends(get_current_user)):
    n = db.query(models.Notification).filter(
        models.Notification.id == notif_id,
        models.Notification.user_id == cu.id,
    ).first()
    if n:
        n.is_read = True
        db.commit()


# ── Admin ─────────────────────────────────────────────────────────────────────
admin_router = APIRouter(prefix="/api/admin", tags=["admin"])

def admin_only(cu=Depends(get_current_user)):
    if cu.user_type != models.UserType.admin:
        raise HTTPException(403, "Admin access required")
    return cu

@admin_router.get("/stats")
def get_stats(db: Session = Depends(get_db), _=Depends(admin_only)):
    return {
        "total_users":        db.query(models.User).count(),
        "total_vendors":      db.query(models.Vendor).count(),
        "verified_vendors":   db.query(models.Vendor).filter(models.Vendor.is_verified == True).count(),
        "pending_vendors":    db.query(models.Vendor).filter(models.Vendor.is_verified == False).count(),
        "total_events":       db.query(models.Event).count(),
        "total_bookings":     db.query(models.Booking).count(),
        "confirmed_bookings": db.query(models.Booking).filter(
            models.Booking.status == models.BookingStatus.confirmed).count(),
        "total_services":     db.query(models.VendorService).filter(
            models.VendorService.is_active == True).count(),
    }

@admin_router.get("/users", response_model=List[UserOut])
def list_users(db: Session = Depends(get_db), _=Depends(admin_only)):
    return db.query(models.User).order_by(models.User.created_at.desc()).all()

@admin_router.put("/users/{uid}", response_model=UserOut)
def update_user(uid: int, data: AdminUserUpdate, db: Session = Depends(get_db),
                _=Depends(admin_only)):
    u = db.query(models.User).filter(models.User.id == uid).first()
    if not u:
        raise HTTPException(404, "User not found")
    if data.is_active is not None:
        u.is_active = data.is_active
    db.commit()
    db.refresh(u)
    return u

@admin_router.get("/vendors")
def admin_list_vendors(db: Session = Depends(get_db), _=Depends(admin_only)):
    from app.routers.vendors import _to_vendor_out
    return [_to_vendor_out(v) for v in db.query(models.Vendor).all()]

@admin_router.get("/vendors/{vid}")
def admin_get_vendor(vid: int, db: Session = Depends(get_db), _=Depends(admin_only)):
    from app.routers.vendors import _to_vendor_out
    v = db.query(models.Vendor).filter(models.Vendor.id == vid).first()
    if not v:
        raise HTTPException(404)
    return _to_vendor_out(v)

@admin_router.put("/vendors/{vid}/verify")
def verify_vendor(vid: int, data: VendorVerify, db: Session = Depends(get_db),
                  _=Depends(admin_only)):
    v = db.query(models.Vendor).filter(models.Vendor.id == vid).first()
    if not v:
        raise HTTPException(404)
    v.is_verified = data.is_verified
    db.commit()
    return {"vendor_id": vid, "is_verified": v.is_verified}

@admin_router.put("/vendors/{vid}/service-limit")
def update_service_limit(vid: int, data: VendorServiceLimitUpdate,
                          db: Session = Depends(get_db), _=Depends(admin_only)):
    if data.service_limit not in [1, 3, 5, -1]:
        raise HTTPException(400, "Must be 1, 3, 5, or -1")
    v = db.query(models.Vendor).filter(models.Vendor.id == vid).first()
    if not v:
        raise HTTPException(404)
    v.service_limit = data.service_limit
    db.commit()
    return {"vendor_id": vid, "service_limit": data.service_limit}

@admin_router.get("/events")
def admin_list_events(db: Session = Depends(get_db), _=Depends(admin_only)):
    events = db.query(models.Event).order_by(models.Event.event_date.desc()).all()
    result = []
    for e in events:
        bc = db.query(models.Booking).filter(models.Booking.event_id == e.id).count()
        result.append({
            "id": e.id, "name": e.name, "event_type": e.event_type,
            "event_date": e.event_date.isoformat(),
            "budget": float(e.budget) if e.budget else None,
            "attendee_count": e.attendee_count,
            "status": e.status,
            "location_address": e.location_address,
            "location_lat": float(e.location_lat) if e.location_lat else None,
            "location_lng": float(e.location_lng) if e.location_lng else None,
            "description": e.description, "required_services": e.required_services,
            "user_id": e.user_id,
            "organizer_name":  e.organizer.name  if e.organizer else None,
            "organizer_email": e.organizer.email if e.organizer else None,
            "booking_count": bc,
            "created_at": e.created_at.isoformat(),
        })
    return result

@admin_router.get("/bookings")
def admin_list_bookings(db: Session = Depends(get_db), _=Depends(admin_only)):
    bookings = db.query(models.Booking).order_by(models.Booking.created_at.desc()).all()
    result = []
    for b in bookings:
        svc = b.vendor_service
        result.append({
            "id": b.id, "status": b.status,
            "event_id": b.event_id,
            "event_name": b.event.name if b.event else None,
            "event_date": b.event.event_date.isoformat() if b.event else None,
            "organizer_name": b.event.organizer.name if b.event and b.event.organizer else None,
            "vendor_id": b.vendor_id,
            "vendor_name": b.vendor.business_name if b.vendor else None,
            "vendor_service": svc.service_name if svc else None,
            "service_category": svc.category_key if svc else None,
            "pricing_model": svc.pricing_model_key if svc else None,
            "guest_count": b.guest_count,
            "agreed_price": float(b.agreed_price) if b.agreed_price else None,
            "service_details": b.service_details,
            "booking_date": b.booking_date.isoformat(),
            "created_at": b.created_at.isoformat(),
        })
    return result

# ── Admin: Categories ─────────────────────────────────────────────────────────
@admin_router.get("/categories", response_model=List[CategoryDefOut])
def list_categories(db: Session = Depends(get_db), _=Depends(admin_only)):
    return db.query(models.ServiceCategoryDef).order_by(
        models.ServiceCategoryDef.sort_order).all()

@admin_router.post("/categories", response_model=CategoryDefOut, status_code=201)
def create_category(data: CategoryDefCreate, db: Session = Depends(get_db),
                    _=Depends(admin_only)):
    if db.query(models.ServiceCategoryDef).filter(
            models.ServiceCategoryDef.key == data.key).first():
        raise HTTPException(400, "Category key already exists")
    c = models.ServiceCategoryDef(**data.model_dump())
    db.add(c)
    db.commit()
    db.refresh(c)
    return c

@admin_router.put("/categories/{cid}", response_model=CategoryDefOut)
def update_category(cid: int, data: CategoryDefUpdate, db: Session = Depends(get_db),
                    _=Depends(admin_only)):
    c = db.query(models.ServiceCategoryDef).filter(
        models.ServiceCategoryDef.id == cid).first()
    if not c:
        raise HTTPException(404)
    for k, v in data.model_dump(exclude_none=True).items():
        setattr(c, k, v)
    db.commit()
    db.refresh(c)
    return c

# ── Admin: Pricing models ─────────────────────────────────────────────────────
@admin_router.get("/pricing-models", response_model=List[PricingModelDefOut])
def list_pricing_models(db: Session = Depends(get_db), _=Depends(admin_only)):
    return db.query(models.PricingModelDef).all()

@admin_router.post("/pricing-models", response_model=PricingModelDefOut, status_code=201)
def create_pricing_model(data: PricingModelDefCreate, db: Session = Depends(get_db),
                         _=Depends(admin_only)):
    if db.query(models.PricingModelDef).filter(
            models.PricingModelDef.key == data.key).first():
        raise HTTPException(400, "Pricing model key already exists")
    p = models.PricingModelDef(**data.model_dump())
    db.add(p)
    db.commit()
    db.refresh(p)
    return p

@admin_router.put("/pricing-models/{pid}", response_model=PricingModelDefOut)
def update_pricing_model(pid: int, data: PricingModelDefUpdate,
                          db: Session = Depends(get_db), _=Depends(admin_only)):
    p = db.query(models.PricingModelDef).filter(models.PricingModelDef.id == pid).first()
    if not p:
        raise HTTPException(404)
    for k, v in data.model_dump(exclude_none=True).items():
        setattr(p, k, v)
    db.commit()
    db.refresh(p)
    return p

# ── Admin: Default service limit ──────────────────────────────────────────────
@admin_router.put("/settings/default-service-limit")
def set_default_limit(data: DefaultServiceLimitUpdate,
                       db: Session = Depends(get_db), _=Depends(admin_only)):
    if data.value not in [1, 3, 5, -1]:
        raise HTTPException(400, "Must be 1, 3, 5, or -1")
    s = db.query(models.SystemSetting).filter(
        models.SystemSetting.key == "default_service_limit").first()
    if s:
        s.value = str(data.value)
    else:
        db.add(models.SystemSetting(key="default_service_limit", value=str(data.value)))
    db.commit()
    return {"default_service_limit": data.value}
