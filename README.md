# traffic-simulation-GUI-React

Das Projekt „Traffic Simulation GUI – React“ dient der Umsetzung einer modernen, containerbasierten Webanwendung zur Visualisierung von Verkehrssimulationen.
Mithilfe von React, FastAPI, PostgreSQL/TimescaleDB und Docker Compose entsteht eine flexible Architektur, die sowohl Simulationsergebnisse als auch Echtzeit-Verkehrsdaten speichern, verarbeiten und interaktiv darstellen kann.

---
## Ersten Schritte zur Erstellung der eigenen Verkehrssimulation (Installation)
Die folgenden Schritte erläutern die Installation und Konfiguration aller benötigten Komponenten, um eine eigene Verkehrssimulation lokal entwickeln und ausführen zu können.

---
## 1. 🐳 Docker & Docker Compose (Installation)

### Installierte Software
- Docker Desktop von https://www.docker.com/products/docker-desktop herunterladen und installieren.  
- Nach der Installation sicherstellen, dass Docker läuft:

##### bash (Installation & aktuelle Version prüfen)
```bash
docker --version
docker compose version
```
→ Wenn beide Befehle Versionen ausgeben, ist Docker korrekt installiert.

---
## 2. 🐘 Einrichtung der PostgreSQL-Datenbank mit TimescaleDB und pgAdmin
Erstelle im Projektverzeichnis eine Datei `docker-compose.yml` (Beispiel unter Ordner [Infrastruktur](./Infrastruktur))
<br> Erklärung:   
- Postgres-Service: erstellt eine PostgreSQL-Datenbank mit aktivierter TimescaleDB-Erweiterung.
- pgAdmin-Service: stellt eine grafische Weboberfläche bereit.
- Netzwerk: Beide Container befinden sich im selben Netzwerk `traffic-net`.
- Persistente Daten werden im Ordner `pgdata` gespeichert.

### Start der Container:
```bash
docker compose up -d
```
→ Nach dem Start sind die Dienste erreichbar unter:
- pgAdmin: http://localhost:5050
<br> Login:
```
E-Mail: admin@trafficmail.com
Passwort: admin123
```
- PostgreSQL: Port `5432` (über `postgres_db` im Docker-Netzwerk erreichbar)

### Containerstatus prüfen:
```
docker ps
```
### Logs prüfen (optional):
```
docker logs pgadmin
docker logs postgres_db
```

---
## 3. 🧠 Verbindung von pgAdmin zur Datenbank
1. Öffne im Browser: http://localhost:5050
2. Melde dich mit den oben angegebenen Zugangsdaten an.
3. Wähle „Add New Server“ → Register - Server
4. Fülle die Felder wie folgt aus:
      | Feld        | Wert         |
      |--------------|--------------|
      | **Name**     | PostgresDB   |
      | **Host name**| postgres_db  |
      | **Port**     | 5432         |
      | **Username** | masteruser   |
      | **Password** | masterpass   |
→ Anschließend wird die Verbindung hergestellt.

---
## 4. ⚙️ Installation von Node.js und NVM
Node.js wird benötigt, um Frontend- oder Backend-Entwicklungen (React, Vite, Express etc.) auszuführen.
NVM (Node Version Manager) erlaubt das parallele Installieren und Umschalten verschiedener Node-Versionen.
1. Download NVM für Windows https://github.com/coreybutler/nvm-windows/releases
<br> Datei: nvm-setup.exe
2. Installation starten
   - Standardpfade beibehalten
3. Neues Terminal öffnen (PowerShell oder CMD) (NVM überprüfen)
```
nvm version
```
4. Node.js LTS installieren (empfohlen v20.x)
```
nvm install 20
nvm use 20
```
5. Versionen prüfen
```
node -v
npm -v
```

---
## 5. 🧰 Visual Studio Code Setup

### Installation:
- Download: https://code.visualstudio.com/
- Empfohlene Erweiterungen:
  - Docker
  - Python
  - Tailwind CSS IntelliSense
  - ESLint
  - Prettier (optional für Code-Formatierung)
