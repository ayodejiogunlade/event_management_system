# ⚡ Event Management System (EMS)

A full-stack web application for real-time event planning and vendor matching,
built with React, FastAPI, PostgreSQL, WebSocket, and Docker.

---

## 🚀 Quick Start

### Prerequisites
- Docker Desktop 4.x+
- Docker Compose v2+

### 1. Start all services
```bash
docker compose up --build
```

### 2. Seed demo data (first run only — wait for backend to be healthy)
```bash
docker compose exec backend python seed.py
```

### 3. Open the app
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

## 🏗 Architecture

- **Frontend:** React 18 + Vite, served by Nginx (port 3000)
- **Backend:** Python FastAPI — modular monolith with router-based separation (port 8000)
- **Database:** PostgreSQL 16 (port 5432)
- **Real-time:** Socket.IO over WebSocket
- **Geocoding:** Photon API (autocomplete) + Nominatim (reverse geocoding) — both free, no key required
- **Maps:** Leaflet.js + OpenStreetMap tiles

## 🔌 Key API Endpoints

| Method | Endpoint                       | Description                    |
|--------|--------------------------------|--------------------------------|
| POST   | /api/auth/register             | Register new user              |
| POST   | /api/auth/login                | Login and receive JWT          |
| GET    | /api/events                    | List organizer's events        |
| POST   | /api/events                    | Create a new event             |
| GET    | /api/vendors                   | List all vendors               |
| POST   | /api/planner                   | Run multi-service MCDM planner |
| POST   | /api/match                     | Single-service vendor match    |
| GET    | /api/bookings                  | List bookings for current user |
| POST   | /api/bookings                  | Create booking request         |
| PUT    | /api/bookings/{id}/status      | Update booking status          |
| GET    | /api/notifications             | Get user notifications         |
| GET    | /api/admin/stats               | Admin platform statistics      |

Interactive API docs: **http://localhost:8000/docs**

---

## ⚙️ MCDM Matching Algorithm

**Stage 1 — Hard Constraints** (eliminates vendors):
- Wrong service category
- Marked as unavailable
- Not yet verified by admin
- Already confirmed for the requested date
- Outside search radius

**Stage 2 — Composite Score Ranking:**
```
S = 0.4 × S_distance + 0.3 × S_price + 0.3 × S_rating

S_distance = 1 − (vendor_dist / max_dist)
S_price    = 1 − (vendor_price / max_price)
S_rating   = vendor_rating / 5.0
```

Distance computed using the **Haversine formula** in `backend/app/matching.py`.

---

## 📄 License
Academic project — MIVA Open University, 2025.
