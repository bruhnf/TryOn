# AWS Lightsail Deployment Guide

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
cd ~
git clone https://github.com/YOUR_USERNAME/TryOn.git
cd TryOn/www
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

## 4. SSL Certificate Setup

### Create certbot directory structure

```bash
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
0 0 * * * certbot renew --quiet --post-hook "docker compose -f ~/TryOn/www/docker-compose.prod.yml restart nginx"
```

## 5. Deploy Application

### Build and start all services

```bash
cd ~/TryOn/www
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

## 7. Monitoring & Logs

### View logs

```bash
# All services
docker compose -f docker-compose.prod.yml logs -f

# Specific service
docker compose -f docker-compose.prod.yml logs -f backend
docker compose -f docker-compose.prod.yml logs -f nginx
docker compose -f docker-compose.prod.yml logs -f postgres
```

### Resource monitoring

```bash
docker stats
```

## 8. Database Backup

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
0 2 * * * cd ~/TryOn/www && docker compose -f docker-compose.prod.yml exec -T postgres pg_dump -U tryon_prod tryon_db | gzip > ~/backups/db_$(date +\%Y\%m\%d).sql.gz
```

Create backup directory:
```bash
mkdir -p ~/backups
```

## 9. Updating the Application

```bash
cd ~/TryOn/www
git pull origin main
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml exec backend npx prisma migrate deploy
```

## 10. Rollback Procedure

If deployment fails:

```bash
# Check which version is running
git log --oneline -5

# Rollback to previous commit
git checkout <previous-commit-hash>

# Rebuild and restart
docker compose -f docker-compose.prod.yml up -d --build
```

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
