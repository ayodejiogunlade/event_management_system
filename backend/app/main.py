from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import socketio
from app.database import engine
import app.models as models
from app.socket_manager import sio
from app.routers.auth import router as auth_router
from app.routers.events import router as events_router
from app.routers.vendors import router as vendors_router
from app.routers.bookings import router as bookings_router
from app.routers.misc import matching_router, notif_router, admin_router

# Create all tables
models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="Event Management System API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(auth_router)
app.include_router(events_router)
app.include_router(vendors_router)
app.include_router(bookings_router)
app.include_router(matching_router)
app.include_router(notif_router)
app.include_router(admin_router)


@app.get("/api/health")
def health():
    return {"status": "ok", "service": "EMS API"}


# Wrap with Socket.IO ASGI app
socket_app = socketio.ASGIApp(sio, other_asgi_app=app)
