# Aristral Multi-Client CRM — Provisioning System

This folder contains everything you need to run the trycompai/crm codebase as an isolated, dedicated instance per client — one subdomain, one database, one set of containers per customer.

## How It Works

```
clients.aristral.com/admin  ←  You manage from here
         │
         ├── acme.aristral.com    →  Container group A  →  Postgres DB A
         ├── beta.aristral.com    →  Container group B  →  Postgres DB B
         └── gamma.aristral.com   →  Container group C  →  Postgres DB C
```

Each client gets:
- Their own Postgres database (fully isolated data)
- Their own API, app, and agent containers
- Their own generated secrets (auth, bridge, cron)
- Their own subdomain + SSL certificate

## Prerequisites

On your server (Linux VPS recommended):
- Docker + Docker Compose v2
- Nginx + Certbot (for SSL)
- PowerShell 7+ (`pwsh`) — cross-platform, works on Linux
- Bun (for DB migrations)
- A wildcard DNS A record: `*.aristral.com → your-server-IP`

## Scripts

| Script | What it does |
|---|---|
| `provision.ps1` | Create a new client |
| `list.ps1` | See all clients + container status |
| `destroy.ps1` | Stop (and optionally delete) a client |

## Provisioning a New Client

```powershell
cd d:\Aristral\CRM\clients

.\provision.ps1 -ClientName "Acme Corp" -AllowedSignIn "acme.com"
```

This will:
1. Pick unused ports automatically (DB, API, App, Agent)
2. Generate all secrets (auth, bridge, cron)
3. Write `.env`, `docker-compose.yml`, and `nginx-vhost.conf` to `instances/acme-corp/`
4. Start the Postgres container
5. Run database migrations
6. Start all four containers
7. Print the nginx setup commands

### Optional parameters

```powershell
# Set a custom subdomain (default: slugified ClientName)
.\provision.ps1 -ClientName "Acme Corp" -AllowedSignIn "acme.com" -Subdomain "acme"

# Allow a specific email address instead of a whole domain
.\provision.ps1 -ClientName "Freelancer" -AllowedSignIn "bob@gmail.com"

# Allow multiple domains/addresses
.\provision.ps1 -ClientName "Big Co" -AllowedSignIn "bigco.com,contractor@gmail.com"
```

## Listing All Clients

```powershell
.\list.ps1
```

Output example:
```
  Acme Corp (acme-corp)
    URL        : https://acme-corp.aristral.com
    Sign-in    : acme.com
    Containers : db=[running]  api=[running]  app=[running]  agent=[running]
```

## Destroying a Client

```powershell
# Stop containers only (data preserved in Docker volume)
.\destroy.ps1 -Slug acme-corp

# Stop containers AND delete all database data (irreversible)
.\destroy.ps1 -Slug acme-corp -DeleteData

# Stop, delete data, AND delete config files
.\destroy.ps1 -Slug acme-corp -DeleteData -DeleteFiles
```

## Setting Up Nginx on Your Server

After running `provision.ps1`, it prints the exact commands. In summary:

```bash
# Copy the generated vhost config to your server
scp clients/instances/acme-corp/nginx-vhost.conf root@server:/etc/nginx/sites-available/acme-corp.conf

# Enable it
ln -s /etc/nginx/sites-available/acme-corp.conf /etc/nginx/sites-enabled/

# Issue free SSL certificate
certbot --nginx -d acme-corp.aristral.com

# Reload nginx
nginx -s reload
```

## File Structure

```
clients/
├── provision.ps1          ← create a new client
├── list.ps1               ← list all clients
├── destroy.ps1            ← remove a client
├── registry.json          ← auto-maintained list of all clients
├── README.md              ← this file
├── template/
│   ├── docker-compose.yml ← parameterized compose template
│   ├── .env.template      ← env vars template (secrets injected at provision time)
│   └── nginx-vhost.conf   ← nginx vhost template
└── instances/
    ├── acme-corp/         ← generated per client
    │   ├── .env
    │   ├── docker-compose.yml
    │   └── nginx-vhost.conf
    └── beta-client/
        └── ...
```

## Port Allocation

Ports are assigned automatically and tracked in `registry.json`:

| Service | Starting port | Increments by |
|---|---|---|
| Postgres | 5433 | 1 per client |
| API (NestJS) | 3101 | 1 per client |
| App (Next.js) | 3200 | 1 per client |
| Agent (eve) | 2001 | 1 per client |

So client 1 gets 5433/3101/3200/2001, client 2 gets 5434/3102/3201/2002, etc.

## Security Notes

- `instances/` is gitignored — it contains real secrets and should never be committed
- Each client's `.env` has a unique `BETTER_AUTH_SECRET` and `AGENT_BRIDGE_SECRET`
- `destroy.ps1 -DeleteData` requires typing the client slug to confirm (prevents accidents)
- Never copy `.env` files between clients — the secrets are client-specific
