from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from app.database import get_db
from app.schemas import EventCreate, EventUpdate, EventOut
from app.auth import get_current_user, require_role
import app.models as models
from app.socket_manager import push_notification
import asyncio

router = APIRouter(prefix="/api/events", tags=["events"])


@router.post("", response_model=EventOut, status_code=201)
def create_event(data: EventCreate, db: Session = Depends(get_db),
                 current_user: models.User = Depends(require_role(models.UserType.organizer, models.UserType.admin))):
    event = models.Event(**data.model_dump(), user_id=current_user.id)
    db.add(event)
    db.commit()
    db.refresh(event)
    return event


@router.get("", response_model=List[EventOut])
def list_events(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    if current_user.user_type == models.UserType.admin:
        return db.query(models.Event).order_by(models.Event.event_date).all()
    return db.query(models.Event).filter(models.Event.user_id == current_user.id).order_by(models.Event.event_date).all()


@router.get("/{event_id}", response_model=EventOut)
def get_event(event_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    event = db.query(models.Event).filter(models.Event.id == event_id).first()
    if not event:
        raise HTTPException(404, "Event not found")
    if event.user_id != current_user.id and current_user.user_type != models.UserType.admin:
        raise HTTPException(403, "Not authorized")
    return event


@router.put("/{event_id}", response_model=EventOut)
def update_event(event_id: int, data: EventUpdate, db: Session = Depends(get_db),
                 current_user: models.User = Depends(get_current_user)):
    event = db.query(models.Event).filter(models.Event.id == event_id).first()
    if not event:
        raise HTTPException(404, "Event not found")
    if event.user_id != current_user.id and current_user.user_type != models.UserType.admin:
        raise HTTPException(403, "Not authorized")
    for k, v in data.model_dump(exclude_none=True).items():
        setattr(event, k, v)
    db.commit()
    db.refresh(event)
    return event


@router.delete("/{event_id}", status_code=204)
async def cancel_event(event_id: int, db: Session = Depends(get_db),
                       current_user: models.User = Depends(get_current_user)):
    event = db.query(models.Event).filter(models.Event.id == event_id).first()
    if not event:
        raise HTTPException(404, "Event not found")
    if event.user_id != current_user.id and current_user.user_type != models.UserType.admin:
        raise HTTPException(403, "Not authorized")
    event.status = models.EventStatus.cancelled
    # notify vendors with active bookings
    for booking in event.bookings:
        if booking.status in [models.BookingStatus.pending, models.BookingStatus.confirmed]:
            booking.status = models.BookingStatus.cancelled
            vendor_user_id = booking.vendor.user_id
            asyncio.create_task(push_notification(
                vendor_user_id,
                f"Event '{event.name}' has been cancelled.",
                "warning"
            ))
    db.commit()
