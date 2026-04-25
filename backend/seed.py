"""
Run once after first startup to seed demo data:
  docker compose exec backend python seed.py
"""
import sys
sys.path.insert(0, "/app")

import bcrypt
from app.database import SessionLocal, engine
from app.models import Base, User, Vendor, Location, Event, UserType
from datetime import datetime, timedelta

Base.metadata.create_all(bind=engine)
db = SessionLocal()

# ── Direct Password Hashing (Bypassing broken passlib in app.auth) ────────────
def hash_password(password: str) -> str:
    pwd_bytes = password.encode('utf-8')
    salt = bcrypt.gensalt()
    hashed_password = bcrypt.hashpw(pwd_bytes, salt)
    return hashed_password.decode('utf-8')

def make_user(name, email, pw, role):
    u = db.query(User).filter(User.email == email).first()
    if not u:
        u = User(name=name, email=email, password_hash=hash_password(pw), user_type=role, phone_number="+2348012345678")
        db.add(u); db.flush()
    return u

# ── Core accounts ─────────────────────────────────────────────────────────────
admin  = make_user("System Admin",       "admin@ems.com",     "admin123",  UserType.admin)
org    = make_user("Chukwuemeka Okafor", "organizer@ems.com", "org123",    UserType.organizer)
vuser  = make_user("Amina Bello",        "vendor@ems.com",    "vendor123", UserType.vendor)

# Extra organizers
org2 = make_user("Ngozi Adeyemi",   "ngozi@ems.com",   "org123", UserType.organizer)
org3 = make_user("Taiwo Falola",    "taiwo@ems.com",   "org123", UserType.organizer)

# Extra vendor users
vu2 = make_user("Biodun Fashola",  "biodun@ems.com",  "vendor123", UserType.vendor)
vu3 = make_user("Kemi Okonkwo",   "kemi@ems.com",    "vendor123", UserType.vendor)
vu4 = make_user("Emeka Eze",      "emeka@ems.com",    "vendor123", UserType.vendor)
vu5 = make_user("Sola Adebayo",   "sola@ems.com",     "vendor123", UserType.vendor)
vu6 = make_user("Fatima Musa",    "fatima@ems.com",   "vendor123", UserType.vendor)

db.commit()

# ── Vendor profiles ───────────────────────────────────────────────────────────
vendor_data = [
    (vuser, "Golden Fork Catering",   "Catering",          120000, True,  True,  4.8, 45,  6.4550, 3.3841, "14 Awolowo Rd, Ikoyi, Lagos"),
    (vu2,   "Petal & Grace Decor",    "Decoration",         95000, True,  True,  4.6, 32,  6.4281, 3.4219, "22 Adeola Odeku St, VI, Lagos"),
    (vu3,   "Shutter Perfect Studios","Photography",         80000, True,  True,  4.9, 67,  6.5244, 3.3792, "5 Allen Ave, Ikeja, Lagos"),
    (vu4,   "SoundWave Pro",          "Sound Engineering",   60000, True,  True,  4.5, 21,  6.4698, 3.5852, "Lekki Phase 1, Lagos"),
    (vu5,   "SwiftRide Transport",    "Transportation",      45000, True,  False, 4.2, 14,  6.3910, 3.4350, "10 Bode Thomas St, Surulere"),
    (vu6,   "Shield & Secure",        "Security",            35000, True,  True,  4.3, 19,  6.4451, 3.3903, "Victoria Island, Lagos"),
]

for (user, bname, stype, price, avail, verified, rating, rcount, lat, lng, addr) in vendor_data:
    if not db.query(Vendor).filter(Vendor.user_id == user.id).first():
        v = Vendor(
            business_name=bname, service_type=stype, pricing=price,
            availability_status=avail, is_verified=verified,
            rating=rating, rating_count=rcount,
            service_radius_km=60, user_id=user.id,
            description=f"Professional {stype.lower()} services for events of all sizes in Lagos.",
        )
        db.add(v); db.flush()
        loc = Location(address=addr, latitude=lat, longitude=lng, vendor_id=v.id)
        db.add(loc)

db.commit()

# ── Events ────────────────────────────────────────────────────────────────────
events_data = [
    (org.id,  "TechFest Lagos 2025",        "Conference",  2000000, "Eko Hotel, VI, Lagos",          6.4281, 3.4219, "2025-09-15T09:00:00"),
    (org.id,  "Chukwuemeka & Ada Wedding",  "Wedding",     5000000, "Civic Centre, Victoria Island", 6.4339, 3.4176, "2025-08-10T14:00:00"),
    (org2.id, "Lagos Fashion Week 2025",    "Exhibition",  3500000, "Federal Palace Hotel, Lagos",   6.4254, 3.4166, "2025-10-05T10:00:00"),
    (org3.id, "Annual Staff Party",         "Corporate",    800000, "Landmark Centre, Lagos",        6.4350, 3.4498, "2025-07-20T18:00:00"),
]

for (uid, name, etype, budget, addr, lat, lng, dt) in events_data:
    if not db.query(Event).filter(Event.name == name).first():
        e = Event(
            name=name, event_type=etype, budget=budget,
            location_address=addr, location_lat=lat, location_lng=lng,
            event_date=datetime.fromisoformat(dt),
            user_id=uid, required_services="Catering, Decoration, Photography",
        )
        db.add(e)

db.commit()
print("✅ Seed complete. Demo accounts:")
print("   admin@ems.com / admin123")
print("   organizer@ems.com / org123")
print("   vendor@ems.com / vendor123")