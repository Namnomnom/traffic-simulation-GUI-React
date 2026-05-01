# Dockerfile baut Python-Image mit allen nötigen Abhängigkeiten für das Backend,
# nimmt den Backend-Code (Ordner) und kopiert ihn in den Container
FROM python:3.12-slim

WORKDIR /app

# System-Dependencies minimal
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential curl \
    libpq5 \                             
  && rm -rf /var/lib/apt/lists/*

# sinnvolle Defaults für Container-Python (weniger I/O & sofortige Logs)
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8000                          

# Python-Abhängigkeiten
RUN pip install --no-cache-dir -U pip && \
    pip install --no-cache-dir \
        fastapi \
        uvicorn[standard] \
        psycopg2-binary==2.9.9 \
        pydantic-settings \
        traci \
        sumolib

        
# App-Code kopieren
COPY app /app/app

EXPOSE 8000

# robustere Form (modulaufruf) + Dev-Reload; host-binding bleibt
CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]

# optionaler Healthcheck – nur aktiv lassen, wenn /health existiert
# HEALTHCHECK --interval=30s --timeout=3s --retries=5 CMD curl -fsS http://localhost:8000/health || exit 1
