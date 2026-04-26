import sys; sys.path.insert(0, "/app")
from app.database import SessionLocal, engine
from app.models import (Base, User, Vendor, VendorService, Location, Event,
                         UserType, ServiceCategoryDef, PricingModelDef, SystemSetting)
from app.auth import hash_password
from datetime import datetime
Base.metadata.create_all(bind=engine)
db = SessionLocal()

# ── Pricing models ────────────────────────────────────────────────────────────
pm_data = [
    ("fixed_fee",  "Fixed Fee / Package",    "A flat rate for a defined scope of work.", [
        {"name":"capacity","label":"Hall Capacity","type":"number","placeholder":"500","unit":"people"},
        {"name":"hall_type","label":"Hall Type","type":"select","options":["Indoor","Outdoor","Rooftop","Marquee"]},
    ]),
    ("per_head",   "Per Head (Per Guest)",   "Billed per attendee — ideal for catering & bar services.", None),
    ("percentage", "Percentage of Budget",   "% of total event budget — common for event planners.", None),
    ("hourly",     "Hourly / Day Rate",       "Charged per hour or as a day rate — for DJs, MCs, photographers.", None),
]
for key, label, desc, _ in pm_data:
    if not db.query(PricingModelDef).filter_by(key=key).first():
        db.add(PricingModelDef(key=key, label=label, description=desc))
db.commit()

# ── Service categories (from PDF) ─────────────────────────────────────────────
cat_data = [
    ("event_planning",   "Event Planning & Production", "👑", 0,
     [{"name":"event_types","label":"Specialisation","type":"text","placeholder":"Weddings, Corporates, Concerts"}]),
    ("venue",            "Venue / Banquet Hall",        "🏛️", 1,
     [{"name":"capacity","label":"Hall Capacity","type":"number","placeholder":"500","unit":"people"},
      {"name":"hall_type","label":"Hall Type","type":"select","options":["Indoor","Outdoor","Rooftop","Marquee","Both"]}]),
    ("catering",         "Catering",                   "🍽️", 2,
     [{"name":"cuisine","label":"Cuisine Type","type":"text","placeholder":"Nigerian, Continental, Asian"},
      {"name":"menu_items","label":"Signature Dishes","type":"text","placeholder":"Jollof, Fried Rice, Swallow, Pepper Soup"}]),
    ("small_chops",      "Small Chops & Finger Foods",  "🍢", 3,
     [{"name":"items","label":"Items Included","type":"text","placeholder":"Puff-puff, Samosa, Spring rolls, Asun, Nkwobi"}]),
    ("cake_confectionery","Cake & Confectionery",       "🎂", 4,
     [{"name":"cake_type","label":"Cake Style","type":"select","options":["Buttercream","Fondant","Drip","Floral","3D Custom"]},
      {"name":"max_tiers","label":"Max Tiers","type":"number","placeholder":"5"}]),
    ("bar_mixology",     "Bar & Mixology",             "🍸", 5,
     [{"name":"bar_type","label":"Bar Style","type":"select","options":["Full Bar","Mocktails Only","Afro-tending","Dry Ice/Smoke Effects"]},
      {"name":"includes_alcohol","label":"Alcohol Included","type":"select","options":["Yes","No","Client Supplies"]}]),
    ("decoration",       "Decoration & Styling",       "🌸", 6,
     [{"name":"theme","label":"Speciality Theme","type":"text","placeholder":"Luxury, Rustic, Floral, Garden, Modern"},
      {"name":"includes_lights","label":"Lighting Included","type":"select","options":["Yes","No","Optional Add-on"]}]),
    ("photography",      "Photography",                "📸", 7,
     [{"name":"coverage_hours","label":"Coverage Hours","type":"number","placeholder":"8"},
      {"name":"crew_size","label":"Crew Size","type":"number","placeholder":"2"}]),
    ("videography",      "Videography / Cinematography","🎬", 8,
     [{"name":"format","label":"Output Format","type":"select","options":["4K","1080p HD","Drone + Ground","Same-Day Edit"]},
      {"name":"crew_size","label":"Crew Size","type":"number","placeholder":"2"}]),
    ("dj_services",      "DJ Services",                "🎧", 9,
     [{"name":"includes_pa","label":"PA System Included","type":"select","options":["Yes","No"]},
      {"name":"genres","label":"Music Genres","type":"text","placeholder":"Afrobeats, Hip-hop, Highlife, R&B"}]),
    ("live_band",        "Live Band",                  "🎺", 10,
     [{"name":"band_size","label":"Number of Performers","type":"number","placeholder":"8"},
      {"name":"genres","label":"Music Genres","type":"text","placeholder":"Highlife, Fuji, Afrobeats, Gospel"}]),
    ("mc",               "Master of Ceremonies (MC)",  "🎤", 11,
     [{"name":"mc_type","label":"MC Style","type":"select","options":["Corporate","Social/Wedding","Bilingual","Celebrity"]},
      {"name":"languages","label":"Languages","type":"text","placeholder":"English, Yoruba, Igbo, Hausa"}]),
    ("cultural_emcee",   "Cultural Emcee (Alaga)",     "👘", 12,
     [{"name":"tribe","label":"Tribe/Culture","type":"select","options":["Yoruba","Igbo","Hausa","Other"]},
      {"name":"rites","label":"Rites Covered","type":"text","placeholder":"Eru Iyawo, Igba Nkwu, Kamu"}]),
    ("security",         "Security",                   "🛡️", 13,
     [{"name":"security_type","label":"Security Type","type":"select","options":["Bouncers","CPO","Armed Guard","K9 Unit","Full Package"]},
      {"name":"num_personnel","label":"Personnel Count","type":"number","placeholder":"4"}]),
    ("makeup_beauty",    "Makeup & Beauty",            "💄", 14,
     [{"name":"coverage","label":"Coverage","type":"select","options":["Bride Only","Bride + Bridesmaids","Full Bridal Train","Corporate Makeup"]},
      {"name":"cosmetic_brand","label":"Cosmetic Brand","type":"text","placeholder":"MAC, Fenty, Huda Beauty"}]),
    ("transportation",   "Transportation & Logistics", "🚌", 15,
     [{"name":"vehicle_type","label":"Vehicle Type","type":"select","options":["AC Bus","Sprinter Van","Luxury Cars","Trucks","Mixed Fleet"]},
      {"name":"num_vehicles","label":"Number of Vehicles","type":"number","placeholder":"3"}]),
    ("sound_engineering","Sound Engineering & AV",     "🔊", 16,
     [{"name":"pa_size","label":"PA System Size","type":"select","options":["Small (≤100 pax)","Medium (100-300 pax)","Large (300-1000 pax)","Stadium"]},
      {"name":"includes_lights","label":"Lighting Rig Included","type":"select","options":["Yes","No","Optional"]}]),
    ("other",            "Other",                      "🛎️", 17, None),
]

for key, label, icon, order, info_fields in cat_data:
    if not db.query(ServiceCategoryDef).filter_by(key=key).first():
        db.add(ServiceCategoryDef(key=key, label=label, icon=icon,
                                   sort_order=order, info_fields=info_fields))
db.commit()

# ── System settings ───────────────────────────────────────────────────────────
if not db.query(SystemSetting).filter_by(key="default_service_limit").first():
    db.add(SystemSetting(key="default_service_limit", value="1"))
db.commit()

# ── Users ─────────────────────────────────────────────────────────────────────
def make_user(name, email, pw, role):
    u = db.query(User).filter_by(email=email).first()
    if not u:
        u = User(name=name, email=email, password_hash=hash_password(pw),
                 user_type=role, phone_number="+2348012345678")
        db.add(u); db.flush()
    return u

admin = make_user("System Admin",       "admin@ems.com",     "admin123",  UserType.admin)
org   = make_user("Chukwuemeka Okafor", "organizer@ems.com", "org123",    UserType.organizer)
org2  = make_user("Ngozi Adeyemi",      "ngozi@ems.com",     "org123",    UserType.organizer)
vu1   = make_user("Amina Bello",        "vendor@ems.com",    "vendor123", UserType.vendor)
vu2   = make_user("Biodun Fashola",     "biodun@ems.com",    "vendor123", UserType.vendor)
vu3   = make_user("Kemi Okonkwo",       "kemi@ems.com",      "vendor123", UserType.vendor)
vu4   = make_user("Emeka Eze",          "emeka@ems.com",     "vendor123", UserType.vendor)
vu5   = make_user("Sola Adebayo",       "sola@ems.com",      "vendor123", UserType.vendor)
vu6   = make_user("Fatima Musa",        "fatima@ems.com",    "vendor123", UserType.vendor)
vu7   = make_user("Tunde Bakare",       "tunde@ems.com",     "vendor123", UserType.vendor)
db.commit()

# ── Vendors + services ────────────────────────────────────────────────────────
vendor_seed = [
  (vu1,"Golden Fork Catering",True,True,4.8,45,3,6.4550,3.3841,"14 Awolowo Rd, Ikoyi, Lagos",[
    ("catering","Full Wedding Catering","per_head",None,8500,50,None,None,70,
     {"cuisine":"Nigerian","menu_items":"Jollof, Fried Rice, Swallow, Pepper Soup"}),
    ("small_chops","Premium Small Chops","fixed_fee",180000,None,None,None,None,50,
     {"items":"Puff-puff, Samosa, Spring rolls, Asun, Nkwobi"}),
    ("catering","Corporate Lunch Package","per_head",None,5000,30,None,None,50,
     {"cuisine":"Continental","menu_items":"Pasta, Grilled Chicken, Salads"}),
  ]),
  (vu2,"AkinSoundPro",True,True,4.5,21,3,6.4698,3.5852,"Lekki Phase 1, Lagos",[
    ("sound_engineering","Full PA + Lighting","fixed_fee",250000,None,None,None,None,50,
     {"pa_size":"Large (300-1000 pax)","includes_lights":"Yes"}),
    ("dj_services","Professional DJ Service","fixed_fee",200000,None,None,None,None,50,
     {"includes_pa":"Yes","genres":"Afrobeats, Hip-hop, R&B"}),
    ("sound_engineering","Premium AV Production","fixed_fee",450000,None,None,None,None,60,
     {"pa_size":"Large (300-1000 pax)","includes_lights":"Yes"}),
  ]),
  (vu3,"Shutter Perfect Studios",True,True,4.9,67,5,6.5244,3.3792,"5 Allen Ave, Ikeja, Lagos",[
    ("photography","Standard Wedding Photography","fixed_fee",350000,None,None,None,None,70,
     {"coverage_hours":10,"crew_size":2}),
    ("videography","Cinematic Wedding Film","fixed_fee",500000,None,None,None,None,70,
     {"format":"4K","crew_size":2}),
    ("photography","Corporate Event Coverage","hourly",None,None,None,None,50000,50,
     {"coverage_hours":6,"crew_size":1}),
    ("photography","Elite Multi-Day Package","fixed_fee",1200000,None,None,None,None,70,
     {"coverage_hours":24,"crew_size":4}),
    ("videography","Product Launch Video","fixed_fee",280000,None,None,None,None,60,
     {"format":"1080p HD","crew_size":2}),
  ]),
  (vu4,"PetalGrace Décor Studio",True,True,4.6,32,3,6.4281,3.4219,"22 Adeola Odeku, VI, Lagos",[
    ("decoration","Standard Decoration","fixed_fee",400000,None,None,None,None,50,
     {"theme":"Modern","includes_lights":"Optional Add-on"}),
    ("decoration","Luxe Wedding Styling","fixed_fee",900000,None,None,None,None,60,
     {"theme":"Luxury Floral","includes_lights":"Yes"}),
    ("decoration","Ultra-Luxury Transformation","fixed_fee",2900000,None,None,None,None,70,
     {"theme":"Custom 3D","includes_lights":"Yes"}),
  ]),
  (vu5,"SwiftRide Logistics",True,False,4.2,14,1,6.3910,3.4350,"Surulere, Lagos",[
    ("transportation","Guest Shuttle Service","per_head",None,3500,20,None,None,50,
     {"vehicle_type":"AC Bus","num_vehicles":2}),
  ]),
  (vu6,"Shield & Secure",True,True,4.3,19,3,6.4451,3.3903,"Victoria Island, Lagos",[
    ("security","Event Bouncers Package","fixed_fee",160000,None,None,None,None,50,
     {"security_type":"Bouncers","num_personnel":4}),
    ("security","VIP Close Protection","fixed_fee",240000,None,None,None,None,60,
     {"security_type":"CPO","num_personnel":2}),
    ("security","Armed Guard Detail","fixed_fee",320000,None,None,None,None,70,
     {"security_type":"Armed Guard","num_personnel":3}),
  ]),
  (vu7,"Glow & Grace MUA",True,True,4.7,28,3,6.4350,3.4120,"Ikeja GRA, Lagos",[
    ("makeup_beauty","Bridal Glam Package","fixed_fee",120000,None,None,None,None,60,
     {"coverage":"Bride + Bridesmaids","cosmetic_brand":"MAC, Fenty"}),
    ("makeup_beauty","Celebrity Bridal MUA","fixed_fee",250000,None,None,None,None,70,
     {"coverage":"Full Bridal Train","cosmetic_brand":"Huda Beauty, NARS"}),
    ("makeup_beauty","Bride Only Standard","fixed_fee",45000,None,None,None,None,50,
     {"coverage":"Bride Only","cosmetic_brand":"MAC"}),
  ]),
]

for (user,bname,avail,verified,rating,rcount,limit,lat,lng,addr,svcs) in vendor_seed:
    if not db.query(Vendor).filter_by(user_id=user.id).first():
        v = Vendor(business_name=bname, availability_status=avail, is_verified=verified,
                   rating=rating, rating_count=rcount, service_radius_km=60,
                   service_limit=limit, user_id=user.id,
                   description="Professional services for events of all sizes.")
        db.add(v); db.flush()
        db.add(Location(address=addr, latitude=lat, longitude=lng, vendor_id=v.id))
        for (cat,sname,pm,fp,pph,mg,pr,hr,dep,extra) in svcs:
            db.add(VendorService(vendor_id=v.id, service_name=sname, category_key=cat,
                                  pricing_model_key=pm, fixed_price=fp, price_per_head=pph,
                                  min_guests=mg, percentage_rate=pr, hourly_rate=hr,
                                  deposit_percent=dep, vat_applicable=True, extra_info=extra))
db.commit()

for (name,etype,uid,budget,att,addr,lat,lng,dt) in [
    ("TechFest Lagos 2025","Conference",org.id,2000000,300,"Eko Hotel, VI, Lagos",6.4281,3.4219,"2025-09-15T09:00:00"),
    ("Chukwuemeka & Ada Wedding","Wedding",org.id,5000000,200,"Civic Centre, Victoria Island",6.4339,3.4176,"2025-08-10T14:00:00"),
    ("Lagos Fashion Week 2025","Exhibition",org2.id,3500000,500,"Federal Palace Hotel",6.4254,3.4166,"2025-10-05T10:00:00"),
]:
    if not db.query(Event).filter_by(name=name).first():
        db.add(Event(name=name,event_type=etype,budget=budget,attendee_count=att,
                     location_address=addr,location_lat=lat,location_lng=lng,
                     event_date=datetime.fromisoformat(dt),user_id=uid,
                     required_services="Catering, Decoration, Photography"))
db.commit()

print("✅ Seed complete.")
print("   admin@ems.com / admin123 | organizer@ems.com / org123 | vendor@ems.com / vendor123")
