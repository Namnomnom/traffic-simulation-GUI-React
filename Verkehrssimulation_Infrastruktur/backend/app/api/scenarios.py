# backend/app/api/scenarios.py
from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, field_validator
from psycopg2.extras import Json

from app.core.db import get_conn

router = APIRouter(prefix="/scenarios", tags=["scenarios"])


# --------------------------
# Schemas
# --------------------------
class ScenarioCreateIn(BaseModel):
    name: str = Field(..., min_length=1)
    payload: Dict[str, Any]

    @field_validator("name")
    @classmethod
    def strip_name(cls, v: str) -> str:
        v = (v or "").strip()
        if not v:
            raise ValueError("name must not be empty")
        return v


class ScenarioRenameIn(BaseModel):
    name: str = Field(..., min_length=1)

    @field_validator("name")
    @classmethod
    def strip_name(cls, v: str) -> str:
        v = (v or "").strip()
        if not v:
            raise ValueError("name must not be empty")
        return v


class ScenarioOut(BaseModel):
    id: int
    name: str
    created_at: str


class ScenarioDetailOut(BaseModel):
    id: int
    name: str
    created_at: str
    payload: Dict[str, Any]


# --------------------------
# Routes
# --------------------------
@router.get("/", response_model=List[ScenarioOut])
def list_scenarios():
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, name, created_at
                FROM public.scenario
                ORDER BY created_at DESC
                """
            )
            rows = cur.fetchall()

        return [
            {
                "id": r[0],
                "name": r[1],
                "created_at": r[2].isoformat() if isinstance(r[2], datetime) else str(r[2]),
            }
            for r in rows
        ]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"DB error in list_scenarios: {e}")
    finally:
        conn.close()


@router.post("/", response_model=ScenarioOut)
def create_scenario(data: ScenarioCreateIn):
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO public.scenario (name, payload)
                VALUES (%s, %s)
                RETURNING id, name, created_at
                """,
                (data.name, Json(data.payload)),
            )
            row = cur.fetchone()

        return {"id": row[0], "name": row[1], "created_at": row[2].isoformat()}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"DB error in create_scenario: {e}")
    finally:
        conn.close()


@router.get("/{scenario_id}", response_model=ScenarioDetailOut)
def get_scenario(scenario_id: int):
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, name, created_at, payload
                FROM public.scenario
                WHERE id = %s
                """,
                (scenario_id,),
            )
            row = cur.fetchone()

        if not row:
            raise HTTPException(status_code=404, detail="Scenario not found")

        return {
            "id": row[0],
            "name": row[1],
            "created_at": row[2].isoformat(),
            "payload": row[3],
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"DB error in get_scenario: {e}")
    finally:
        conn.close()


@router.patch("/{scenario_id}", response_model=ScenarioOut)
def rename_scenario(scenario_id: int, data: ScenarioRenameIn):
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE public.scenario
                SET name = %s
                WHERE id = %s
                RETURNING id, name, created_at
                """,
                (data.name, scenario_id),
            )
            row = cur.fetchone()

        if not row:
            raise HTTPException(status_code=404, detail="Scenario not found")

        return {"id": row[0], "name": row[1], "created_at": row[2].isoformat()}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"DB error in rename_scenario: {e}")
    finally:
        conn.close()
