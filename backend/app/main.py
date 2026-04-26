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
from app.routers.misc import (planner_router, matching_router,
                               notif_router, admin_router, meta_router)

models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="EMS API", version="3.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"],
                   allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

for r in [auth_router, events_router, vendors_router, bookings_router,
          planner_router, matching_router, notif_router, admin_router, meta_router]:
    app.include_router(r)

@app.get("/api/health")
def health(): return {"status": "ok", "version": "3.0"}

socket_app = socketio.ASGIApp(sio, other_asgi_app=app)
