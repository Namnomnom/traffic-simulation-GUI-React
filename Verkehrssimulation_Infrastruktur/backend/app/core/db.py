# app/core/db.py
import os
import psycopg2
from fastapi import Depends

DB_DSN = os.getenv(
    "DB_DSN",
    "postgresql://masteruser:masterpass@postgres:5432/traffic_data"
)

def get_conn():
    conn = psycopg2.connect(DB_DSN)
    conn.autocommit = True
    return conn
