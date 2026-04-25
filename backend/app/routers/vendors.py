from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from app.database import get_db
from app.schemas import VendorCreate, VendorUpdate, VendorOut, LocationOut
from app.auth import get_current_user, require_role
import app.models as models

router = APIRouter(prefix="/api/vendors", tags=["vendors"])


def _to_vendor_out(v: models.Vendor) -> VendorOut:
    loc = None
    if v.location:
        loc = LocationOut(id=v.location.id, address=v.location.address,
                          latitude=float(v.location.latitude), longitude=float(v.location.longitude))
    return VendorOut(
        id=v.id, business_name=v.business_name, service_type=v.service_type,
        description=v.description,
        pricing=float(v.pricing) if v.pricing else None,
        availability_status=v.availability_status, rating=v.rating,
        rating_count=v.rating_count, service_radius_km=v.service_radius_km,
        is_verified=v.is_verified, user_id=v.user_id, created_at=v.created_at,
        location=loc,
        owner_name=v.user.name if v.user else None,
        owner_email=v.user.email if v.user else None,
    )


@router.post("", response_model=VendorOut, status_code=201)
def create_vendor(data: VendorCreate, db: Session = Depends(get_db),
                  current_user: models.User = Depends(require_role(models.UserType.vendor))):
    if db.query(models.Vendor).filter(models.Vendor.user_id == current_user.id).first():
        raise HTTPException(400, "Vendor profile already exists")
    payload = data.model_dump(exclude={"location"})
    vendor = models.Vendor(**payload, user_id=current_user.id)
    db.add(vendor)
    db.flush()
    if data.location:
        loc = models.Location(
            address=data.location.address,
            latitude=data.location.latitude,
            longitude=data.location.longitude,
            vendor_id=vendor.id,
        )
        db.add(loc)
    db.commit()
    db.refresh(vendor)
    return _to_vendor_out(vendor)


@router.get("", response_model=List[VendorOut])
def list_vendors(service_type: Optional[str] = None, verified_only: bool = False,
                 db: Session = Depends(get_db)):
    q = db.query(models.Vendor)
    if service_type:
        q = q.filter(models.Vendor.service_type == service_type)
    if verified_only:
        q = q.filter(models.Vendor.is_verified == True)
    return [_to_vendor_out(v) for v in q.all()]


@router.get("/me", response_model=VendorOut)
def my_vendor(db: Session = Depends(get_db),
              current_user: models.User = Depends(require_role(models.UserType.vendor))):
    v = db.query(models.Vendor).filter(models.Vendor.user_id == current_user.id).first()
    if not v:
        raise HTTPException(404, "Vendor profile not found")
    return _to_vendor_out(v)


@router.get("/{vendor_id}", response_model=VendorOut)
def get_vendor(vendor_id: int, db: Session = Depends(get_db)):
    v = db.query(models.Vendor).filter(models.Vendor.id == vendor_id).first()
    if not v:
        raise HTTPException(404, "Vendor not found")
    return _to_vendor_out(v)


@router.put("/me", response_model=VendorOut)
def update_vendor(data: VendorUpdate, db: Session = Depends(get_db),
                  current_user: models.User = Depends(require_role(models.UserType.vendor))):
    v = db.query(models.Vendor).filter(models.Vendor.user_id == current_user.id).first()
    if not v:
        raise HTTPException(404, "Vendor profile not found")
    payload = data.model_dump(exclude_none=True, exclude={"location"})
    for k, val in payload.items():
        setattr(v, k, val)
    if data.location:
        if v.location:
            v.location.address = data.location.address
            v.location.latitude = data.location.latitude
            v.location.longitude = data.location.longitude
        else:
            loc = models.Location(address=data.location.address, latitude=data.location.latitude,
                                   longitude=data.location.longitude, vendor_id=v.id)
            db.add(loc)
    db.commit()
    db.refresh(v)
    return _to_vendor_out(v)
