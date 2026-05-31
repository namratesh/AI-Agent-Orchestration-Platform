# Oracle Cloud Deployment Guide — AI Agent Orchestration Platform

Complete step-by-step guide to deploying the full stack (FastAPI backend, React
frontend, PostgreSQL, Redis, RQ worker, Prometheus, Grafana, Jaeger) on Oracle
Cloud Infrastructure (OCI) using a single VM and Docker Compose.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Prerequisites](#2-prerequisites)
3. [Oracle Cloud: Create a VM Instance](#3-oracle-cloud-create-a-vm-instance)
4. [Oracle Cloud: Open Firewall Ports](#4-oracle-cloud-open-firewall-ports)
5. [Server Initial Setup](#5-server-initial-setup)
6. [Install Docker & Docker Compose](#6-install-docker--docker-compose)
7. [Clone the Repository](#7-clone-the-repository)
8. [Configure Environment Variables](#8-configure-environment-variables)
9. [Generate Encryption Keys](#9-generate-encryption-keys)
10. [Build and Start All Services](#10-build-and-start-all-services)
11. [Run Database Migrations](#11-run-database-migrations)
12. [Configure Nginx Reverse Proxy (HTTPS)](#12-configure-nginx-reverse-proxy-https)
13. [Set Up SSL with Certbot (Let's Encrypt)](#13-set-up-ssl-with-certbot-lets-encrypt)
14. [Telegram Bot Setup](#14-telegram-bot-setup)
15. [Slack Bot Setup](#15-slack-bot-setup)
16. [Verify Everything Is Running](#16-verify-everything-is-running)
17. [Monitoring — Grafana, Prometheus, Jaeger](#17-monitoring--grafana-prometheus-jaeger)
18. [Systemd Service (Auto-restart on Reboot)](#18-systemd-service-auto-restart-on-reboot)
19. [Useful Maintenance Commands](#19-useful-maintenance-commands)
20. [Security Hardening Checklist](#20-security-hardening-checklist)
21. [Troubleshooting](#21-troubleshooting)

---

## 1. Architecture Overview

```
Internet
    │
    ▼
[Nginx :80/:443]  ← SSL termination + reverse proxy
    │
    ├── /           → frontend:3000  (React SPA via nginx)
    ├── /agents     → backend:8000   (FastAPI)
    ├── /workflows  → backend:8000
    ├── /slack      → backend:8000   (webhook, no auth)
    ├── /telegram   → backend:8000   (webhook, no auth)
    ├── /ws/        → backend:8000   (WebSocket upgrade)
    └── /metrics    → backend:8000   (Prometheus scrape)

Internal Docker network (agent-net):
  backend:8000  ←→  postgres:5432
  backend:8000  ←→  redis:6379
  worker        ←→  postgres:5432 + redis:6379
  jaeger:4318   ←   backend (OTLP traces)
  prometheus    ←   backend:8000/metrics
  grafana       ←   prometheus:9090
```

Ports exposed on the host:
| Port | Service         | Notes                      |
|------|-----------------|----------------------------|
| 80   | Nginx           | Redirect to HTTPS          |
| 443  | Nginx (HTTPS)   | Main entry point           |
| 16686| Jaeger UI       | Restrict to trusted IPs    |
| 9090 | Prometheus      | Restrict to trusted IPs    |
| 3001 | Grafana         | Restrict to trusted IPs    |

---

## 2. Prerequisites

- Oracle Cloud account (free tier works — use **VM.Standard.E2.1.Micro** or larger)
- A domain name pointed to your OCI VM's public IP (required for HTTPS + Telegram webhook)
- An LLM API key: OpenRouter (recommended for free tier), OpenAI, or Groq
- A Tavily API key (free at tavily.com) — for web search tool
- SSH client on your local machine

---

## 3. Oracle Cloud: Create a VM Instance

### 3.1 Launch Instance

1. Log in to [cloud.oracle.com](https://cloud.oracle.com)
2. Navigate to **Compute → Instances → Create Instance**
3. Configure:
   - **Name**: `ai-agent-platform`
   - **Image**: `Canonical Ubuntu 22.04` (minimal)
   - **Shape**: `VM.Standard.E2.1.Micro` (Always Free) or `VM.Standard.E3.Flex` (2 OCPUs, 8 GB RAM recommended for full stack)
   - **Networking**: Create or use default VCN; assign a **public IP**
   - **SSH keys**: Upload your public key (`~/.ssh/id_rsa.pub`) or generate a new pair

4. Click **Create** and wait ~2 minutes for provisioning.

5. Note the **Public IP address** shown in Instance Details.

### 3.2 Point Your Domain

In your DNS provider, add an A record:
```
Type: A
Name: @  (or subdomain like "agents")
Value: <YOUR_OCI_PUBLIC_IP>
TTL: 300
```

---

## 4. Oracle Cloud: Open Firewall Ports

OCI has two layers of firewall: the **Security List** (VCN level) and the **OS firewall** (iptables on the VM).

### 4.1 OCI Security List

1. Go to **Networking → Virtual Cloud Networks → [your VCN] → Security Lists → Default Security List**
2. Click **Add Ingress Rules** and add:

| Source CIDR   | Protocol | Port Range | Description         |
|---------------|----------|------------|---------------------|
| 0.0.0.0/0     | TCP      | 22         | SSH                 |
| 0.0.0.0/0     | TCP      | 80         | HTTP (redirect)     |
| 0.0.0.0/0     | TCP      | 443        | HTTPS               |
| YOUR_IP/32    | TCP      | 3001       | Grafana (your IP only) |
| YOUR_IP/32    | TCP      | 9090       | Prometheus (your IP only) |
| YOUR_IP/32    | TCP      | 16686      | Jaeger UI (your IP only) |

> Replace `YOUR_IP` with your office/home IP for monitoring ports.

### 4.2 OS Firewall (iptables / ufw)

SSH into the VM and run:

```bash
# Allow ports through Ubuntu's firewall
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 3001/tcp   # Grafana — restrict to your IP in production
sudo ufw allow 9090/tcp   # Prometheus
sudo ufw allow 16686/tcp  # Jaeger

sudo ufw --force enable
sudo ufw status
```

OCI's default iptables also block traffic. Run this to open all required ports:

```bash
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 3001 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 9090 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 16686 -j ACCEPT

# Persist across reboots
sudo netfilter-persistent save
```

---

## 5. Server Initial Setup

```bash
# SSH into your OCI VM
ssh ubuntu@<YOUR_OCI_PUBLIC_IP>

# Update and install essentials
sudo apt-get update && sudo apt-get upgrade -y
sudo apt-get install -y \
  curl wget git unzip \
  nginx certbot python3-certbot-nginx \
  netfilter-persistent iptables-persistent \
  htop

# Set timezone
sudo timedatectl set-timezone UTC

# Create a dedicated app user (optional but recommended)
sudo useradd -m -s /bin/bash appuser
sudo usermod -aG sudo appuser
sudo usermod -aG docker appuser  # will be valid after Docker install
```

---

## 6. Install Docker & Docker Compose

```bash
# Remove old Docker versions
sudo apt-get remove -y docker docker-engine docker.io containerd runc 2>/dev/null

# Install Docker via official script
curl -fsSL https://get.docker.com | sudo sh

# Add your user to the docker group (log out and back in after this)
sudo usermod -aG docker $USER

# Install Docker Compose v2 plugin
sudo apt-get install -y docker-compose-plugin

# Verify
docker --version          # Docker version 24.x.x
docker compose version    # Docker Compose version v2.x.x

# Start Docker on boot
sudo systemctl enable docker
sudo systemctl start docker
```

> **Important**: Log out and SSH back in so the `docker` group membership takes effect.

---

## 7. Clone the Repository

```bash
# SSH back in after logging out
ssh ubuntu@<YOUR_OCI_PUBLIC_IP>

# Clone your repository
git clone https://github.com/<YOUR_GITHUB_USER>/ai-agent-orchestration-platform.git
cd ai-agent-orchestration-platform

# Verify the structure
ls -la
# Should show: backend/ frontend/ docker-compose.yml prometheus.yml grafana/ migrations/
```

---

## 8. Configure Environment Variables

Create the `.env` file in the project root (same directory as `docker-compose.yml`):

```bash
cp .env.example .env 2>/dev/null || touch .env
nano .env
```

Paste and fill in all values:

```bash
# ─────────────────────────────────────────────────────────────────────────────
# AI Agent Orchestration Platform — Production Environment
# ─────────────────────────────────────────────────────────────────────────────

# ── Authentication ────────────────────────────────────────────────────────────
# Set a strong random string. All /agents /workflows etc. require this header:
#   Authorization: Bearer <API_SECRET_KEY>
# Leave empty to disable auth (NOT recommended for production).
API_SECRET_KEY=your-super-secret-key-change-this-now

# ── CORS ──────────────────────────────────────────────────────────────────────
# Add your domain. The frontend container is at port 3000 internally.
ALLOWED_ORIGINS=["https://yourdomain.com","http://localhost:5173"]

# ── LLM Provider ─────────────────────────────────────────────────────────────
# Choose one: openai | openrouter | groq | ollama
LLM_PROVIDER=openrouter

# OpenRouter (recommended — access many models, generous free tier)
OPENROUTER_API_KEY=sk-or-v1-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
OPENROUTER_MODEL=openai/gpt-3.5-turbo

# OpenAI (uncomment if using OpenAI directly)
# OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
# OPENAI_MODEL=gpt-4-turbo

# Groq (ultra-fast inference, free tier available)
# GROQ_API_KEY=gsk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Ollama (local models — only if running Ollama on the same host)
# OLLAMA_BASE_URL=http://host.docker.internal:11434

# ── Tools ─────────────────────────────────────────────────────────────────────
# Tavily web search — free tier: 1,000 searches/month
TAVILY_API_KEY=tvly-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# ── Encryption ────────────────────────────────────────────────────────────────
# REQUIRED: encrypts tool API keys stored in PostgreSQL.
# Generate with: python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
# WARNING: changing this invalidates all stored tool API keys.
TOOL_ENCRYPTION_KEY=your-fernet-key-here

# ── Telegram ──────────────────────────────────────────────────────────────────
# Legacy single-bot token. Leave empty if using Named Bots (recommended).
TELEGRAM_BOT_TOKEN=

# ── Logging ───────────────────────────────────────────────────────────────────
LOG_LEVEL=INFO

# ── Infrastructure ────────────────────────────────────────────────────────────
# These are set automatically by docker-compose.yml — do not change.
DATABASE_URL=postgresql://postgres:postgres@postgres:5432/agent_db
REDIS_URL=redis://redis:6379
```

> **Security**: `.env` is in `.gitignore`. Never commit it to version control.

---

## 9. Generate Encryption Keys

Generate the required `TOOL_ENCRYPTION_KEY`:

```bash
# On the server (Python 3 is pre-installed on Ubuntu 22.04)
python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

Copy the output (looks like `dGhpcyBpcyBhIHRlc3Q=...`) and paste it as `TOOL_ENCRYPTION_KEY` in `.env`.

Generate a strong `API_SECRET_KEY`:

```bash
python3 -c "import secrets; print(secrets.token_urlsafe(48))"
```

---

## 10. Build and Start All Services

```bash
cd ~/ai-agent-orchestration-platform

# Build all Docker images (first run takes ~5-10 minutes)
docker compose build

# Start all services in detached mode
docker compose up -d

# Watch startup logs
docker compose logs -f
# Press Ctrl+C to stop following logs (services keep running)

# Verify all containers are healthy
docker compose ps
```

Expected output:
```
NAME         IMAGE          STATUS                   PORTS
backend      ...backend     Up (healthy)             0.0.0.0:8000->8000/tcp
frontend     ...frontend    Up                       0.0.0.0:3000->3000/tcp
postgres     pgvector...    Up (healthy)             0.0.0.0:5432->5432/tcp
redis        redis:7...     Up (healthy)             0.0.0.0:6379->6379/tcp
worker       ...backend     Up                       
jaeger       jaeger...      Up                       0.0.0.0:16686->16686/tcp
prometheus   prom/...       Up                       0.0.0.0:9090->9090/tcp
grafana      grafana/...    Up                       0.0.0.0:3001->3000/tcp
```

---

## 11. Run Database Migrations

The PostgreSQL migrations run automatically on first start because the `migrations/`
directory is mounted to `/docker-entrypoint-initdb.d`.  Verify they ran:

```bash
docker compose exec postgres psql -U postgres -d agent_db -c "\dt"
```

Expected tables:
```
 agents
 channel_bots
 messages
 slack_channel_mappings
 telegram_chat_mappings
 tools
 workflow_execution_checkpoints
 workflow_executions
 workflow_integrations
 workflow_schedules
 workflows
```

If you need to re-run migrations manually:

```bash
# Connect to the database container
docker compose exec postgres psql -U postgres -d agent_db

# Inside psql — run a specific migration file
\i /docker-entrypoint-initdb.d/001_init.sql

# Exit
\q
```

---

## 12. Configure Nginx Reverse Proxy (HTTPS)

Stop the default nginx site and create the platform configuration:

```bash
sudo rm -f /etc/nginx/sites-enabled/default

sudo nano /etc/nginx/sites-available/ai-agent-platform
```

Paste this configuration (replace `yourdomain.com`):

```nginx
# ── HTTP: redirect all traffic to HTTPS ──────────────────────────────────────
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;

    # Allow Let's Encrypt ACME challenge (needed for cert issuance)
    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        return 301 https://$host$request_uri;
    }
}

# ── HTTPS: main entry point ───────────────────────────────────────────────────
server {
    listen 443 ssl http2;
    server_name yourdomain.com www.yourdomain.com;

    # SSL certificates (filled in by Certbot — see step 13)
    ssl_certificate     /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;
    include             /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam         /etc/letsencrypt/ssl-dhparams.pem;

    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Content-Type-Options nosniff always;
    add_header X-Frame-Options DENY always;
    add_header X-XSS-Protection "1; mode=block" always;

    # ── Frontend (React SPA) ──────────────────────────────────────────────────
    location / {
        proxy_pass         http://127.0.0.1:3000;
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
    }

    # ── Backend API (protected routes) ───────────────────────────────────────
    location ~ ^/(agents|workflows|executions|stats|tools|schedules|integrations|bots|seed)(/|$) {
        proxy_pass         http://127.0.0.1:8000;
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
        client_max_body_size 10m;
    }

    # ── Webhooks (Slack, Telegram) — no auth ─────────────────────────────────
    location ~ ^/(slack|telegram)(/|$) {
        proxy_pass         http://127.0.0.1:8000;
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_read_timeout 30s;
    }

    # ── WebSocket endpoints ───────────────────────────────────────────────────
    location /ws/ {
        proxy_pass             http://127.0.0.1:8000;
        proxy_http_version     1.1;
        proxy_set_header       Upgrade $http_upgrade;
        proxy_set_header       Connection "upgrade";
        proxy_set_header       Host $host;
        proxy_read_timeout     3600s;
        proxy_send_timeout     3600s;
    }

    # ── Prometheus metrics (internal scraping) ────────────────────────────────
    location /metrics {
        proxy_pass http://127.0.0.1:8000;
        # Restrict to Prometheus container IP only
        allow 172.16.0.0/12;
        allow 127.0.0.1;
        deny all;
    }
}
```

Enable the site and test:

```bash
sudo ln -s /etc/nginx/sites-available/ai-agent-platform /etc/nginx/sites-enabled/
sudo nginx -t       # must print: configuration file ... syntax is ok
sudo systemctl reload nginx
```

---

## 13. Set Up SSL with Certbot (Let's Encrypt)

> **Requirement**: Your domain DNS must be pointing to the server's public IP before running this.

```bash
# Issue certificate (replace yourdomain.com with your actual domain)
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com \
  --email your@email.com \
  --agree-tos \
  --non-interactive

# Verify auto-renewal works
sudo certbot renew --dry-run
```

Certbot automatically edits your nginx config to add the SSL certificate paths
and creates a cron job to renew the certificate every 90 days.

---

## 14. Telegram Bot Setup

### 14.1 Create a Telegram Bot

1. Open Telegram and search for **@BotFather**
2. Send `/newbot`
3. Follow prompts:
   - **Name**: `My Agent Platform` (display name)
   - **Username**: `myagentplatform_bot` (must end in `bot`)
4. BotFather gives you a token: `1234567890:ABCdefGHIjklMNOpqrSTUvwxYZ`
5. **Copy and save this token.**

### 14.2 Create a Named Bot in the Platform UI

1. Open `https://yourdomain.com` in your browser
2. Navigate to **Settings → Bots → Add Bot**
3. Fill in:
   - **Name**: `My Telegram Bot`
   - **Channel Type**: `Telegram`
   - **Bot Token**: paste the token from BotFather
4. Click **Save**. Note the **Bot ID** (UUID) shown in the list.

### 14.3 Register the Webhook with Telegram

Replace `<BOT_TOKEN>` and `<BOT_ID>` in the command below:

```bash
# Register the per-bot webhook (Named Bot path — recommended)
curl -X POST "https://api.telegram.org/bot<BOT_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://yourdomain.com/telegram/webhook/<BOT_ID>",
    "allowed_updates": ["message", "edited_message"]
  }'

# Verify the webhook was registered
curl "https://api.telegram.org/bot<BOT_TOKEN>/getWebhookInfo"
```

Expected response:
```json
{
  "ok": true,
  "result": {
    "url": "https://yourdomain.com/telegram/webhook/<BOT_ID>",
    "has_custom_certificate": false,
    "pending_update_count": 0
  }
}
```

### 14.4 Get Your Telegram Chat ID

1. Send any message to your bot in Telegram (e.g. `/start`)
2. Fetch the update to find your `chat_id`:

```bash
curl "https://api.telegram.org/bot<BOT_TOKEN>/getUpdates"
```

Look for `"chat": {"id": 123456789}` in the response. That number is your `chat_id`.

### 14.5 Create a Workflow and Map the Chat

1. In the platform UI, create a workflow (or use the demo one from **Settings → Seed Demo**)
2. Navigate to **Settings → Bots → [Your Bot] → Telegram Mappings → Add Mapping**
3. Fill in:
   - **Chat ID**: `123456789` (from the previous step)
   - **Workflow**: select your workflow
4. Click **Save**

### 14.6 Test the Telegram Integration

Send a message to your bot in Telegram:
```
What is the current Bitcoin price?
```

The bot should reply within a few seconds with the workflow result.

### 14.7 Troubleshooting Telegram

```bash
# Check backend logs for telegram events
docker compose logs backend | grep telegram

# Check for webhook errors
curl "https://api.telegram.org/bot<BOT_TOKEN>/getWebhookInfo" | python3 -m json.tool

# Manually delete a stuck webhook
curl "https://api.telegram.org/bot<BOT_TOKEN>/deleteWebhook"

# Re-register
curl -X POST "https://api.telegram.org/bot<BOT_TOKEN>/setWebhook" \
  -d "url=https://yourdomain.com/telegram/webhook/<BOT_ID>"
```

Common issues:
- `"error_code": 401` → wrong bot token
- `"url": ""` → webhook not registered; re-run setWebhook
- Bot doesn't reply → check chat mapping in platform UI; check `docker compose logs worker`

---

## 15. Slack Bot Setup

### 15.1 Create a Slack App

1. Go to [api.slack.com/apps](https://api.slack.com/apps) → **Create New App** → **From Scratch**
2. Name: `AI Agent Platform`, Workspace: select your workspace
3. Under **OAuth & Permissions → Bot Token Scopes**, add:
   - `chat:write`
   - `channels:history`
   - `groups:history`
   - `im:history`
4. Click **Install to Workspace** → copy the **Bot User OAuth Token** (`xoxb-...`)
5. Under **Basic Information**, copy the **Signing Secret**

### 15.2 Create a Named Bot in the Platform UI

1. Navigate to **Settings → Bots → Add Bot**
2. Fill in:
   - **Name**: `My Slack Bot`
   - **Channel Type**: `Slack`
   - **Bot Token**: `xoxb-...`
   - **Signing Secret**: from Basic Information
3. Click **Save** and note the **Bot ID**

### 15.3 Register the Events API URL

1. In your Slack app → **Event Subscriptions → Enable Events**
2. Set **Request URL**: `https://yourdomain.com/slack/events`
3. Slack sends a challenge request — the platform responds automatically
4. URL shows ✅ **Verified**
5. Under **Subscribe to Bot Events**, add: `message.channels`, `message.groups`
6. Click **Save Changes** and **Reinstall App**

### 15.4 Invite Bot and Map Channel

```bash
# In Slack: invite the bot to a channel
/invite @ai-agent-platform
```

Get the channel ID (right-click channel → View channel details → copy ID starting with `C`).

In platform UI → **Settings → Bots → [Your Slack Bot] → Slack Mappings → Add Mapping**:
- **Channel ID**: `C01234567` 
- **Channel Name**: `#general` (optional, display only)
- **Workflow**: select your workflow

---

## 16. Verify Everything Is Running

```bash
# All containers healthy
docker compose ps

# Backend health check
curl http://localhost:8000/docs   # FastAPI Swagger UI

# Frontend
curl -I http://localhost:3000

# Test via HTTPS (your domain)
curl https://yourdomain.com/stats \
  -H "Authorization: Bearer <API_SECRET_KEY>"

# Check RQ worker has picked up the executions queue
docker compose exec worker rq info --url redis://redis:6379

# Seed demo data
curl -X POST https://yourdomain.com/seed \
  -H "Authorization: Bearer <API_SECRET_KEY>"
```

---

## 17. Monitoring — Grafana, Prometheus, Jaeger

### Grafana

Access at `http://<YOUR_OCI_PUBLIC_IP>:3001`
- **Default login**: `admin` / `admin` (change immediately)
- Change in OCI Security List to restrict to your IP only

Add Prometheus as a data source:
1. **Configuration → Data Sources → Add data source → Prometheus**
2. URL: `http://prometheus:9090`
3. Click **Save & Test**

Pre-built dashboards are provisioned automatically from `grafana/provisioning/`.

### Prometheus

Access at `http://<YOUR_OCI_PUBLIC_IP>:9090`

Key metrics to watch:
```
agent_executions_total          # total agent runs
agent_tokens_total              # LLM tokens consumed
agent_cost_total                # USD cost accumulated
agent_execution_duration_bucket # latency histogram
workflow_executions_total       # workflow runs
```

### Jaeger (Distributed Tracing)

Access at `http://<YOUR_OCI_PUBLIC_IP>:16686`
- Select **Service**: `ai-agent-orchestration`
- Find traces for individual agent and workflow executions

---

## 18. Systemd Service (Auto-restart on Reboot)

Create a systemd unit to automatically start the platform when the VM reboots:

```bash
sudo nano /etc/systemd/system/ai-agent-platform.service
```

Paste:

```ini
[Unit]
Description=AI Agent Orchestration Platform
Requires=docker.service
After=docker.service network-online.target

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/home/ubuntu/ai-agent-orchestration-platform
ExecStart=/usr/bin/docker compose up -d
ExecStop=/usr/bin/docker compose down
TimeoutStartSec=300
User=ubuntu

[Install]
WantedBy=multi-user.target
```

Enable and test:

```bash
sudo systemctl daemon-reload
sudo systemctl enable ai-agent-platform
sudo systemctl start ai-agent-platform

# Verify
sudo systemctl status ai-agent-platform
```

---

## 19. Useful Maintenance Commands

```bash
# ── View logs ─────────────────────────────────────────────────────────────────
docker compose logs -f backend          # live backend logs
docker compose logs -f worker           # live worker logs
docker compose logs --tail=100 backend  # last 100 lines

# ── Restart a single service ──────────────────────────────────────────────────
docker compose restart backend
docker compose restart worker

# ── Rebuild after a code change ───────────────────────────────────────────────
git pull
docker compose build backend frontend
docker compose up -d --no-deps backend frontend worker

# ── Database access ───────────────────────────────────────────────────────────
docker compose exec postgres psql -U postgres -d agent_db

# View recent executions
docker compose exec postgres psql -U postgres -d agent_db \
  -c "SELECT id, status, task, cost, created_at FROM workflow_executions ORDER BY created_at DESC LIMIT 10;"

# ── Redis inspection ──────────────────────────────────────────────────────────
docker compose exec redis redis-cli
KEYS *               # list all keys
LLEN rq:queue:executions   # pending jobs in the queue

# ── RQ worker info ────────────────────────────────────────────────────────────
docker compose exec worker rq info --url redis://redis:6379

# ── Disk usage ────────────────────────────────────────────────────────────────
docker system df
df -h

# ── Clean up unused Docker resources ─────────────────────────────────────────
docker system prune -f          # removes stopped containers, dangling images
docker volume prune -f          # WARNING: removes unused volumes

# ── Full stop and start ───────────────────────────────────────────────────────
docker compose down
docker compose up -d

# ── Backup PostgreSQL ─────────────────────────────────────────────────────────
docker compose exec postgres pg_dump -U postgres agent_db > backup_$(date +%Y%m%d).sql

# ── Restore PostgreSQL ────────────────────────────────────────────────────────
docker compose exec -T postgres psql -U postgres agent_db < backup_20240101.sql
```

---

## 20. Security Hardening Checklist

```bash
# ── SSH hardening ─────────────────────────────────────────────────────────────
sudo nano /etc/ssh/sshd_config
# Set: PasswordAuthentication no
# Set: PermitRootLogin no
sudo systemctl restart sshd

# ── Fail2ban (SSH brute-force protection) ─────────────────────────────────────
sudo apt-get install -y fail2ban
sudo systemctl enable fail2ban
sudo systemctl start fail2ban

# ── Automatic security updates ────────────────────────────────────────────────
sudo apt-get install -y unattended-upgrades
sudo dpkg-reconfigure --priority=low unattended-upgrades

# ── Secrets rotation ──────────────────────────────────────────────────────────
# To rotate API_SECRET_KEY:
# 1. Generate new key: python3 -c "import secrets; print(secrets.token_urlsafe(48))"
# 2. Update .env
# 3. docker compose up -d --no-deps backend worker
# 4. Update VITE_API_KEY in frontend .env.production and rebuild

# ── Rotate TOOL_ENCRYPTION_KEY (destructive — re-enter all tool API keys) ─────
# 1. Export all tool API keys from the UI before rotating
# 2. Generate new key: python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
# 3. Update .env
# 4. docker compose up -d --no-deps backend worker
# 5. Re-enter tool API keys in the UI
```

Platform-specific checklist:
- [ ] `API_SECRET_KEY` is set to a strong random string (not empty)
- [ ] `TOOL_ENCRYPTION_KEY` is set and backed up securely
- [ ] PostgreSQL port 5432 is **not** exposed in OCI Security List (internal only)
- [ ] Redis port 6379 is **not** exposed in OCI Security List (internal only)
- [ ] Grafana / Prometheus / Jaeger ports are restricted to trusted IPs
- [ ] SSL certificate is valid (`sudo certbot renew --dry-run` succeeds)
- [ ] `.env` is not committed to version control (check with `git status`)
- [ ] SSH password auth is disabled

---

## 21. Troubleshooting

### Backend fails to start

```bash
docker compose logs backend | tail -50
```

Common causes:
- `TOOL_ENCRYPTION_KEY` not set → generate and add to `.env`
- `DATABASE_URL` unreachable → ensure postgres container is healthy: `docker compose ps postgres`
- Port 8000 already in use → `sudo lsof -i :8000`

### Workers not processing jobs

```bash
docker compose logs worker | tail -50
docker compose exec worker rq info --url redis://redis:6379
```

If queue shows jobs stuck as `started`:

```bash
# Clear failed jobs
docker compose exec worker rq empty failed --url redis://redis:6379
```

### Telegram bot not responding

```bash
# 1. Check webhook is registered
curl "https://api.telegram.org/bot<TOKEN>/getWebhookInfo"

# 2. Check backend receives the request
docker compose logs backend | grep telegram

# 3. Check worker processes the workflow
docker compose logs worker | grep workflow_start

# 4. Verify chat mapping exists in the platform
curl https://yourdomain.com/telegram/mappings \
  -H "Authorization: Bearer <API_SECRET_KEY>"
```

### HTTPS certificate errors

```bash
# Check certificate validity
sudo certbot certificates

# Force renewal if near expiry
sudo certbot renew --force-renewal

sudo systemctl reload nginx
```

### "502 Bad Gateway" from Nginx

```bash
# Check backend is running
docker compose ps backend
curl http://localhost:8000/docs

# Check nginx error log
sudo tail -50 /var/log/nginx/error.log
```

### Database connection errors

```bash
# Check postgres health
docker compose exec postgres pg_isready -U postgres

# Check database exists
docker compose exec postgres psql -U postgres -l
```

---

## Quick Reference

| URL                                          | Description              |
|----------------------------------------------|--------------------------|
| `https://yourdomain.com`                     | Platform UI              |
| `https://yourdomain.com/docs`                | FastAPI Swagger UI       |
| `http://<IP>:3001`                           | Grafana dashboard        |
| `http://<IP>:9090`                           | Prometheus metrics       |
| `http://<IP>:16686`                          | Jaeger traces            |
| `https://yourdomain.com/slack/events`        | Slack Events API URL     |
| `https://yourdomain.com/telegram/webhook/<BOT_ID>` | Telegram webhook URL |

| Command                                      | Description              |
|----------------------------------------------|--------------------------|
| `docker compose up -d`                       | Start all services       |
| `docker compose down`                        | Stop all services        |
| `docker compose logs -f backend`             | Live backend logs        |
| `docker compose restart backend worker`      | Restart API + worker     |
| `docker compose pull && docker compose up -d`| Update to latest images  |
| `git pull && docker compose build && docker compose up -d` | Deploy code update |
