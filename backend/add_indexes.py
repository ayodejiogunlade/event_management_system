"""
add_indexes.py — Database Index Migration

Adds indexes that dramatically speed up the vendor matching queries:

  locations.latitude  + locations.longitude
    → Used by the bounding box pre-filter (biggest win)
    → Turns a full table scan into an index range scan

  vendors.is_verified + vendors.availability_status
    → Filters out unverified/unavailable vendors at DB level

  vendor_services.category_key + vendor_services.is_active
    → Speeds up service category lookups

  bookings.vendor_id + bookings.status
    → Speeds up the availability (no-conflict) check

Run once inside Docker:
    docker compose exec backend python add_indexes.py
"""

import sys
sys.path.insert(0, "/app")

from sqlalchemy import text
from app.database import engine

INDEXES = [
    # Bounding box pre-filter — most impactful index
    ("idx_locations_lat",       "CREATE INDEX IF NOT EXISTS idx_locations_lat        ON locations (latitude)"),
    ("idx_locations_lng",       "CREATE INDEX IF NOT EXISTS idx_locations_lng        ON locations (longitude)"),
    ("idx_locations_lat_lng",   "CREATE INDEX IF NOT EXISTS idx_locations_lat_lng    ON locations (latitude, longitude)"),
    ("idx_locations_vendor_id", "CREATE INDEX IF NOT EXISTS idx_locations_vendor_id  ON locations (vendor_id)"),

    # Vendor filter columns
    ("idx_vendors_verified",    "CREATE INDEX IF NOT EXISTS idx_vendors_verified      ON vendors (is_verified)"),
    ("idx_vendors_available",   "CREATE INDEX IF NOT EXISTS idx_vendors_available     ON vendors (availability_status)"),
    ("idx_vendors_user_id",     "CREATE INDEX IF NOT EXISTS idx_vendors_user_id       ON vendors (user_id)"),

    # Service category lookup
    ("idx_svc_category",        "CREATE INDEX IF NOT EXISTS idx_svc_category          ON vendor_services (category_key)"),
    ("idx_svc_active",          "CREATE INDEX IF NOT EXISTS idx_svc_active            ON vendor_services (is_active)"),
    ("idx_svc_vendor_id",       "CREATE INDEX IF NOT EXISTS idx_svc_vendor_id         ON vendor_services (vendor_id)"),
    ("idx_svc_cat_active",      "CREATE INDEX IF NOT EXISTS idx_svc_cat_active        ON vendor_services (category_key, is_active)"),

    # Availability (conflict) check
    ("idx_bookings_vendor",     "CREATE INDEX IF NOT EXISTS idx_bookings_vendor       ON bookings (vendor_id)"),
    ("idx_bookings_status",     "CREATE INDEX IF NOT EXISTS idx_bookings_status       ON bookings (status)"),
    ("idx_bookings_event_id",   "CREATE INDEX IF NOT EXISTS idx_bookings_event_id     ON bookings (event_id)"),

    # Event date range scan
    ("idx_events_date",         "CREATE INDEX IF NOT EXISTS idx_events_date           ON events (event_date)"),
    ("idx_events_user_id",      "CREATE INDEX IF NOT EXISTS idx_events_user_id        ON events (user_id)"),

    # Notification bell
    ("idx_notif_user_read",     "CREATE INDEX IF NOT EXISTS idx_notif_user_read       ON notifications (user_id, is_read)"),
]

print("Adding database indexes for matching performance...\n")

with engine.connect() as conn:
    for name, sql in INDEXES:
        try:
            conn.execute(text(sql))
            conn.commit()
            print(f"  OK   {name}")
        except Exception as e:
            print(f"  SKIP {name}: {e}")

print(f"\nDone. {len(INDEXES)} indexes processed.")
print("Re-run at any time — CREATE INDEX IF NOT EXISTS is safe to repeat.")
