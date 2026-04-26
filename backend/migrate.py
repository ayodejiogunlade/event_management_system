"""Run once: docker compose exec backend python migrate.py"""
import sys; sys.path.insert(0, "/app")
from app.database import engine
from sqlalchemy import text

steps = [
    ("add attendee_count to events",
     "ALTER TABLE events ADD COLUMN IF NOT EXISTS attendee_count INTEGER;"),
    ("add service_limit to vendors",
     "ALTER TABLE vendors ADD COLUMN IF NOT EXISTS service_limit INTEGER NOT NULL DEFAULT 1;"),
    ("drop old service_type/pricing from vendors",
     "ALTER TABLE vendors DROP COLUMN IF EXISTS service_type, DROP COLUMN IF EXISTS pricing;"),
    ("create vendor_services","""
     CREATE TABLE IF NOT EXISTS vendor_services (
         id SERIAL PRIMARY KEY, vendor_id INTEGER NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
         service_name VARCHAR(255) NOT NULL, category_key VARCHAR(80) NOT NULL,
         description TEXT, pricing_model_key VARCHAR(80) NOT NULL DEFAULT 'fixed_fee',
         fixed_price NUMERIC(12,2), price_per_head NUMERIC(12,2), min_guests INTEGER,
         percentage_rate FLOAT, hourly_rate NUMERIC(12,2), min_hours FLOAT,
         deposit_percent FLOAT NOT NULL DEFAULT 50.0, vat_applicable BOOLEAN NOT NULL DEFAULT TRUE,
         is_active BOOLEAN NOT NULL DEFAULT TRUE, extra_info JSONB,
         created_at TIMESTAMPTZ DEFAULT NOW());"""),
    ("add booking columns",
     "ALTER TABLE bookings ADD COLUMN IF NOT EXISTS vendor_service_id INTEGER REFERENCES vendor_services(id), ADD COLUMN IF NOT EXISTS guest_count INTEGER, ADD COLUMN IF NOT EXISTS agreed_price NUMERIC(12,2);"),
    ("create service_category_defs","""
     CREATE TABLE IF NOT EXISTS service_category_defs (
         id SERIAL PRIMARY KEY, key VARCHAR(80) UNIQUE NOT NULL, label VARCHAR(150) NOT NULL,
         description TEXT, icon VARCHAR(10) DEFAULT '🛎️', is_active BOOLEAN DEFAULT TRUE,
         sort_order INTEGER DEFAULT 0, info_fields JSONB, created_at TIMESTAMPTZ DEFAULT NOW());"""),
    ("create pricing_model_defs","""
     CREATE TABLE IF NOT EXISTS pricing_model_defs (
         id SERIAL PRIMARY KEY, key VARCHAR(80) UNIQUE NOT NULL, label VARCHAR(150) NOT NULL,
         description TEXT, is_active BOOLEAN DEFAULT TRUE, created_at TIMESTAMPTZ DEFAULT NOW());"""),
    ("create system_settings","""
     CREATE TABLE IF NOT EXISTS system_settings (
         id SERIAL PRIMARY KEY, key VARCHAR(100) UNIQUE NOT NULL,
         value TEXT NOT NULL, updated_at TIMESTAMPTZ DEFAULT NOW());"""),
]

with engine.connect() as conn:
    for name, sql in steps:
        try:
            conn.execute(text(sql)); conn.commit()
            print(f"  ✅ {name}")
        except Exception as e:
            conn.rollback()
            print(f"  ⚠️  {name} — {e.__class__.__name__}: {str(e)[:60]}")

print("\n✅ Migration done. Run: python seed.py")
