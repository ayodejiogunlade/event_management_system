# ⚡ Event Management System (EMS)

A full-stack web application for real-time event planning and vendor matching, built with React, FastAPI, PostgreSQL, WebSocket, and Docker.

---

## 🏗 Architecture

```
┌─────────────────────────────────────────────┐
│              React Frontend (Port 3000)      │
│  Dashboard | Events | Discover | Bookings    │
│  Leaflet Maps | Socket.IO Client             │
└───────────────────┬─────────────────────────┘
                    │ HTTPS / WSS (Nginx proxy)
┌───────────────────▼─────────────────────────┐
│       FastAPI Backend (Port 8000)            │
│  Auth | Events | Vendors | Bookings          │
│  MCDM Matching | Haversine | Socket.IO       │
└───────────────────┬─────────────────────────┘
                    │
┌───────────────────▼─────────────────────────┐
│         PostgreSQL Database (Port 5432)      │
│  Users | Events | Vendors | Bookings         │
│  Notifications | Locations                   │
└─────────────────────────────────────────────┘
```

---

## 🚀 Quick Start (Docker)

### Prerequisites
- Docker Desktop 4.x+
- Docker Compose v2+

### 1. Clone / extract the project
```bash
cd ems/
```

### 2. Start all services
```bash
docker compose up --build
```

### 3. Seed demo data (first run only)
```bash
docker compose exec backend python seed.py
```

### 4. Open the app
```
http://localhost:3000
```

---

## 👤 Demo Accounts

| Role      | Email                | Password   |
|-----------|----------------------|------------|
| Admin     | admin@ems.com        | admin123   |
| Organizer | organizer@ems.com    | org123     |
| Vendor    | vendor@ems.com       | vendor123  |

---

## 🔌 API Endpoints

| Method | Endpoint                         | Description                        |
|--------|----------------------------------|------------------------------------|
| POST   | /api/auth/register               | Register new user                  |
| POST   | /api/auth/login                  | Login and receive JWT              |
| GET    | /api/auth/me                     | Get current user profile           |
| GET    | /api/events                      | List organizer's events            |
| POST   | /api/events                      | Create a new event                 |
| PUT    | /api/events/{id}                 | Update event                       |
| DELETE | /api/events/{id}                 | Cancel event                       |
| GET    | /api/vendors                     | List all vendors                   |
| POST   | /api/vendors                     | Create vendor profile              |
| PUT    | /api/vendors/me                  | Update own vendor profile          |
| POST   | /api/match                       | Run MCDM vendor matching           |
| GET    | /api/bookings                    | List bookings for current user     |
| POST   | /api/bookings                    | Create booking request             |
| PUT    | /api/bookings/{id}/status        | Update booking status              |
| GET    | /api/notifications               | Get user notifications             |
| PUT    | /api/notifications/read-all      | Mark all notifications read        |
| GET    | /api/admin/stats                 | Admin platform statistics          |
| GET    | /api/admin/users                 | List all users (admin)             |
| PUT    | /api/admin/vendors/{id}/verify   | Verify vendor (admin)              |

Interactive API docs: **http://localhost:8000/docs**

---

## ⚙️ MCDM Matching Algorithm

The vendor matching engine applies a **two-stage** approach:

**Stage 1 – Hard Constraints** (eliminates vendors):
- Wrong service category
- Marked as unavailable
- Not yet verified by admin
- Already confirmed for the requested date

**Stage 2 – Composite Score Ranking**:
```
S = 0.4 × S_distance + 0.3 × S_price + 0.3 × S_rating
```
- `S_distance` = 1 − (vendor_dist / max_dist)   → closer = higher
- `S_price`    = 1 − (vendor_price / max_price)  → cheaper = higher  
- `S_rating`   = vendor_rating / 5.0             → higher = higher

Distance computed using the **Haversine formula**.

---

## 🗄 Database Schema

```
User ──< Event ──< Booking >── Vendor ──1 Location
User ──< Notification
User ──1 Vendor
```

---

## 🛠 Local Development (without Docker)

### Backend
```bash
cd backend
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
export DATABASE_URL=postgresql://ems_user:ems_pass@localhost:5432/ems_db
uvicorn app.main:socket_app --reload --port 8000
```

### Frontend
```bash
cd frontend
npm install --legacy-peer-deps
npm start                        # runs on port 3000
```

---

## 📁 Project Structure

```
ems/
├── docker-compose.yml
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── seed.py
│   └── app/
│       ├── main.py          # FastAPI + Socket.IO app
│       ├── models.py        # SQLAlchemy ORM models
│       ├── schemas.py       # Pydantic request/response schemas
│       ├── auth.py          # JWT authentication + RBAC
│       ├── matching.py      # MCDM + Haversine algorithm
│       ├── socket_manager.py# WebSocket notification manager
│       ├── database.py      # DB session factory
│       ├── config.py        # Environment settings
│       └── routers/
│           ├── auth.py      # /api/auth/*
│           ├── events.py    # /api/events/*
│           ├── vendors.py   # /api/vendors/*
│           ├── bookings.py  # /api/bookings/*
│           └── misc.py      # /api/match, /notifications, /admin
└── frontend/
    ├── Dockerfile
    ├── nginx.conf
    ├── package.json
    └── src/
        ├── App.jsx          # Routes + auth guards
        ├── index.css        # Design system
        ├── api/index.js     # Axios API client
        ├── context/         # Auth context
        ├── hooks/           # useSocket (WebSocket)
        ├── components/      # Sidebar, Topbar
        └── pages/
            ├── AuthPage.jsx      # Login / Register
            ├── Dashboard.jsx     # Role-aware dashboard
            ├── Events.jsx        # Event CRUD
            ├── Discover.jsx      # Vendor search + map
            ├── Bookings.jsx      # Booking management
            ├── VendorProfile.jsx # Vendor self-management
            └── Admin.jsx         # Admin: users + vendors
```

---

## 🔒 Security Features

- JWT authentication (24-hour expiry)
- bcrypt password hashing
- Role-Based Access Control (RBAC)
- CORS policy via Nginx
- Input validation via Pydantic
- Protected React routes

---

## 📄 License

Academic project — MIVA Open University, 2025.
