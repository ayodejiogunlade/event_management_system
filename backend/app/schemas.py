from pydantic import BaseModel, EmailStr, field_validator
from typing import Optional, List
from datetime import datetime
from app.models import UserType, BookingStatus, EventStatus


# ── Auth ─────────────────────────────────────────────────────────────────────
class UserRegister(BaseModel):
    name: str
    email: EmailStr
    password: str
    phone_number: Optional[str] = None
    user_type: UserType = UserType.organizer

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class Token(BaseModel):
    access_token: str
    token_type: str
    user: dict

class UserOut(BaseModel):
    id: int
    name: str
    email: str
    phone_number: Optional[str]
    user_type: UserType
    is_active: bool
    created_at: datetime
    class Config: from_attributes = True

class UserUpdate(BaseModel):
    name: Optional[str] = None
    phone_number: Optional[str] = None
    password: Optional[str] = None


# ── Events ───────────────────────────────────────────────────────────────────
class EventCreate(BaseModel):
    name: str
    event_type: str
    event_date: datetime
    budget: Optional[float] = None
    location_address: Optional[str] = None
    location_lat: Optional[float] = None
    location_lng: Optional[float] = None
    required_services: Optional[str] = None
    description: Optional[str] = None

class EventUpdate(BaseModel):
    name: Optional[str] = None
    event_type: Optional[str] = None
    event_date: Optional[datetime] = None
    budget: Optional[float] = None
    location_address: Optional[str] = None
    location_lat: Optional[float] = None
    location_lng: Optional[float] = None
    required_services: Optional[str] = None
    description: Optional[str] = None
    status: Optional[EventStatus] = None

class EventOut(BaseModel):
    id: int
    name: str
    event_type: str
    event_date: datetime
    budget: Optional[float]
    status: EventStatus
    location_address: Optional[str]
    location_lat: Optional[float]
    location_lng: Optional[float]
    required_services: Optional[str]
    description: Optional[str]
    user_id: int
    created_at: datetime
    class Config: from_attributes = True


# ── Vendors ───────────────────────────────────────────────────────────────────
class LocationIn(BaseModel):
    address: Optional[str] = None
    latitude: float
    longitude: float

class VendorCreate(BaseModel):
    business_name: str
    service_type: str
    description: Optional[str] = None
    pricing: Optional[float] = None
    service_radius_km: Optional[float] = 50.0
    location: Optional[LocationIn] = None

class VendorUpdate(BaseModel):
    business_name: Optional[str] = None
    service_type: Optional[str] = None
    description: Optional[str] = None
    pricing: Optional[float] = None
    availability_status: Optional[bool] = None
    service_radius_km: Optional[float] = None
    location: Optional[LocationIn] = None

class LocationOut(BaseModel):
    id: int
    address: Optional[str]
    latitude: float
    longitude: float
    class Config: from_attributes = True

class VendorOut(BaseModel):
    id: int
    business_name: str
    service_type: str
    description: Optional[str]
    pricing: Optional[float]
    availability_status: bool
    rating: float
    rating_count: int
    service_radius_km: float
    is_verified: bool
    user_id: int
    created_at: datetime
    location: Optional[LocationOut] = None
    owner_name: Optional[str] = None
    owner_email: Optional[str] = None
    class Config: from_attributes = True


# ── Matching ──────────────────────────────────────────────────────────────────
class VendorMatchResult(BaseModel):
    vendor: VendorOut
    distance_km: float
    composite_score: float

class MatchQuery(BaseModel):
    service_type: str
    event_date: datetime
    budget: Optional[float] = None
    event_lat: float
    event_lng: float
    search_radius_km: float = 50.0


# ── Bookings ──────────────────────────────────────────────────────────────────
class BookingCreate(BaseModel):
    event_id: int
    vendor_id: int
    service_details: Optional[str] = None

class BookingOut(BaseModel):
    id: int
    event_id: int
    vendor_id: int
    booking_date: datetime
    status: BookingStatus
    service_details: Optional[str]
    created_at: datetime
    event: Optional[EventOut] = None
    vendor: Optional[VendorOut] = None
    class Config: from_attributes = True

class BookingStatusUpdate(BaseModel):
    status: BookingStatus


# ── Notifications ─────────────────────────────────────────────────────────────
class NotificationOut(BaseModel):
    id: int
    user_id: int
    message: str
    notification_type: Optional[str]
    is_read: bool
    created_at: datetime
    class Config: from_attributes = True


# ── Admin ─────────────────────────────────────────────────────────────────────
class AdminUserUpdate(BaseModel):
    is_active: Optional[bool] = None

class VendorVerify(BaseModel):
    is_verified: bool
