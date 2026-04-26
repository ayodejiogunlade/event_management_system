from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, Text, Enum, ForeignKey, DECIMAL, JSON
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import enum
from app.database import Base


class UserType(str, enum.Enum):
    organizer = "organizer"
    vendor    = "vendor"
    admin     = "admin"


class BookingStatus(str, enum.Enum):
    pending   = "pending"
    confirmed = "confirmed"
    declined  = "declined"
    cancelled = "cancelled"
    completed = "completed"


class EventStatus(str, enum.Enum):
    draft     = "draft"
    active    = "active"
    completed = "completed"
    cancelled = "cancelled"


# ── Configurable lookup tables (admin-managed) ────────────────────────────────
class ServiceCategoryDef(Base):
    """Admin-managed service categories (replaces hard-coded enum)."""
    __tablename__ = "service_category_defs"
    id          = Column(Integer, primary_key=True, index=True)
    key         = Column(String(80), unique=True, nullable=False)
    label       = Column(String(150), nullable=False)
    description = Column(Text)
    icon        = Column(String(10), default="🛎️")
    is_active   = Column(Boolean, default=True)
    sort_order  = Column(Integer, default=0)
    # Service-specific fields schema stored as JSON
    info_fields = Column(JSON, nullable=True)
    created_at  = Column(DateTime(timezone=True), server_default=func.now())


class PricingModelDef(Base):
    """Admin-managed pricing models."""
    __tablename__ = "pricing_model_defs"
    id          = Column(Integer, primary_key=True, index=True)
    key         = Column(String(80), unique=True, nullable=False)
    label       = Column(String(150), nullable=False)
    description = Column(Text)
    is_active   = Column(Boolean, default=True)
    created_at  = Column(DateTime(timezone=True), server_default=func.now())


class SystemSetting(Base):
    """Key-value store for platform-wide settings."""
    __tablename__ = "system_settings"
    id         = Column(Integer, primary_key=True, index=True)
    key        = Column(String(100), unique=True, nullable=False)
    value      = Column(Text, nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


# ── Core tables ───────────────────────────────────────────────────────────────
class User(Base):
    __tablename__ = "users"
    id            = Column(Integer, primary_key=True, index=True)
    name          = Column(String(150), nullable=False)
    email         = Column(String(255), unique=True, index=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    phone_number  = Column(String(20))
    user_type     = Column(Enum(UserType), nullable=False, default=UserType.organizer)
    is_active     = Column(Boolean, default=True)
    created_at    = Column(DateTime(timezone=True), server_default=func.now())

    events         = relationship("Event",        back_populates="organizer",     cascade="all, delete-orphan")
    vendor_profile = relationship("Vendor",       back_populates="user",          uselist=False, cascade="all, delete-orphan")
    notifications  = relationship("Notification", back_populates="user",          cascade="all, delete-orphan")


class Location(Base):
    __tablename__ = "locations"
    id        = Column(Integer, primary_key=True, index=True)
    address   = Column(String(500))
    latitude  = Column(DECIMAL(9, 6), nullable=False)
    longitude = Column(DECIMAL(9, 6), nullable=False)
    vendor_id = Column(Integer, ForeignKey("vendors.id"), nullable=True)

    vendor = relationship("Vendor", back_populates="location", foreign_keys=[vendor_id])


class Event(Base):
    __tablename__ = "events"
    id                = Column(Integer, primary_key=True, index=True)
    name              = Column(String(255), nullable=False)
    event_type        = Column(String(100), nullable=False)
    event_date        = Column(DateTime(timezone=True), nullable=False)
    budget            = Column(DECIMAL(12, 2))
    attendee_count    = Column(Integer, nullable=True)
    status            = Column(Enum(EventStatus), default=EventStatus.active)
    location_address  = Column(String(500))
    location_lat      = Column(DECIMAL(9, 6))
    location_lng      = Column(DECIMAL(9, 6))
    required_services = Column(Text)
    description       = Column(Text)
    user_id           = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at        = Column(DateTime(timezone=True), server_default=func.now())

    organizer = relationship("User",    back_populates="events")
    bookings  = relationship("Booking", back_populates="event", cascade="all, delete-orphan")


class Vendor(Base):
    __tablename__ = "vendors"
    id                = Column(Integer, primary_key=True, index=True)
    business_name     = Column(String(255), nullable=False)
    description       = Column(Text)
    availability_status = Column(Boolean, default=True)
    rating            = Column(Float, default=0.0)
    rating_count      = Column(Integer, default=0)
    service_radius_km = Column(Float, default=50.0)
    is_verified       = Column(Boolean, default=False)
    service_limit     = Column(Integer, default=1)   # -1 = unlimited
    user_id           = Column(Integer, ForeignKey("users.id"), nullable=False, unique=True)
    created_at        = Column(DateTime(timezone=True), server_default=func.now())

    user      = relationship("User",          back_populates="vendor_profile")
    bookings  = relationship("Booking",       back_populates="vendor")
    services  = relationship("VendorService", back_populates="vendor", cascade="all, delete-orphan")
    location  = relationship("Location",      back_populates="vendor", uselist=False,
                             foreign_keys="Location.vendor_id", cascade="all, delete-orphan")


class VendorService(Base):
    __tablename__ = "vendor_services"
    id             = Column(Integer, primary_key=True, index=True)
    vendor_id      = Column(Integer, ForeignKey("vendors.id"), nullable=False)
    service_name   = Column(String(255), nullable=False)
    category_key   = Column(String(80),  nullable=False)   # FK-like to ServiceCategoryDef.key
    description    = Column(Text)
    pricing_model_key = Column(String(80), nullable=False, default="fixed_fee")

    fixed_price     = Column(DECIMAL(12, 2), nullable=True)
    price_per_head  = Column(DECIMAL(12, 2), nullable=True)
    min_guests      = Column(Integer, nullable=True)
    percentage_rate = Column(Float,  nullable=True)
    hourly_rate     = Column(DECIMAL(12, 2), nullable=True)
    min_hours       = Column(Float,  nullable=True)
    deposit_percent = Column(Float,  default=50.0)
    vat_applicable  = Column(Boolean, default=True)
    is_active       = Column(Boolean, default=True)

    # service-specific extra info (capacity for venues, cuisine for caterers, etc.)
    extra_info      = Column(JSON, nullable=True)
    created_at      = Column(DateTime(timezone=True), server_default=func.now())

    vendor = relationship("Vendor", back_populates="services")


class Booking(Base):
    __tablename__ = "bookings"
    id                = Column(Integer, primary_key=True, index=True)
    event_id          = Column(Integer, ForeignKey("events.id"), nullable=False)
    vendor_id         = Column(Integer, ForeignKey("vendors.id"), nullable=False)
    vendor_service_id = Column(Integer, ForeignKey("vendor_services.id"), nullable=True)
    booking_date      = Column(DateTime(timezone=True), server_default=func.now())
    status            = Column(Enum(BookingStatus), default=BookingStatus.pending)
    service_details   = Column(Text)
    guest_count       = Column(Integer, nullable=True)
    agreed_price      = Column(DECIMAL(12, 2), nullable=True)
    created_at        = Column(DateTime(timezone=True), server_default=func.now())

    event          = relationship("Event",         back_populates="bookings")
    vendor         = relationship("Vendor",        back_populates="bookings")
    vendor_service = relationship("VendorService")


class Notification(Base):
    __tablename__ = "notifications"
    id                = Column(Integer, primary_key=True, index=True)
    user_id           = Column(Integer, ForeignKey("users.id"), nullable=False)
    message           = Column(Text, nullable=False)
    notification_type = Column(String(50))
    is_read           = Column(Boolean, default=False)
    created_at        = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", back_populates="notifications")
