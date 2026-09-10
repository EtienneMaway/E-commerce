# VPS Deployment Guide (Contabo)

Self-hosting everything on one Contabo VPS: API, dashboard, PostgreSQL, Nginx, TLS.
Replaces the Railway + Vercel flow in `DEPLOYMENT.md`.

**Target box:** Ubuntu 24.04 LTS, 12 GB RAM, 200 GB SSD — far more than this app needs.

**What ends up running:**

| Piece | Port | Exposed publicly? |
|---|---|---|
| NestJS API | 3000 | No — Nginx proxies `api.yourdomain.com` |
| Next.js dashboard | 3001 | No — Nginx proxies `app.yourdomain.com` |
| PostgreSQL | 5432 | No — localhost only |
| Nginx | 80 / 443 | Yes |

Throughout, replace `yourdomain.com` with your real domain and `etienne` with the username you want.

---

## Phase 0 — DNS (do this first, it takes time to propagate)

At your domain registrar, create two **A records** pointing at the VPS IPv4 address:

| Type | Name | Value |
|---|---|---|
| A | `api` | `<VPS_IP>` |
| A | `app` | `<VPS_IP>` |

If Contabo gave you an IPv6 address too, add matching `AAAA` records.

Check propagation before continuing — Let's Encrypt will fail otherwise:

```bash
dig +short api.yourdomain.com
dig +short app.yourdomain.com
```

Both must print your VPS IP.

---

## Phase 1 — First login and hardening

Contabo emails you a root password. Log in from your Mac:

```bash
ssh root@<VPS_IP>
```

### 1.1 Update and create a non-root user

```bash
apt update && apt upgrade -y
adduser etienne                 # set a strong password when prompted
usermod -aG sudo etienne
```

### 1.2 Copy your SSH key to that user

**From your Mac** (new terminal — keep the root session open until this works):

```bash
# Only if you don't already have a key:
ssh-keygen -t ed25519 -C "etienne@mac"

ssh-copy-id etienne@<VPS_IP>
ssh etienne@<VPS_IP>            # must log in with NO password prompt
```

Do not proceed until key login works. Disabling passwords while your key is broken locks you out of the box.

### 1.3 Disable root login and password auth

Back on the VPS as `etienne`:

```bash
sudo nano /etc/ssh/sshd_config
```

Set these three lines (uncomment if needed):

```
PermitRootLogin no
PasswordAuthentication no
PubkeyAuthentication yes
```

```bash
sudo systemctl restart ssh
```

> Ubuntu 24.04 may also carry overrides in `/etc/ssh/sshd_config.d/*.conf` — those win over the main file. Check with `sudo grep -r PasswordAuthentication /etc/ssh/sshd_config.d/` and fix any conflicting line there too.

### 1.4 Firewall

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
sudo ufw status
```

Ports 3000, 3001 and 5432 stay closed — only Nginx faces the internet.

### 1.5 fail2ban (blocks SSH brute-forcing)

```bash
sudo apt install -y fail2ban
sudo systemctl enable --now fail2ban
```

### 1.6 Swap (cheap insurance during builds)

12 GB is plenty, but `next build` is memory-hungry and swap costs nothing:

```bash
sudo fallocate -l 4G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

---

## Phase 2 — Install the runtime stack

### 2.1 Node 22 + pnpm

Your Mac runs Node 22.20 / pnpm 10.27 — match the major versions.

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs git build-essential
sudo corepack enable
sudo corepack prepare pnpm@10.27.0 --activate
node -v && pnpm -v
```

### 2.2 PostgreSQL

```bash
sudo apt install -y postgresql postgresql-contrib
sudo systemctl enable --now postgresql
```

Create the database and role:

```bash
sudo -u postgres psql
```

```sql
CREATE DATABASE trading_app;
CREATE USER trading_user WITH ENCRYPTED PASSWORD 'PUT_A_LONG_RANDOM_PASSWORD_HERE';
GRANT ALL PRIVILEGES ON DATABASE trading_app TO trading_user;
\c trading_app
GRANT ALL ON SCHEMA public TO trading_user;
ALTER DATABASE trading_app OWNER TO trading_user;
\q
```

Generate that password with `openssl rand -base64 32` and save it — you need it in `.env` next.

Postgres binds to localhost by default on Ubuntu. Leave it that way.

### 2.3 Nginx + Certbot + PM2

```bash
sudo apt install -y nginx certbot python3-certbot-nginx
sudo npm install -g pm2
```

---

## Phase 3 — Get the code onto the VPS

### 3.1 Deploy key (read-only, safer than pasting a password)

```bash
ssh-keygen -t ed25519 -C "vps-deploy" -f ~/.ssh/id_ed25519 -N ""
cat ~/.ssh/id_ed25519.pub
```

Copy that output → GitHub repo → **Settings → Deploy keys → Add deploy key** → paste, leave "Allow write access" **unchecked**.

### 3.2 Clone

```bash
sudo mkdir -p /var/www
sudo chown etienne:etienne /var/www
cd /var/www
git clone git@github.com:EtienneMaway/E-commerce.git ecommerce
cd ecommerce
git checkout main          # or dev, whichever you deploy
```

### 3.3 Environment files

**API** — `/var/www/ecommerce/apps/api/.env`:

```bash
nano /var/www/ecommerce/apps/api/.env
```

```bash
DATABASE_URL=postgresql://trading_user:YOUR_DB_PASSWORD@localhost:5432/trading_app
JWT_SECRET=PASTE_OUTPUT_OF_openssl_rand_hex_32
JWT_EXPIRES_IN=7d
PORT=3000
NODE_ENV=production
CORS_ORIGINS=https://app.yourdomain.com

# Which mobile release is live on Play. See "Telling the app about a new
# mobile release" below — these are the only vars that change between deploys.
MOBILE_ANDROID_LATEST_VERSION=1.0.0
MOBILE_ANDROID_LATEST_BUILD=5
MOBILE_RELEASE_NOTES_EN=
MOBILE_RELEASE_NOTES_FR=
```

Notes on these, because a couple are easy to get wrong:

- `CORS_ORIGINS` is comma-separated, no trailing slash, and `main.ts` matches it exactly against the browser's `Origin` header. If it's empty the API logs a warning and allows everything — don't ship it empty.
- The mobile app sends no `Origin` header, so it isn't affected by this list.
- `NODE_ENV=production` disables the dev-only localhost/Expo CORS patterns. That's what you want here.
- No SSL params in `DATABASE_URL` — Postgres is on the same box over localhost.

```bash
chmod 600 /var/www/ecommerce/apps/api/.env
```

**Dashboard** — `/var/www/ecommerce/apps/dashboard/.env.production`:

```bash
NEXT_PUBLIC_API_URL=https://api.yourdomain.com/api
```

> The `/api` suffix matters — `main.ts` calls `setGlobalPrefix('api')`, and `apps/dashboard/lib/api.ts` appends paths directly to this base. This value is inlined at **build time**, so changing it later means rebuilding the dashboard, not just restarting it.

### 3.3b Privacy policy URL (Google Play)

The dashboard serves the policy publicly at **`https://app.<your-domain>/privacy`**
— e.g. `https://app.kmb-talk.com/privacy`. That is the URL to paste into the Play
Console; Play rejects a link to a file in a repo.

The route sits outside the authenticated `(main)` group, so it needs no login and
no extra Nginx rule — the existing `app.<your-domain>` proxy already covers it.

Its content is read from the repo-root `PRIVACY_POLICY.md` **at build time** and
baked into a static page, so editing the policy means re-running
`pnpm build:dashboard` (the file must be present in the clone you build from).

### 3.4 Install, build, migrate

```bash
cd /var/www/ecommerce
pnpm install --frozen-lockfile
pnpm build:api
pnpm build:dashboard
```

Run the migrations — note this runs against **compiled JS**, so `build:api` must come first:

```bash
cd apps/api
pnpm migration:run
```

You should see each migration in `apps/api/src/database/migrations/` apply in order. `synchronize` is off everywhere, so this step is what creates your schema — skipping it means an API that boots and then 500s on every query.

---

## Phase 4 — Run both apps under PM2

Create `/var/www/ecommerce/ecosystem.config.js`:

```js
module.exports = {
  apps: [
    {
      name: 'kmb-api',
      cwd: '/var/www/ecommerce/apps/api',
      script: 'dist/main.js',
      instances: 1,
      autorestart: true,
      max_memory_restart: '1G',
      env: { NODE_ENV: 'production' },
    },
    {
      name: 'kmb-dashboard',
      cwd: '/var/www/ecommerce/apps/dashboard',
      script: 'node_modules/next/dist/bin/next',
      args: 'start --port 3001',
      instances: 1,
      autorestart: true,
      max_memory_restart: '1G',
      env: { NODE_ENV: 'production' },
    },
  ],
};
```

The API loads its own `.env` via `import 'dotenv/config'` in `main.ts`, and `cwd` points there — so PM2 doesn't need to duplicate those vars.

```bash
cd /var/www/ecommerce
pm2 start ecosystem.config.js
pm2 save
pm2 startup systemd -u etienne --hp /home/etienne
# ^ prints a `sudo env PATH=... ` command — copy and run it, that's what survives reboot
pm2 status
pm2 logs --lines 50
```

Smoke test locally before touching Nginx:

```bash
curl -i http://localhost:3000/api/docs
curl -i http://localhost:3001
```

Both should return `200`.

---

## Phase 5 — Nginx reverse proxy

```bash
sudo nano /etc/nginx/sites-available/kmb
```

```nginx
server {
    listen 80;
    server_name api.yourdomain.com;
    client_max_body_size 10M;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}

server {
    listen 80;
    server_name app.yourdomain.com;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/kmb /etc/nginx/sites-enabled/kmb
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

Test over plain HTTP: `http://api.yourdomain.com/api/docs` should load Swagger.

---

## Phase 6 — HTTPS

```bash
sudo certbot --nginx -d api.yourdomain.com -d app.yourdomain.com
```

Choose **redirect HTTP → HTTPS** when asked. Certbot rewrites the Nginx config in place and installs a renewal timer.

```bash
sudo certbot renew --dry-run
systemctl list-timers | grep certbot
```

**Verify:**
- `https://api.yourdomain.com/api/docs` → Swagger UI
- `https://app.yourdomain.com` → login page, and logging in actually loads data (that proves CORS + `NEXT_PUBLIC_API_URL` are both right)

If login fails with a CORS error, check `CORS_ORIGINS` matches the dashboard origin character-for-character, then `pm2 restart kmb-api`.

### Rate limiting caveat

The app's global throttler is 100 req/min and the login endpoint is 10 req/min — both keyed by client IP. Behind Nginx, Nest sees `127.0.0.1` for **every** request unless it trusts the proxy, which would make one user's failed logins throttle everybody. To fix, add this to `main.ts` after `NestFactory.create`:

```ts
app.set('trust proxy', 'loopback');
```

Nginx already sends `X-Forwarded-For` in the config above. Worth doing before real users arrive.

---

## Phase 7 — Backups

The one thing a VPS doesn't give you for free that Railway did.

```bash
sudo mkdir -p /var/backups/postgres
sudo chown etienne:etienne /var/backups/postgres
nano /home/etienne/backup-db.sh
```

```bash
#!/bin/bash
set -euo pipefail
STAMP=$(date +%F_%H-%M)
export PGPASSWORD='YOUR_DB_PASSWORD'
pg_dump -U trading_user -h localhost trading_app | gzip > "/var/backups/postgres/trading_app_${STAMP}.sql.gz"
find /var/backups/postgres -name '*.sql.gz' -mtime +14 -delete
```

```bash
chmod 700 /home/etienne/backup-db.sh
/home/etienne/backup-db.sh     # run once manually to confirm it works
crontab -e
```

```
0 2 * * * /home/etienne/backup-db.sh >> /home/etienne/backup.log 2>&1
```

A backup that only lives on the same disk as the database is not a backup. Pull them down periodically:

```bash
# from your Mac
rsync -avz etienne@<VPS_IP>:/var/backups/postgres/ ~/kmb-backups/
```

Restore drill (do this once, on a scratch database, before you need it for real):

```bash
gunzip -c /var/backups/postgres/trading_app_2026-07-17_02-00.sql.gz | psql -U trading_user -h localhost trading_app
```

---

## Phase 8 — Mobile app

Only the API URL changes versus the old EAS flow. In `apps/mobile/eas.json`, point the build profile at:

```
EXPO_PUBLIC_API_URL=https://api.yourdomain.com
```

Then:

```bash
cd apps/mobile
eas build --platform android --profile preview --non-interactive
```

The mobile app sends no `Origin` header, so `CORS_ORIGINS` doesn't need touching for it. But it does need real TLS — Phase 6 must be done first, since Android blocks plaintext HTTP by default.

---

## Telling the app about a new mobile release

Installed apps ask `GET /api/app-version` whether they are behind, and the API
answers from four env vars. They are not set by any deploy — a store release and
a server deploy are separate events — so after `eas submit` lands a build on
Play, run this on the VPS:

```bash
cd /var/www/ecommerce/apps/api
pnpm mobile:version 1.0.1 6 "Faster sales screen" "Écran des ventes plus rapide"
```

Two required arguments: the version name (`expo.version` in
`apps/mobile/app.json`, which `pnpm version:bump` set) and the build number
(`eas build:version:get --platform android`). The notes are optional and appear
in the update banner. The script rewrites only those four lines, keeps a
`.env.bak`, and restarts `kmb-api` — the API reads `.env` at boot, so without a
restart nothing changes.

Notes are **not** carried over: omit them and the previous release's notes are
cleared rather than shown against a new version.

Check it took:

```bash
curl -s "https://api.yourdomain.com/api/app-version?version=1.0.0&build=5" | jq
# updateAvailable: true  → an install on 1.0.0 / build 5 now sees the banner
```

`MOBILE_ANDROID_MIN_VERSION` / `MOBILE_ANDROID_MIN_BUILD` are deliberately left
alone by the script. Those put every older install behind a full-screen,
un-dismissible update wall — edit them by hand, only when an old build genuinely
cannot work against the current API.

---

## Redeploying after a code change

```bash
nano /home/etienne/deploy.sh
```

```bash
#!/bin/bash
set -euo pipefail
cd /var/www/ecommerce
git pull origin main
pnpm install --frozen-lockfile
pnpm build:api
pnpm build:dashboard
cd apps/api && pnpm migration:run && cd ../..
pm2 restart kmb-api kmb-dashboard
pm2 status
```

```bash
chmod 700 /home/etienne/deploy.sh
```

Then each deploy is `ssh etienne@<VPS_IP> '/home/etienne/deploy.sh'`.

Order matters here: build before migrate (migrations run from `dist/`), migrate before restart (so the new code never meets the old schema).

There is a few seconds of downtime on `pm2 restart`. Fine for this app; if it ever isn't, `pm2 reload` with `instances: 2` on the API gives you zero-downtime restarts.

---

## What you gave up versus Railway/Vercel

Worth being clear-eyed about, since this is the real trade:

- **Backups are yours now.** Phase 7 is not optional.
- **Security patching is yours.** `sudo apt update && sudo apt upgrade` regularly; consider `unattended-upgrades`.
- **No CDN for the dashboard.** Next.js serves assets straight from the VPS. Fine for a business dashboard; slower for far-away users than Vercel's edge.
- **One box = one failure domain.** API, dashboard and database all die together. Acceptable for this app's scale, but that's a decision, not an accident.

What you gained: full control, one predictable bill, no cold starts, and a database that lives next to the API instead of across the internet.

---

## Quick reference

```bash
pm2 status                      # what's running
pm2 logs kmb-api --lines 100    # API logs
pm2 restart kmb-api             # restart after .env change
sudo systemctl reload nginx     # after Nginx config change
sudo nginx -t                   # validate Nginx config before reloading
psql -U trading_user -h localhost trading_app   # DB shell
htop                            # resource usage
```

| Path | What |
|---|---|
| `/var/www/ecommerce` | the repo |
| `/var/www/ecommerce/apps/api/.env` | API secrets |
| `/var/www/ecommerce/apps/dashboard/.env.production` | dashboard build-time API URL |
| `/etc/nginx/sites-available/kmb` | reverse proxy config |
| `/var/backups/postgres` | nightly dumps |
| `/home/etienne/deploy.sh` | redeploy script |
