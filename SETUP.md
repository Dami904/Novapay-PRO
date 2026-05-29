# NovaPay — Local Setup Guide

Get the full stack running on your machine. The app has two processes: the **React frontend** (Vite, port 5173) and the **Fastify API** (port 3001). Both need to run simultaneously.

---

## Prerequisites

| Tool | Version | Check |
|---|---|---|
| Node.js | v18 or higher | `node -v` |
| npm | v9 or higher | `npm -v` |
| Git | any | `git --version` |
| MetaMask | browser extension | [metamask.io](https://metamask.io/) |

You also need free accounts on:
- [Neon](https://neon.tech) — serverless PostgreSQL (free tier is enough)
- [Upstash](https://upstash.com) — serverless Redis (free tier is enough)
- [Resend](https://resend.com) — transactional email (free tier is enough)

---

## Step 1 — Clone and install

```bash
git clone https://github.com/Dami904/Novapay-PRO.git
cd Novapay-PRO
npm install
```

`npm install` installs both the frontend dependencies and the API dependencies (via npm workspaces).

---

## Step 2 — Create the API environment file

```bash
cp apps/api/.env.example apps/api/.env
```

Now open `apps/api/.env` and fill in every value. The sections below explain each one.

---

## Step 3 — Set up the database (Neon)

1. Go to [neon.tech](https://neon.tech) → create a new project
2. From the project dashboard, copy the **Connection string** (looks like `postgresql://...`)
3. Paste it as `DATABASE_URL` in `apps/api/.env`
4. Push the schema to your database:

```bash
npm run db:push --workspace=apps/api
```

You should see Prisma confirm that all tables were created. That's it — no migrations to run.

---

## Step 4 — Set up Redis (Upstash)

1. Go to [upstash.com](https://upstash.com) → create a new Redis database → choose any region
2. From the database page, copy the **Redis URL** (starts with `redis://` or `rediss://`)
3. Paste it as `REDIS_URL` in `apps/api/.env`

---

## Step 5 — Set up email (Gmail)

NovaPay sends email via Gmail using Nodemailer. You need a Gmail address with an **App Password** (not your regular Gmail password).

1. Go to [myaccount.google.com](https://myaccount.google.com) → **Security** → **2-Step Verification** (must be on) → **App passwords**
2. Create a new app password — copy the 16-character code
3. In `apps/api/.env`, set:
   - `GMAIL_USER` — your Gmail address (e.g. `you@gmail.com`)
   - `GMAIL_APP_PASSWORD` — the 16-character app password from step 2

---

## Step 6 — Fill in auth secrets

Generate two random secrets (they must be different from each other and at least 32 characters):

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# run this twice — use one for JWT_SECRET, the other for REFRESH_TOKEN_SECRET
```

Also generate two more for the super-admin secrets:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# SUPER_ADMIN_JWT_SECRET
node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"
# ADMIN_SECRET (min 16 chars)
```

Set `SUPER_ADMIN_EMAIL` to any valid email address (this field is required by the env validator but is not used for access control — see Step 9).

---

## Step 7 — Complete `.env` reference

```env
# Server
NODE_ENV=development
PORT=3001

# Database (from Neon)
DATABASE_URL=postgresql://...

# Auth — generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
JWT_SECRET=<32+ char random string>
JWT_EXPIRES_IN=15m
REFRESH_TOKEN_SECRET=<different 32+ char random string>
REFRESH_TOKEN_EXPIRES_IN=30d

# Redis (from Upstash)
REDIS_URL=redis://...

# Email (Gmail via Nodemailer)
GMAIL_USER=you@gmail.com
GMAIL_APP_PASSWORD=<16-char app password>

# Blockchain (defaults work for Morph Hoodi — update after deploying the contract)
MORPH_RPC_URL=https://rpc-hoodi.morphl2.io
NOVAPAY_B2B_CONTRACT_ADDRESS=0x0000000000000000000000000000000000000000

# Super admin
SUPER_ADMIN_JWT_SECRET=<32+ char random string, different from JWT_SECRET>
SUPER_ADMIN_EMAIL=your@email.com   # required by validator — not used for access control
ADMIN_SECRET=<16+ char random string>

# Frontend URL (CORS)
FRONTEND_URL=http://localhost:5173
```

---

## Step 8 — Start both servers

Open **two terminal windows** from the `NovaPay` root.

**Terminal 1 — API:**
```bash
npm run api:dev
```
You should see: `Server running at http://0.0.0.0:3001`

**Terminal 2 — Frontend:**
```bash
npm run dev
```
You should see: `VITE ready → http://localhost:5173`

Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## Step 9 — Create your account and become super-admin

Super-admin access is controlled by the `isSuperAdmin` column in the database — **not** by the `SUPER_ADMIN_EMAIL` env var (that field is required by the env validator but is never read by any route or middleware).

1. Go to [http://localhost:5173/signup](http://localhost:5173/signup) and create your account
2. After signing up, run this once to grant your account super-admin access:

```bash
cd apps/api
node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.user.update({
  where: { email: 'your@email.com' },
  data: { isSuperAdmin: true }
}).then(u => { console.log('Done:', u.email, u.isSuperAdmin); p.\$disconnect(); });
"
```

3. **Log out and log back in** — the session must refresh to pick up the new flag
4. Go to [http://localhost:5173/admin](http://localhost:5173/admin) — you should land on the platform dashboard

---

## Running Tests

### Unit tests (no database required)

```bash
# Frontend unit tests (113 tests — CSV parser, React components, contexts)
npm run test

# API unit tests (fast, no DB)
npm run api:test

# Both together
npm run test:all
```

### Integration tests (requires `.env.test`)

Integration tests boot the real Fastify app and run every API route against a real database. They create isolated test data and clean it up automatically — safe to run against your development database.

**One-time setup:**
```bash
cp apps/api/.env.test.example apps/api/.env.test
```

The `.env.test.example` file is pre-configured to reuse your development `DATABASE_URL`. Open `.env.test` and replace the `DATABASE_URL` placeholder with your actual Neon connection string (the same one in `apps/api/.env`).

**Run the tests:**
```bash
npm run test:integration --workspace=apps/api
```

Expected output: 98 tests, all green, ~90 seconds (Neon cold-start on first run).

---

## Useful Development Commands

```bash
# Open Prisma Studio (visual DB browser)
npm run db:studio --workspace=apps/api

# Regenerate Prisma client after schema changes
npm run db:generate --workspace=apps/api

# Push schema changes to DB without a migration file
npm run db:push --workspace=apps/api

# Build the API (TypeScript → dist/)
npm run api:build
```

---

## Deploy the Smart Contract (optional — only for live transactions)

The app works without a deployed contract. To enable real on-chain payroll:

1. Create a `.env` file in the project root (not inside `apps/api`):
```
PRIVATE_KEY=your_wallet_private_key
```

2. Deploy to Morph Hoodi:
```bash
npx hardhat run scripts/deploy.cjs --network morphHoodi
```

3. Copy the printed contract address into `apps/api/.env`:
```
NOVAPAY_B2B_CONTRACT_ADDRESS=0xYourDeployedAddress
```

---

## Troubleshooting

**API won't start — "Invalid environment variables"**
At least one required env var in `apps/api/.env` is missing or malformed. Check the error output — it lists exactly which fields failed.

**`npm install` fails**
Make sure you're on Node.js v18+. Run `node -v` to check. Then:
```bash
rm -rf node_modules apps/api/node_modules package-lock.json
npm install
```

**Database connection error**
Check that `DATABASE_URL` in `apps/api/.env` is the correct Neon connection string and includes `?sslmode=require`. Open the Neon console to confirm the project is active — free-tier projects can be paused.

**Redis connection error**
Upstash free-tier databases hibernate after inactivity — open the Upstash console and wake it up, then restart the API.

**`/admin` redirects to `/dashboard`**
Your account's `isSuperAdmin` flag is `false`. Follow Step 9 above to set it, then log out and back in.

**Integration tests fail with "Can't reach database server"**
Neon free-tier connections can drop after a long idle period. Re-running the tests usually resolves it (the warm-up ping in `buildTestApp()` prevents it on subsequent runs within the same session).

**Port 3001 or 5173 already in use**
```bash
# Kill the process using the port
kill $(lsof -ti:3001)   # or :5173
```

**MetaMask popup doesn't appear**
Refresh the page, make sure MetaMask is unlocked, and try connecting again.

**Wrong network warning in navbar**
Click the red **"Wrong Network"** badge — the app adds Morph Hoodi (Chain ID 2910) to MetaMask automatically.

---

## Morph Hoodi Network Details

| Field | Value |
|---|---|
| Network Name | Morph Hoodi |
| RPC URL | `https://rpc-hoodi.morphl2.io` |
| Chain ID | `2910` |
| Currency | ETH |
| Block Explorer | `https://explorer-hoodi.morphl2.io` |
