import socketio
from typing import Dict, Set

# In-memory map of user_id -> set of socket IDs
connected_users: Dict[int, Set[str]] = {}

sio = socketio.AsyncServer(async_mode="asgi", cors_allowed_origins="*")


@sio.event
async def connect(sid, environ, auth):
    user_id = None
    if auth and "user_id" in auth:
        user_id = int(auth["user_id"])
        connected_users.setdefault(user_id, set()).add(sid)
        await sio.save_session(sid, {"user_id": user_id})
    print(f"[WS] Connected sid={sid} user_id={user_id}")


@sio.event
async def disconnect(sid):
    session = await sio.get_session(sid)
    user_id = session.get("user_id")
    if user_id and user_id in connected_users:
        connected_users[user_id].discard(sid)
        if not connected_users[user_id]:
            del connected_users[user_id]
    print(f"[WS] Disconnected sid={sid}")


async def push_notification(user_id: int, message: str, notif_type: str = "info"):
    """Push a real-time notification to a connected user."""
    payload = {"message": message, "type": notif_type}
    sids = connected_users.get(user_id, set())
    for sid in list(sids):
        await sio.emit("notification", payload, to=sid)
