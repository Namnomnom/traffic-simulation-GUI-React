import os
import time
import traci

HOST = os.getenv("SUMO_HOST", "sumo")
PORT = int(os.getenv("SUMO_PORT", "8813"))

print(f"Connecting to SUMO TraCI at {HOST}:{PORT} ...")

try:
    conn = traci.connect(host=HOST, port=PORT)
except Exception as e:
    print("❌ Verbindung fehlgeschlagen:", e)
    raise SystemExit(1)

print("✅ Verbindung aufgebaut!")

# ein paar Schritte simulieren
for step in range(10):
    conn.simulationStep()
    vehicle_ids = conn.vehicle.getIDList()
    print(f"Step {step}: Fahrzeuge = {list(vehicle_ids)}")
    time.sleep(0.1)

conn.close()
print("✅ Verbindung geschlossen")
