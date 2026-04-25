from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, Text, Enum, ForeignKey, DECIMAL
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import enum
from app.database import Base


class UserType(str, enum.Enum):
    organizer = "organizer"
    vendor = "vendor"
    admin = "admin"


class BookingStatus(str, enum.Enum):
    pending = "pending"
    confirmed = "confirmed"
    declined = "declined"
    cancelled = "cancelled"
    completed = "completed"


class EventStatus(str, enum.Enum):
    draft = "draft"
    active = "active"
    completed = "completed"
    cancelled = "cancelled"


class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(150), nullable=False)
    email = Column(String(255), unique=True, index=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    phone_number = Column(String(20))
    user_type = Column(Enum(UserType), nullable=False, default=UserType.organizer)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    events = relationship("Event", back_populates="organizer", cascade="all, delete-orphan")
    vendor_profile = relationship("Vendor", back_populates="user", uselist=False, cascade="all, delete-orphan")
    notifications = relationship("Notification", back_populates="user", cascade="all, delete-orphan")


class Location(Base):
    __tablename__ = "locations"
    id = Column(Integer, primary_key=True, index=True)
    address = Column(String(500))
    latitude = Column(DECIMAL(9, 6), nullable=False)
    longitude = Column(DECIMAL(9, 6), nullable=False)
    vendor_id = Column(Integer, ForeignKey("vendors.id"), nullable=True)

    vendor = relationship("Vendor", back_populates="location", foreign_keys=[vendor_id])


class Event(Base):
    __tablename__ = "events"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    event_type = Column(String(100), nullable=False)
    event_date = Column(DateTime(timezone=True), nullable=False)
    budget = Column(DECIMAL(12, 2))
    status = Column(Enum(EventStatus), default=EventStatus.active)
    location_address = Column(String(500))
    location_lat = Column(DECIMAL(9, 6))
    location_lng = Column(DECIMAL(9, 6))
    required_services = Column(Text)  # JSON string
    description = Column(Text)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    organizer = relationship("User", back_populates="events")
    bookings = relationship("Booking", back_populates="event", cascade="all, delete-orphan")


class Vendor(Base):
    __tablename__ = "vendors"
    id = Column(Integer, primary_key=True, index=True)
    business_name = Column(String(255), nullable=False)
    service_type = Column(String(100), nullable=False)
    description = Column(Text)
    pricing = Column(DECIMAL(12, 2))
    availability_status = Column(Boolean, default=True)
    rating = Column(Float, default=0.0)
    rating_count = Column(Integer, default=0)
    service_radius_km = Column(Float, default=50.0)
    is_verified = Column(Boolean, default=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, unique=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", back_populates="vendor_profile")
    bookings = relationship("Booking", back_populates="vendor")
    location = relationship("Location", back_populates="vendor", uselist=False,
                            foreign_keys="Location.vendor_id", cascade="all, delete-orphan")


class Booking(Base):
    __tablename__ = "bookings"
    id = Column(Integer, primary_key=True, index=True)
    event_id = Column(Integer, ForeignKey("events.id"), nullable=False)
    vendor_id = Column(Integer, ForeignKey("vendors.id"), nullable=False)
    booking_date = Column(DateTime(timezone=True), server_default=func.now())
    status = Column(Enum(BookingStatus), default=BookingStatus.pending)
    service_details = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    event = relationship("Event", back_populates="bookings")
    vendor = relationship("Vendor", back_populates="bookings")


class Notification(Base):
    __tablename__ = "notifications"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    message = Column(Text, nullable=False)
    notification_type = Column(String(50))
    is_read = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", back_populates="notifications")
