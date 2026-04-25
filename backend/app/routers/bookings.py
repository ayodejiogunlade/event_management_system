from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from app.database import get_db
from app.schemas import BookingCreate, BookingOut, BookingStatusUpdate
from app.auth import get_current_user
import app.models as models
from app.socket_manager import push_notification
import asyncio

router = APIRouter(prefix="/api/bookings", tags=["bookings"])


def _booking_out(b: models.Booking) -> dict:
    return BookingOut(
        id=b.id, event_id=b.event_id, vendor_id=b.vendor_id,
        booking_date=b.booking_date, status=b.status,
        service_details=b.service_details, created_at=b.created_at,
    )


@router.post("", response_model=BookingOut, status_code=201)
async def create_booking(data: BookingCreate, db: Session = Depends(get_db),
                         current_user: models.User = Depends(get_current_user)):
    if current_user.user_type != models.UserType.organizer:
        raise HTTPException(403, "Only organizers can create bookings")
    event = db.query(models.Event).filter(models.Event.id == data.event_id,
                                           models.Event.user_id == current_user.id).first()
    if not event:
        raise HTTPException(404, "Event not found")
    vendor = db.query(models.Vendor).filter(models.Vendor.id == data.vendor_id).first()
    if not vendor:
        raise HTTPException(404, "Vendor not found")
    if not vendor.is_verified:
        raise HTTPException(400, "Vendor not yet verified")

    booking = models.Booking(event_id=data.event_id, vendor_id=data.vendor_id,
                              service_details=data.service_details)
    db.add(booking)
    db.commit()
    db.refresh(booking)

    # Notify vendor
    asyncio.create_task(push_notification(
        vendor.user_id,
        f"New booking request for '{event.name}' on {event.event_date.strftime('%Y-%m-%d')}.",
        "booking_request"
    ))
    return _booking_out(booking)


@router.get("", response_model=List[BookingOut])
def list_bookings(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    if current_user.user_type == models.UserType.organizer:
        # All bookings for my events
        event_ids = [e.id for e in current_user.events]
        bookings = db.query(models.Booking).filter(models.Booking.event_id.in_(event_ids)).all()
    elif current_user.user_type == models.UserType.vendor:
        vendor = db.query(models.Vendor).filter(models.Vendor.user_id == current_user.id).first()
        bookings = db.query(models.Booking).filter(models.Booking.vendor_id == vendor.id).all() if vendor else []
    else:
        bookings = db.query(models.Booking).all()
    return [_booking_out(b) for b in bookings]


@router.get("/{booking_id}", response_model=BookingOut)
def get_booking(booking_id: int, db: Session = Depends(get_db),
                current_user: models.User = Depends(get_current_user)):
    b = db.query(models.Booking).filter(models.Booking.id == booking_id).first()
    if not b:
        raise HTTPException(404, "Booking not found")
    return _booking_out(b)


@router.put("/{booking_id}/status", response_model=BookingOut)
async def update_booking_status(booking_id: int, data: BookingStatusUpdate,
                                db: Session = Depends(get_db),
                                current_user: models.User = Depends(get_current_user)):
    b = db.query(models.Booking).filter(models.Booking.id == booking_id).first()
    if not b:
        raise HTTPException(404, "Booking not found")

    # Vendors can accept/decline; organizers can cancel
    if current_user.user_type == models.UserType.vendor:
        vendor = db.query(models.Vendor).filter(models.Vendor.user_id == current_user.id).first()
        if not vendor or b.vendor_id != vendor.id:
            raise HTTPException(403, "Not your booking")
        if data.status not in [models.BookingStatus.confirmed, models.BookingStatus.declined]:
            raise HTTPException(400, "Vendors can only confirm or decline")
    elif current_user.user_type == models.UserType.organizer:
        if b.event.user_id != current_user.id:
            raise HTTPException(403, "Not your event")
        if data.status != models.BookingStatus.cancelled:
            raise HTTPException(400, "Organizers can only cancel bookings")
    
    old_status = b.status
    b.status = data.status
    
    # If confirmed, auto-decline other pending bookings for same vendor+date
    if data.status == models.BookingStatus.confirmed:
        conflicts = db.query(models.Booking).join(models.Event).filter(
            models.Booking.vendor_id == b.vendor_id,
            models.Booking.id != b.id,
            models.Booking.status == models.BookingStatus.pending,
            models.Event.event_date == b.event.event_date,
        ).all()
        for c in conflicts:
            c.status = models.BookingStatus.declined

    db.commit()
    db.refresh(b)

    # Notify organizer
    organizer_id = b.event.organizer.id
    vendor_name = b.vendor.business_name
    event_name  = b.event.name
    notif_msg = {
        models.BookingStatus.confirmed: f"'{vendor_name}' confirmed your booking for '{event_name}'!",
        models.BookingStatus.declined:  f"'{vendor_name}' declined your booking request for '{event_name}'.",
        models.BookingStatus.cancelled: f"Booking for '{event_name}' was cancelled.",
    }.get(data.status)

    if notif_msg:
        if data.status == models.BookingStatus.cancelled and current_user.user_type == models.UserType.organizer:
            # Notify vendor of cancellation
            asyncio.create_task(push_notification(b.vendor.user_id, notif_msg, "warning"))
        else:
            asyncio.create_task(push_notification(organizer_id, notif_msg,
                                                   "success" if data.status == models.BookingStatus.confirmed else "warning"))

    # Persist notification to DB
    notif = models.Notification(
        user_id=organizer_id,
        message=notif_msg or f"Booking status updated to {data.status}",
        notification_type=data.status,
    )
    db.add(notif)
    db.commit()
    return _booking_out(b)
