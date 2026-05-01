FROM node:20-alpine
WORKDIR /app

# nur die Manifeste zuerst -> schnellere Layer-Caches
COPY package*.json ./
RUN npm ci

# Quellcode rein (wird gleich per volume überschrieben)
COPY . .

# Vite braucht 0.0.0.0 im Container
ENV VITE_HOST=0.0.0.0
# Dateiwatcher in Docker/WSL stabilisieren (optional, aber auf Windows sehr hilfreich)
ENV CHOKIDAR_USEPOLLING=true
# klarer Dev-Mode
ENV NODE_ENV=development
EXPOSE 5173

# Dev-Server
# --strictPort: nimm genau 5173 (Vite wechselt sonst auf 5174 usw.)
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "5173", "--strictPort"]
