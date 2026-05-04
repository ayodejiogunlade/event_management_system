from pydantic import BaseModel, EmailStr
from typing import Optional, List, Any, Dict
from datetime import datetime
from app.models import UserType, BookingStatus, EventStatus


# ── Auth ──────────────────────────────────────────────────────────────────────

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
    class Config:
        from_attributes = True

class UserUpdate(BaseModel):
    name: Optional[str] = None
    phone_number: Optional[str] = None
    password: Optional[str] = None


# ── Admin-managed lookups ─────────────────────────────────────────────────────

class CategoryDefOut(BaseModel):
    id: int
    key: str
    label: str
    description: Optional[str]
    icon: str
    is_active: bool
    sort_order: int
    info_fields: Optional[Any]
    class Config:
        from_attributes = True

class CategoryDefCreate(BaseModel):
    key: str
    label: str
    description: Optional[str] = None
    icon: Optional[str] = "🛎️"
    sort_order: Optional[int] = 0
    info_fields: Optional[Any] = None

class CategoryDefUpdate(BaseModel):
    label: Optional[str] = None
    description: Optional[str] = None
    icon: Optional[str] = None
    sort_order: Optional[int] = None
    info_fields: Optional[Any] = None
    is_active: Optional[bool] = None

class PricingModelDefOut(BaseModel):
    id: int
    key: str
    label: str
    description: Optional[str]
    is_active: bool
    class Config:
        from_attributes = True

class PricingModelDefCreate(BaseModel):
    key: str
    label: str
    description: Optional[str] = None

class PricingModelDefUpdate(BaseModel):
    label: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None


# ── Events ────────────────────────────────────────────────────────────────────

class EventCreate(BaseModel):
    name: str
    event_type: str
    event_date: datetime
    budget: Optional[float] = None
    attendee_count: Optional[int] = None
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
    attendee_count: Optional[int] = None
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
    attendee_count: Optional[int]
    status: EventStatus
    location_address: Optional[str]
    location_lat: Optional[float]
    location_lng: Optional[float]
    required_services: Optional[str]
    description: Optional[str]
    user_id: int
    created_at: datetime
    class Config:
        from_attributes = True


# ── Vendor services ───────────────────────────────────────────────────────────

class VendorServiceCreate(BaseModel):
    service_name: str
    category_key: str
    description: Optional[str] = None
    pricing_model_key: str = "fixed_fee"
    fixed_price: Optional[float] = None
    price_per_head: Optional[float] = None
    min_guests: Optional[int] = None
    percentage_rate: Optional[float] = None
    hourly_rate: Optional[float] = None
    min_hours: Optional[float] = None
    deposit_percent: Optional[float] = 50.0
    vat_applicable: Optional[bool] = True
    extra_info: Optional[Dict[str, Any]] = None

class VendorServiceUpdate(BaseModel):
    service_name: Optional[str] = None
    category_key: Optional[str] = None
    description: Optional[str] = None
    pricing_model_key: Optional[str] = None
    fixed_price: Optional[float] = None
    price_per_head: Optional[float] = None
    min_guests: Optional[int] = None
    percentage_rate: Optional[float] = None
    hourly_rate: Optional[float] = None
    min_hours: Optional[float] = None
    deposit_percent: Optional[float] = None
    vat_applicable: Optional[bool] = None
    extra_info: Optional[Dict[str, Any]] = None
    is_active: Optional[bool] = None

class VendorServiceOut(BaseModel):
    id: int
    vendor_id: int
    service_name: str
    category_key: str
    description: Optional[str]
    pricing_model_key: str
    fixed_price: Optional[float]
    price_per_head: Optional[float]
    min_guests: Optional[int]
    percentage_rate: Optional[float]
    hourly_rate: Optional[float]
    min_hours: Optional[float]
    deposit_percent: float
    vat_applicable: bool
    is_active: bool
    extra_info: Optional[Dict[str, Any]]
    created_at: datetime
    class Config:
        from_attributes = True


# ── Vendors ───────────────────────────────────────────────────────────────────

class LocationIn(BaseModel):
    address: Optional[str] = None
    latitude: float
    longitude: float

class VendorCreate(BaseModel):
    business_name: str
    description: Optional[str] = None
    service_radius_km: Optional[float] = 50.0
    location: Optional[LocationIn] = None

class VendorUpdate(BaseModel):
    business_name: Optional[str] = None
    description: Optional[str] = None
    availability_status: Optional[bool] = None
    service_radius_km: Optional[float] = None
    location: Optional[LocationIn] = None

class LocationOut(BaseModel):
    id: int
    address: Optional[str]
    latitude: float
    longitude: float
    class Config:
        from_attributes = True

class VendorOut(BaseModel):
    id: int
    business_name: str
    description: Optional[str]
    availability_status: bool
    rating: float
    rating_count: int
    service_radius_km: float
    is_verified: bool
    service_limit: int
    user_id: int
    created_at: datetime
    location: Optional[LocationOut] = None
    services: List[VendorServiceOut] = []
    owner_name: Optional[str] = None
    owner_email: Optional[str] = None
    class Config:
        from_attributes = True


# ── Multi-service budget planner ──────────────────────────────────────────────

class ServiceRequest(BaseModel):
    category_key: str
    budget_percent: float
    extra_info: Optional[Dict[str, Any]] = None

class PlannerQuery(BaseModel):
    event_date: datetime
    total_budget: float
    attendee_count: int
    event_lat: float
    event_lng: float
    search_radius_km: float = 50.0
    services: List[ServiceRequest]

class MatchedVendor(BaseModel):
    vendor_id: int
    vendor_name: str
    address: str
    service_name: str
    category_key: str
    category_label: str
    pricing_model: str
    price: float
    distance_km: float
    rating: float
    deposit_percent: float
    vat_applicable: bool
    extra_info: Optional[Dict[str, Any]] = None

class BudgetPackage(BaseModel):
    package_number: int
    vendors: List[MatchedVendor]
    total_cost: float
    total_budget: float
    savings: float

# Legacy single-service match
class VendorMatchResult(BaseModel):
    vendor: VendorOut
    distance_km: float
    composite_score: float
    matched_service: Optional[VendorServiceOut] = None

class MatchQuery(BaseModel):
    service_category: str
    event_date: datetime
    budget: Optional[float] = None
    event_lat: float
    event_lng: float
    search_radius_km: float = 50.0


# ── Bookings ──────────────────────────────────────────────────────────────────

class BookingCreate(BaseModel):
    event_id: int
    vendor_id: int
    vendor_service_id: Optional[int] = None
    service_details: Optional[str] = None
    guest_count: Optional[int] = None
    agreed_price: Optional[float] = None

class BookingOut(BaseModel):
    id: int
    event_id: int
    vendor_id: int
    vendor_service_id: Optional[int]
    booking_date: datetime
    status: BookingStatus
    service_details: Optional[str]
    guest_count: Optional[int]
    agreed_price: Optional[float]
    created_at: datetime
    class Config:
        from_attributes = True

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
    class Config:
        from_attributes = True


# ── Admin controls ────────────────────────────────────────────────────────────

class AdminUserUpdate(BaseModel):
    is_active: Optional[bool] = None

class VendorVerify(BaseModel):
    is_verified: bool

class VendorServiceLimitUpdate(BaseModel):
    service_limit: int

class DefaultServiceLimitUpdate(BaseModel):
    value: int
