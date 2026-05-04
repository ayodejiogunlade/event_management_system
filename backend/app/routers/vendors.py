from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from app.database import get_db
from app.schemas import (VendorCreate, VendorUpdate, VendorOut, LocationOut,
                          VendorServiceCreate, VendorServiceUpdate, VendorServiceOut)
from app.auth import get_current_user, require_role
import app.models as models

router = APIRouter(prefix="/api/vendors", tags=["vendors"])


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


def _to_vendor_out(v: models.Vendor) -> VendorOut:
    loc = None
    if v.location:
        loc = LocationOut(
            id=v.location.id, address=v.location.address,
            latitude=float(v.location.latitude),
            longitude=float(v.location.longitude),
        )
    return VendorOut(
        id=v.id, business_name=v.business_name, description=v.description,
        availability_status=v.availability_status, rating=v.rating,
        rating_count=v.rating_count, service_radius_km=v.service_radius_km,
        is_verified=v.is_verified, service_limit=v.service_limit,
        user_id=v.user_id, created_at=v.created_at, location=loc,
        services=[_svc_out(s) for s in v.services if s.is_active],
        owner_name=v.user.name if v.user else None,
        owner_email=v.user.email if v.user else None,
    )


def _get_default_limit(db: Session) -> int:
    s = db.query(models.SystemSetting).filter(
        models.SystemSetting.key == "default_service_limit").first()
    return int(s.value) if s else 1


# ── Profile ────────────────────────────────────────────────────────────────────

@router.post("", response_model=VendorOut, status_code=201)
def create_vendor(data: VendorCreate, db: Session = Depends(get_db),
                  cu=Depends(require_role(models.UserType.vendor, models.UserType.admin))):
    if db.query(models.Vendor).filter(models.Vendor.user_id == cu.id).first():
        raise HTTPException(400, "Vendor profile already exists")
    default_limit = _get_default_limit(db)
    payload = data.model_dump(exclude={"location"})
    v = models.Vendor(**payload, user_id=cu.id, service_limit=default_limit)
    db.add(v)
    db.flush()
    if data.location:
        db.add(models.Location(
            address=data.location.address,
            latitude=data.location.latitude,
            longitude=data.location.longitude,
            vendor_id=v.id,
        ))
    db.commit()
    db.refresh(v)
    return _to_vendor_out(v)


@router.get("", response_model=List[VendorOut])
def list_vendors(service_category: Optional[str] = None, verified_only: bool = False,
                 db: Session = Depends(get_db)):
    q = db.query(models.Vendor)
    if verified_only:
        q = q.filter(models.Vendor.is_verified == True)
    vendors = q.all()
    if service_category:
        vendors = [v for v in vendors
                   if any(s.category_key == service_category for s in v.services)]
    return [_to_vendor_out(v) for v in vendors]


@router.get("/me", response_model=VendorOut)
def my_vendor(db: Session = Depends(get_db),
              cu=Depends(require_role(models.UserType.vendor, models.UserType.admin))):
    v = db.query(models.Vendor).filter(models.Vendor.user_id == cu.id).first()
    if not v:
        raise HTTPException(404, "Vendor profile not found")
    return _to_vendor_out(v)


@router.get("/{vid}", response_model=VendorOut)
def get_vendor(vid: int, db: Session = Depends(get_db)):
    v = db.query(models.Vendor).filter(models.Vendor.id == vid).first()
    if not v:
        raise HTTPException(404)
    return _to_vendor_out(v)


@router.put("/me", response_model=VendorOut)
def update_vendor(data: VendorUpdate, db: Session = Depends(get_db),
                  cu=Depends(require_role(models.UserType.vendor, models.UserType.admin))):
    v = db.query(models.Vendor).filter(models.Vendor.user_id == cu.id).first()
    if not v:
        raise HTTPException(404)
    for k, val in data.model_dump(exclude_none=True, exclude={"location"}).items():
        setattr(v, k, val)
    if data.location:
        if v.location:
            v.location.address   = data.location.address
            v.location.latitude  = data.location.latitude
            v.location.longitude = data.location.longitude
        else:
            db.add(models.Location(
                address=data.location.address,
                latitude=data.location.latitude,
                longitude=data.location.longitude,
                vendor_id=v.id,
            ))
    db.commit()
    db.refresh(v)
    return _to_vendor_out(v)


# ── Services ───────────────────────────────────────────────────────────────────

@router.post("/me/services", response_model=VendorServiceOut, status_code=201)
def add_service(data: VendorServiceCreate, db: Session = Depends(get_db),
                cu=Depends(require_role(models.UserType.vendor, models.UserType.admin))):
    v = db.query(models.Vendor).filter(models.Vendor.user_id == cu.id).first()
    if not v:
        raise HTTPException(404, "Create your vendor profile first")
    active_count = db.query(models.VendorService).filter(
        models.VendorService.vendor_id == v.id,
        models.VendorService.is_active == True,
    ).count()
    if v.service_limit != -1 and active_count >= v.service_limit:
        raise HTTPException(400, f"Service limit ({v.service_limit}) reached. Contact admin to upgrade.")
    svc = models.VendorService(**data.model_dump(), vendor_id=v.id)
    db.add(svc)
    db.commit()
    db.refresh(svc)
    return _svc_out(svc)


@router.get("/me/services", response_model=List[VendorServiceOut])
def list_my_services(db: Session = Depends(get_db),
                     cu=Depends(require_role(models.UserType.vendor, models.UserType.admin))):
    v = db.query(models.Vendor).filter(models.Vendor.user_id == cu.id).first()
    return [_svc_out(s) for s in v.services] if v else []


@router.put("/me/services/{sid}", response_model=VendorServiceOut)
def update_service(sid: int, data: VendorServiceUpdate, db: Session = Depends(get_db),
                   cu=Depends(require_role(models.UserType.vendor, models.UserType.admin))):
    v = db.query(models.Vendor).filter(models.Vendor.user_id == cu.id).first()
    svc = db.query(models.VendorService).filter(
        models.VendorService.id == sid,
        models.VendorService.vendor_id == v.id,
    ).first() if v else None
    if not svc:
        raise HTTPException(404)
    for k, val in data.model_dump(exclude_none=True).items():
        setattr(svc, k, val)
    db.commit()
    db.refresh(svc)
    return _svc_out(svc)


@router.delete("/me/services/{sid}", status_code=204)
def delete_service(sid: int, db: Session = Depends(get_db),
                   cu=Depends(require_role(models.UserType.vendor, models.UserType.admin))):
    v = db.query(models.Vendor).filter(models.Vendor.user_id == cu.id).first()
    svc = db.query(models.VendorService).filter(
        models.VendorService.id == sid,
        models.VendorService.vendor_id == v.id,
    ).first() if v else None
    if not svc:
        raise HTTPException(404)
    svc.is_active = False
    db.commit()
