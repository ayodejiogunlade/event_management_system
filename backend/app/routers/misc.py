from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from app.database import get_db
from app.schemas import MatchQuery, VendorMatchResult, NotificationOut, VendorVerify, AdminUserUpdate, UserOut
from app.auth import get_current_user, require_role
from app.matching import match_vendors
import app.models as models

# ── Matching ──────────────────────────────────────────────────────────────────
matching_router = APIRouter(prefix="/api/match", tags=["matching"])

@matching_router.post("", response_model=List[VendorMatchResult])
def run_matching(query: MatchQuery, db: Session = Depends(get_db),
                 current_user: models.User = Depends(get_current_user)):
    return match_vendors(db, query)


# ── Notifications ─────────────────────────────────────────────────────────────
notif_router = APIRouter(prefix="/api/notifications", tags=["notifications"])

@notif_router.get("", response_model=List[NotificationOut])
def get_notifications(db: Session = Depends(get_db),
                      current_user: models.User = Depends(get_current_user)):
    return db.query(models.Notification).filter(
        models.Notification.user_id == current_user.id
    ).order_by(models.Notification.created_at.desc()).limit(50).all()

@notif_router.put("/read-all", status_code=204)
def mark_all_read(db: Session = Depends(get_db),
                  current_user: models.User = Depends(get_current_user)):
    db.query(models.Notification).filter(
        models.Notification.user_id == current_user.id,
        models.Notification.is_read == False
    ).update({"is_read": True})
    db.commit()

@notif_router.put("/{notif_id}/read", status_code=204)
def mark_read(notif_id: int, db: Session = Depends(get_db),
              current_user: models.User = Depends(get_current_user)):
    n = db.query(models.Notification).filter(
        models.Notification.id == notif_id,
        models.Notification.user_id == current_user.id
    ).first()
    if n:
        n.is_read = True
        db.commit()


# ── Admin ─────────────────────────────────────────────────────────────────────
admin_router = APIRouter(prefix="/api/admin", tags=["admin"])

def admin_only(current_user: models.User = Depends(get_current_user)):
    if current_user.user_type != models.UserType.admin:
        raise HTTPException(403, "Admin access required")
    return current_user

@admin_router.get("/users", response_model=List[UserOut])
def list_users(db: Session = Depends(get_db), _=Depends(admin_only)):
    return db.query(models.User).order_by(models.User.created_at.desc()).all()

@admin_router.put("/users/{user_id}", response_model=UserOut)
def update_user(user_id: int, data: AdminUserUpdate, db: Session = Depends(get_db), _=Depends(admin_only)):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(404, "User not found")
    if data.is_active is not None:
        user.is_active = data.is_active
    db.commit()
    db.refresh(user)
    return user

@admin_router.put("/vendors/{vendor_id}/verify")
def verify_vendor(vendor_id: int, data: VendorVerify, db: Session = Depends(get_db), _=Depends(admin_only)):
    v = db.query(models.Vendor).filter(models.Vendor.id == vendor_id).first()
    if not v:
        raise HTTPException(404, "Vendor not found")
    v.is_verified = data.is_verified
    db.commit()
    return {"vendor_id": vendor_id, "is_verified": v.is_verified}

@admin_router.get("/stats")
def get_stats(db: Session = Depends(get_db), _=Depends(admin_only)):
    return {
        "total_users": db.query(models.User).count(),
        "total_vendors": db.query(models.Vendor).count(),
        "verified_vendors": db.query(models.Vendor).filter(models.Vendor.is_verified == True).count(),
        "pending_vendors": db.query(models.Vendor).filter(models.Vendor.is_verified == False).count(),
        "total_events": db.query(models.Event).count(),
        "total_bookings": db.query(models.Booking).count(),
        "confirmed_bookings": db.query(models.Booking).filter(models.Booking.status == models.BookingStatus.confirmed).count(),
    }
