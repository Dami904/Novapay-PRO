# NovaPay — Web3 Payroll for DAOs and Web3 Startups

Multi-tenant B2B payroll platform. Upload a CSV, route it through an approval workflow, batch-pay everyone in a single USDC/USDT transaction on Morph L2, and get an on-chain proof of payment with a full audit trail.

---

## What It Does

- **Team-based approval workflow** — HR uploads a CSV draft → Finance approves → Admin executes on-chain
- **Batch on-chain payroll** — one `batchPayout()` transaction pays up to 500 recipients simultaneously
- **Employee directory** — manage contractor and employee records; termination dates auto-exclude expired contracts
- **Recurring schedules** — set weekly/biweekly/monthly payroll; drafts are auto-created from a stored template
- **Role-based access** — 5 roles (owner, admin, finance, hr, viewer) with granular per-action permissions
- **Public proof of payment** — share `/proof/:txHash` with anyone to verify a payroll was executed on-chain
- **Notifications** — in-app, email (Resend), and optional Discord webhook per org
- **Super-admin console** — platform-wide stats, org/user management, plan overrides

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, React Router 6, TanStack Query, ethers.js v6, Vite |
| Backend | Fastify (TypeScript), Zod validation |
| Database | PostgreSQL via Neon (serverless) + Prisma ORM |
| Queue / Jobs | BullMQ + Redis (Upstash) |
| Email | Gmail via Nodemailer |
| Blockchain | Morph Hoodi L2 (EVM-compatible) |
| Auth | JWT (15 min) + httpOnly refresh tokens (30 days) |
| Testing | Vitest — unit tests + integration tests |

---

## Quick Start

Requires **Node.js v18+**, **npm v9+**, and accounts on [Neon](https://neon.tech), [Upstash](https://upstash.com), and [Resend](https://resend.com).

See [SETUP.md](SETUP.md) for the complete step-by-step guide.

```bash
git clone https://github.com/Dami904/Novapay-PRO.git
cd Novapay-PRO
npm install                          # installs frontend + API dependencies

# Terminal 1 — API (port 3001)
npm run api:dev

# Terminal 2 — Frontend (port 5173)
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

---

## App Routes

### Public
| Route | Description |
|---|---|
| `/` | Landing page |
| `/login` | Sign in |
| `/signup` | Create account + org |
| `/invite` | Accept org invitation |
| `/proof/:txHash` | Public payroll verification (no login required) |

### Protected (requires login)
| Route | Description |
|---|---|
| `/dashboard` | Stats, recent activity, quick actions |
| `/payroll/new` | Upload CSV → preview → submit for approval |
| `/payroll/:id` | Run detail, recipients, state-change actions |
| `/history` | Full payroll ledger, search, CSV export |
| `/approval-queue` | Pending runs awaiting review (owner / admin / finance) |
| `/employees` | Employee directory, bulk import |
| `/members` | Team members, invite flow |
| `/settings` | Org settings, Discord webhook, signing wallet |

### Super-admin only
| Route | Description |
|---|---|
| `/admin` | Platform dashboard — org count, user count, run stats |
| `/admin/orgs` | All organisations — search, plan override, delete |
| `/admin/users` | All users — search, grant/revoke super-admin |

---

## Payroll Lifecycle

```
draft → pending_approval → approved → executing → complete
                        ↘ rejected (terminal)       ↘ failed (terminal)
```

Each transition is enforced server-side and written to the immutable audit log.

---

## Role Permissions

| Action | owner | admin | finance | hr | viewer |
|---|:---:|:---:|:---:|:---:|:---:|
| Create / submit draft | ✓ | ✓ | ✓ | ✓ | — |
| Approve / reject | ✓ | ✓ | ✓ | — | — |
| Execute on-chain | ✓ | ✓ | — | — | — |
| Manage employees | ✓ | ✓ | — | ✓ | — |
| Manage members | ✓ | ✓ | — | — | — |
| View audit log | ✓ | ✓ | — | — | — |
| Delete org | ✓ | — | — | — | — |

> **Minimum viable org:** A single `owner` account can run the full payroll lifecycle alone — create draft, approve, and execute. The `hr` and `viewer` roles exist purely for delegation in larger teams and are never required.

---

## CSV Format

**Payroll CSV** (for creating a payroll run):

| Column | Required | Aliases accepted |
|---|---|---|
| `wallet_address` | Yes | `address`, `wallet` |
| `amount` | Yes | `usdc_amount`, `usdc`, `usdt_amount`, `usdt` |
| `name` | No | `employee_name`, `employee`, `full_name` |
| `termination_date` | No | `termination`, `contract_end`, `end_date`, `expiry_date` |

Rows with a past `termination_date` are automatically excluded and returned in a separate `excluded[]` array. If all rows are expired the upload is rejected with 422.

**Employee import CSV**:

| Column | Required | Aliases |
|---|---|---|
| `wallet_address` | Yes | `wallet`, `address` |
| `full_name` | Yes | `name` |
| `email`, `department`, `employment_type` | No | — |

---

## Smart Contract

**Network:** Morph Hoodi (Chain ID 2910)

```solidity
function batchPayout(
    address            token,        // USDC or USDT address
    address[] calldata recipients,
    uint256[] calldata amounts,      // 6 decimals
    string    calldata label
) external;

event PayrollBatch(
    address indexed sender,
    string  label,
    uint256 recipientCount,
    uint256 totalAmount,
    uint256 timestamp
);
```

The contract uses `transferFrom` — the frontend approves the exact total before calling `batchPayout`.

---

## Project Structure

```
NovaPay/
├── apps/
│   └── api/                        # Fastify backend (TypeScript)
│       ├── src/
│       │   ├── routes/             # auth, orgs, me, admin, proof
│       │   ├── services/           # authService, emailService, auditService
│       │   ├── middleware/         # authenticate, requireOrgMember, requireRole, requireSuperAdmin
│       │   ├── workers/            # txWatcher, scheduleChecker, emailWorker
│       │   ├── db/prisma/          # schema.prisma + Prisma client
│       │   ├── integration/        # integration test suites + helpers
│       │   └── config/env.ts       # Zod-validated env vars
│       ├── vitest.config.ts        # unit test config
│       ├── vitest.integration.config.ts  # integration test config
│       ├── .env                    # local env (git-ignored)
│       ├── .env.example            # env template
│       └── .env.test               # integration test env (git-ignored)
├── src/                            # React frontend (Vite)
│   ├── pages/
│   │   ├── auth/                   # Login, Signup, AcceptInvite
│   │   ├── app/                    # Dashboard, NewPayrollRun, PayrollHistory, etc.
│   │   └── admin/                  # AdminDashboard, AdminOrgList, AdminUserList
│   ├── components/                 # Navbar, NotificationDropdown, PayrollStatusBadge
│   ├── context/                    # AuthContext, OrgContext, Web3Context
│   ├── services/api.js             # Fetch wrapper with auth headers
│   └── utils/                      # csvParser, csvExporter
├── contracts/
│   └── NovaPay.sol                 # Batch payout smart contract
├── scripts/
│   └── deploy.cjs                  # Hardhat deploy to Morph Hoodi
├── package.json                    # Root workspace (frontend + api:* scripts)
├── SETUP.md                        # Full local setup guide
└── README.md
```

---

## Testing

```bash
# Frontend unit tests (113 tests — CSV parser, components, contexts)
npm run test

# API unit tests
npm run api:test

# API integration tests — boots real Fastify app against a real DB
# Requires apps/api/.env.test  (see SETUP.md § Running Tests)
npm run test:integration --workspace=apps/api

# Frontend + API unit tests together
npm run test:all
```

> Integration tests create and clean up their own isolated data — they are safe to run against your development database.

---

## Deployment

### Frontend — Vercel
```bash
# Push to GitHub, import repo on vercel.com — Vite is auto-detected
# vercel.json handles SPA routing so /dashboard doesn't 404
```

### API — any Node.js host (Railway, Render, Fly.io)
```bash
npm run api:build              # compiles TypeScript → dist/
npm run api:start              # runs dist/server.js
```

Set all env vars from `apps/api/.env.example` in your host's environment dashboard.

### GitHub Actions CI
Every push to `main` / `dev` and every PR triggers an automatic build + test check (`.github/workflows/ci.yml`).

---

## Morph Hoodi Network Details

| Field | Value |
|---|---|
| Network Name | Morph Hoodi |
| RPC URL | `https://rpc-hoodi.morphl2.io` |
| Chain ID | `2910` |
| Currency | ETH |
| Block Explorer | `https://explorer-hoodi.morphl2.io` |

Click **"Wrong Network"** in the app navbar — it adds Morph Hoodi to MetaMask automatically.
