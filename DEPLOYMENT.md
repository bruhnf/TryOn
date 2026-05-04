# AWS Lightsail Deployment Guide

---

## ⚠️ QUICK DEPLOY REFERENCE (Read This First!)

**Every time you deploy changes to Lightsail:**

```bash
# SSH into Lightsail
ssh ubuntu@<your-lightsail-ip>
cd /opt/evofaceflow/TryOn

# Pull latest code
git pull

# Rebuild and restart containers
docker compose -f docker-compose.prod.yml up -d --build

# ⚠️ CRITICAL: Apply any database migrations
docker compose -f docker-compose.prod.yml exec backend npx prisma migrate deploy
```

> **🚨 WARNING:** If you skip the `prisma migrate deploy` step after schema changes, the backend will crash with database errors!

---

## Database Migrations Explained

### What Are Migrations?

Prisma migrations are SQL scripts that update your database schema (tables, columns, indexes) to match changes in `backend/prisma/schema.prisma`. They're stored in `backend/prisma/migrations/`.

### When to Run Migrations

Run `npx prisma migrate deploy` whenever:

| Scenario | Command |
|----------|---------|
| **First-time setup** (fresh database) | Required — creates all tables |
| **After `git pull`** with schema changes | Required — applies new migrations |
| **After adding new fields/models** | Required — adds columns/tables |
| **Routine deploy with no schema changes** | Safe to run (no-op if nothing new) |

### What Happens If You Skip It?

The backend will crash with errors like:
```
PrismaClientKnownRequestError: The table `public.users` does not exist
```

### Migration Commands

```bash
# Production (Lightsail) — apply existing migrations
docker compose -f docker-compose.prod.yml exec backend npx prisma migrate deploy

# Local Docker — apply existing migrations  
docker compose exec backend npx prisma migrate deploy

# Local development (no Docker) — create + apply migrations
cd backend && npx prisma migrate dev
```

### Current Migrations

| Migration | Purpose |
|-----------|---------|
| `20260427213923_init` | Initial schema (Users, TryOnJobs, Follows, etc.) |
| `20260428193554_subscription_to_credits` | Add credits system, CreditTransaction model |
| `20260428210000_add_user_names` | Add firstName, lastName to Users |
| `20260429220000_add_tryon_privacy` | Add isPrivate field to TryOnJobs |

---

## Prerequisites

- AWS Lightsail instance running Ubuntu 22.04
- Domain `evofaceflow.com` pointing to the Lightsail instance IP
- SSH access configured

## 1. Initial Server Setup

SSH into your Lightsail instance:

```bash
ssh ubuntu@<your-lightsail-ip>
```

### Install Docker and Docker Compose

```bash
# Update packages
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker ubuntu

# Install Docker Compose plugin
sudo apt install docker-compose-plugin -y

# Verify installation
docker --version
docker compose version

# Log out and back in for group changes to take effect
exit
```

### Install Certbot for SSL

```bash
ssh ubuntu@<your-lightsail-ip>

sudo apt install certbot -y
```

## 2. Clone Repository

```bash
sudo mkdir -p /opt/evofaceflow
sudo chown ubuntu:ubuntu /opt/evofaceflow
cd /opt/evofaceflow
git clone https://github.com/YOUR_USERNAME/TryOn.git
cd TryOn
```

## 3. Configure Environment Variables

### Root .env file (for Docker Compose)

```bash
cp .env.example .env
nano .env
```

Set secure values:
```
POSTGRES_USER=tryon_prod
POSTGRES_PASSWORD=<generate: openssl rand -hex 32>
POSTGRES_DB=tryon_db
```

### Backend .env file

```bash
cp backend/.env.example backend/.env
nano backend/.env
```

Fill in all required values. Generate secrets with:
```bash
openssl rand -hex 32  # For JWT_SECRET, JWT_REFRESH_SECRET, ADMIN_API_KEY
```

**Important:** Set `ALLOWED_ORIGINS` to include the website domain:
```
ALLOWED_ORIGINS=https://evofaceflow.com
```

## 4. SSL Certificate Setup

### Create certbot directory structure

```bash
cd /opt/evofaceflow/TryOn
mkdir -p certbot/www
```

### Get initial certificate (before nginx starts)

Stop any running services using port 80:
```bash
sudo docker compose -f docker-compose.prod.yml down 2>/dev/null || true
```

Get certificate:
```bash
sudo certbot certonly --standalone -d evofaceflow.com -d www.evofaceflow.com -d api.evofaceflow.com
```

### Auto-renewal cron job

```bash
sudo crontab -e
```

Add:
```
0 0 * * * certbot renew --quiet --post-hook "docker compose -f /opt/evofaceflow/TryOn/docker-compose.prod.yml restart nginx"
```

## 5. Deploy Application

### Build and start all services

```bash
cd /opt/evofaceflow/TryOn
docker compose -f docker-compose.prod.yml up -d --build
```

### Run database migrations

```bash
docker compose -f docker-compose.prod.yml exec backend npx prisma migrate deploy
```

### Verify services are running

```bash
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs backend
```

### Test health endpoint

```bash
curl https://api.evofaceflow.com/health
```

## 6. Lightsail Firewall Configuration

In the AWS Lightsail console, go to your instance > Networking > Firewall:

- Allow TCP 80 (HTTP)
- Allow TCP 443 (HTTPS)
- Allow TCP 22 (SSH)
- Block all other ports

## 7. Fail2ban Setup

Fail2ban is included in the Docker Compose configuration and will automatically ban IPs that:
- Generate too many 404 errors (vulnerability scanners)
- Request PHP files (we don't serve PHP)
- Request WordPress paths (we don't run WordPress)
- Send malicious requests (SQL injection, XSS attempts)
- Have excessive failed auth attempts

### Verify fail2ban is running

```bash
docker compose -f docker-compose.prod.yml logs fail2ban
```

### Check banned IPs

```bash
docker compose -f docker-compose.prod.yml exec fail2ban fail2ban-client status
docker compose -f docker-compose.prod.yml exec fail2ban fail2ban-client status nginx-404
```

### Unban an IP

```bash
docker compose -f docker-compose.prod.yml exec fail2ban fail2ban-client set nginx-404 unbanip 1.2.3.4
```

### Configuration files

- `fail2ban/jail.local` — jail definitions (ban times, retry limits)
- `fail2ban/filter.d/*.conf` — regex patterns for each jail

## 8. Admin Dashboard

Access the admin dashboard at `https://api.evofaceflow.com/admin`

Login with the `ADMIN_API_KEY` from your backend `.env` file.

Features:
- View user statistics, try-on jobs, and credits
- Create test users
- Verify/unverify user accounts
- Toggle subscriptions
- Adjust user credits
- View suspicious login attempts and security stats

## 9. Monitoring & Logs

### Application Logging (Winston)

The backend uses Winston for structured logging with daily file rotation.

**Log Levels:**
- `error` - Application errors, exceptions, failed operations
- `warn` - Warnings, suspicious activity (e.g., suspicious login locations)
- `info` - Key business events, successful operations
- `http` - HTTP request/response logging
- `debug` - Detailed debugging information

**Environment Variables:**
```bash
LOG_LEVEL=debug       # Set log level (default: debug in dev, info in prod)
LOG_DIR=/var/log/tryon  # Log file directory (default: ./logs)
LOG_TO_FILE=true      # Enable file logging in development
```

**Log Files (Production):**

Located at `/var/log/tryon/` (Docker volume `backend_logs`):
- `combined-YYYY-MM-DD.log` - All logs, rotated daily, 14-day retention
- `error-YYYY-MM-DD.log` - Errors only, 30-day retention
- `exceptions-YYYY-MM-DD.log` - Unhandled exceptions
- `rejections-YYYY-MM-DD.log` - Unhandled promise rejections

### Viewing Logs

```bash
# Live Docker stdout/stderr logs (all services)
docker compose -f docker-compose.prod.yml logs -f

# Specific service Docker logs
docker compose -f docker-compose.prod.yml logs -f backend
docker compose -f docker-compose.prod.yml logs -f nginx
docker compose -f docker-compose.prod.yml logs -f postgres
docker compose -f docker-compose.prod.yml logs -f fail2ban

# Backend application log files (Winston)
docker compose -f docker-compose.prod.yml exec backend tail -f /var/log/tryon/combined-$(date +%Y-%m-%d).log

# View only errors
docker compose -f docker-compose.prod.yml exec backend tail -f /var/log/tryon/error-$(date +%Y-%m-%d).log

# View all log files
docker compose -f docker-compose.prod.yml exec backend ls -la /var/log/tryon/

# Access log volume directly on host
docker volume inspect www_backend_logs  # Find mount point
tail -f /var/lib/docker/volumes/www_backend_logs/_data/combined-*.log
```

### Log Management

Log files are automatically managed:
- **Daily rotation** - New file each day, prevents large files
- **14-day retention** - Combined logs auto-deleted after 14 days
- **30-day retention** - Error logs kept longer for debugging
- **Gzip compression** - Rotated logs are compressed

To manually clean old logs:
```bash
docker compose -f docker-compose.prod.yml exec backend find /var/log/tryon -name "*.log.gz" -mtime +30 -delete
```

### Request Tracing

All requests get a unique correlation ID (`x-correlation-id` header). Use this to trace a specific request through logs:

```bash
docker compose -f docker-compose.prod.yml exec backend grep "abc12345" /var/log/tryon/combined-$(date +%Y-%m-%d).log
```

### Resource Monitoring

```bash
docker stats
```

## 10. Database Backup

### Manual backup

```bash
docker compose -f docker-compose.prod.yml exec postgres pg_dump -U tryon_prod tryon_db > backup_$(date +%Y%m%d_%H%M%S).sql
```

### Automated daily backup (cron)

```bash
crontab -e
```

Add:
```
0 2 * * * cd /opt/evofaceflow/TryOn && docker compose -f docker-compose.prod.yml exec -T postgres pg_dump -U tryon_prod tryon_db | gzip > /opt/evofaceflow/backups/db_$(date +\%Y\%m\%d).sql.gz
```

Create backup directory:
```bash
mkdir -p /opt/evofaceflow/backups
```

## 11. Updating the Application

```bash
cd /opt/evofaceflow/TryOn
git pull origin main
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml exec backend npx prisma migrate deploy
```

## 12. Rollback Procedure

If deployment fails:

```bash
# Check which version is running
git log --oneline -5

# Rollback to previous commit
git checkout <previous-commit-hash>

# Rebuild and restart
docker compose -f docker-compose.prod.yml up -d --build
```

## 13. Local vs Live Development

The frontend can connect to either a local backend or the live Lightsail server.

### Configuration

Edit `frontend/src/config/api.ts`:

```typescript
// Change USE_LOCAL to switch environments:
const USE_LOCAL = false;  // false = live server, true = local

const LOCAL_URL = 'http://localhost:3000/api';
const LIVE_URL = 'https://api.evofaceflow.com/api';
```

### Local Development

1. Set `USE_LOCAL = true` in `frontend/src/config/api.ts`
2. Start backend locally:
   ```bash
   cd backend
   npm run dev
   ```
3. Start frontend:
   ```bash
   cd frontend
   npx expo start
   ```

### Testing Against Live Server

1. Set `USE_LOCAL = false` in `frontend/src/config/api.ts`
2. Start frontend with tunnel (required for Expo Go on physical devices):
   ```bash
   cd frontend
   npx expo start --tunnel
   ```
3. The backend is already running on Lightsail

### Pre-Commit Checklist

Before committing changes:
- Ensure `USE_LOCAL = false` in `frontend/src/config/api.ts`
- This ensures production builds always use the live server

## Troubleshooting

### Backend won't start

```bash
docker compose -f docker-compose.prod.yml logs backend
```

Common issues:
- Missing environment variables in backend/.env
- Database not ready (wait for postgres healthcheck)
- Prisma schema out of sync (run migrations)

### SSL certificate issues

```bash
# Check certificate status
sudo certbot certificates

# Force renewal
sudo certbot renew --force-renewal
```

### Database connection issues

```bash
# Check postgres is running
docker compose -f docker-compose.prod.yml exec postgres pg_isready

# Connect to database
docker compose -f docker-compose.prod.yml exec postgres psql -U tryon_prod tryon_db
```

### Out of memory

Lightsail 512MB instances may struggle. Consider:
- Upgrading to 1GB instance
- Reducing Redis maxmemory
- Setting NODE_OPTIONS="--max-old-space-size=384" in backend env
