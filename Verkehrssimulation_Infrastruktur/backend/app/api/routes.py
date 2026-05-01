# app/api/routes.py
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
import json, time

from app.core.db import get_conn

router = APIRouter(prefix="/api")


# --- Letzte Positionen (pro Fahrzeug) ---
@router.get("/positions/latest")
def latest_positions():
    sql = """
      SELECT DISTINCT ON (vehicle_id)
             vehicle_id, time AS ts, lat, lon, speed
      FROM public.position
      ORDER BY vehicle_id, ts DESC;
    """
    with get_conn().cursor() as cur:
        cur.execute(sql)
        rows = cur.fetchall()
    return [
        {
            "vehicleId": r[0],
            "ts": r[1].isoformat(),
            "lat": float(r[2]),
            "lon": float(r[3]),
            "speed": float(r[4]),
        }
        for r in rows
    ]


# --- Live-Stream (SSE) ---
@router.get("/positions/stream")
def stream_positions():
    def gen():
        last_epoch = time.time() - 5  # kleines Startfenster
        while True:
            with get_conn().cursor() as cur:
                cur.execute(
                    """
                    SELECT vehicle_id, time, lat, lon, speed
                    FROM public.position
                    WHERE EXTRACT(EPOCH FROM time) > %s
                    ORDER BY time ASC
                    """,
                    (last_epoch,),
                )
                rows = cur.fetchall()

            if rows:
                last_epoch = max(last_epoch, max(r[1].timestamp() for r in rows))
                for r in rows:
                    payload = {
                        "vehicleId": r[0],
                        "ts": r[1].isoformat(),
                        "lat": float(r[2]),
                        "lon": float(r[3]),
                        "speed": float(r[4]),
                    }
                    yield f"data: {json.dumps(payload)}\n\n"
            else:
                yield ": keep-alive\n\n"

            time.sleep(1.0)

    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive"},
    )
