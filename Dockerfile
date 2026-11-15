# AstroHealth Edge OS — Practical Flight/Habitat Deployment Container
# Builds a self-contained offline workstation with Python 3.11 + Node 22 runtime
FROM node:22-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-venv python3-pip sqlite3 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Node frontend/proxy dependencies and compile Vite bundle
COPY package.json package-lock.json* ./
RUN npm ci

# Optionally install standalone FastAPI/Pandas deliverables into /opt/venv
COPY deliverables/requirements.txt ./deliverables/requirements.txt
RUN python3 -m venv /opt/venv \
    && /opt/venv/bin/pip install --no-cache-dir -r deliverables/requirements.txt

COPY . .
RUN npm run build

ENV NODE_ENV=production
ENV ASTROHEALTH_PY_PORT=8001
EXPOSE 3000 8001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD python3 -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8001/health')" || exit 1

CMD ["npm", "start"]
