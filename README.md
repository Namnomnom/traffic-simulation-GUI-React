# traffic-simulation-GUI-React

Dieses Repository dokumentiert die technische Infrastruktur und das Setup der Entwicklungsumgebung für die Masterarbeit.

---

## 📘 Ziel

Ziel dieses Projekts ist der Aufbau einer containerisierten Umgebung für eine Verkehrssimulationsplattform mit einer TimescaleDB-Datenbank, einer Verwaltungsoberfläche (pgAdmin) sowie einer Node.js-/React-Entwicklungsumgebung.

---

## 🐳 Docker & Docker Compose

### Installierte Software
- **Docker Desktop**  
- **Docker Compose**

### docker-compose.yml
```yaml
services:
  postgres:
    image: timescale/timescaledb-ha:pg14-latest
    container_name: postgres_db
    restart: always
    environment:
      POSTGRES_USER: masteruser
      POSTGRES_PASSWORD: masterpass
      POSTGRES_DB: traffic_data
    ports:
      - "5432:5432"
    volumes:
      - ./pgdata:/var/lib/postgresql/data
    networks:
      - traffic-net

  pgadmin:
    image: dpage/pgadmin4
    container_name: pgadmin
    restart: unless-stopped
    environment:
      PGADMIN_DEFAULT_EMAIL: "admin@trafficmail.com"
      PGADMIN_DEFAULT_PASSWORD: "admin123"
    ports:
      - "5050:80"
    depends_on:
      - postgres
    networks:
      - traffic-net

networks:
  traffic-net:
    driver: bridge
