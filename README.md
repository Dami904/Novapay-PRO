# NovaPay — Web3 Payroll That Actually Makes Sense

Onchain batch payroll and accounting for Web3 startups and DAOs. Upload a CSV, pay everyone in one USDC transaction, tag it onchain, export the ledger. Built on Morph.

---

## Quick Start (for teammates cloning this repo)

### Prerequisites
- [Node.js](https://nodejs.org/) v18 or higher
- [npm](https://npmjs.com/) v9 or higher
- [MetaMask](https://metamask.io/) browser extension
- Morph Hoodi configured in MetaMask (details below)

> **No `.env` file needed.** The frontend runs fully in Demo Mode out of the box — no wallet, no contract, no real funds required. Contract deployment is only needed for live transactions.

### 1. Clone and install

```bash
git clone https://github.com/Dami904/NovaPay.git
cd NovaPay
npm install
```

### 2. Start the dev server

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

### 3. Build for production

```bash
npm run build
npm run preview   # preview the production build locally
```

---

## Connecting MetaMask to Morph Hoodi

Add the network manually in MetaMask:

| Field | Value |
|---|---|
| Network Name | Morph Hoodi |
| RPC URL | `https://rpc-hoodi.morphl2.io` |
| Chain ID | `2910` |
| Currency Symbol | `ETH` |
| Block Explorer | `https://explorer-hoodi.morphl2.io` |

Or click **"Switch to Morph"** in the app — it will prompt MetaMask to add it automatically.

---

## Contract Setup (required before live transactions work)

The app ships in **Demo Mode** by default (no real contract needed — transactions are simulated). To connect a real deployed contract:

1. Deploy `NovaPay.sol` to Morph Hoodi
2. Note the deployed contract address
3. Note the USDC token address on Morph Hoodi
4. Open [`src/utils/contractABI.js`](src/utils/contractABI.js) and update:

```js
export const NOVAPAY_CONTRACT_ADDRESS = '0xYourNovaPayContractAddress'
export const USDC_CONTRACT_ADDRESS    = '0xYourUSDCTokenAddress'
```

Once these are non-zero addresses, Demo Mode turns off automatically and the app calls real contracts.

---

## Expected Smart Contract Interface

The frontend expects this Solidity interface (from `contracts/PayFlow.sol`):

```solidity
function batchPayout(
    address            token,        // ERC20 token address (USDC or USDT)
    address[] calldata recipients,
    uint256[] calldata amounts,      // in token units (6 decimals for USDC/USDT)
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

The contract pulls tokens from the caller via `transferFrom` — the frontend approves the exact total before calling `batchPayout`.

---

## CSV Format

Upload a `.csv` file with these columns:

| Column | Required | Description |
|---|---|---|
| `wallet_address` | Yes | Recipient's EVM address |
| `amount` | Yes | USDC amount (e.g. `3000`) |
| `name` | No | Employee/contractor name |

Column headers are case-insensitive. Aliases accepted:
- Address: `wallet_address`, `address`, `wallet`
- Amount: `amount`, `usdc_amount`, `usdc`
- Name: `name`, `employee_name`, `employee`

**Sample CSV** — download from the app via the "Sample CSV" button, or use:

```csv
wallet_address,name,amount
0x1234567890123456789012345678901234567890,Alice Chen,3000
0x2345678901234567890123456789012345678901,Bob Smith,2500
0x3456789012345678901234567890123456789012,Carol Diaz,2500
```

---

## App Screens

| Route | Screen |
|---|---|
| `/` | Connect Wallet |
| `/dashboard` | Dashboard — stats + recent activity |
| `/payroll/new` | New Payroll Run — CSV upload, preview, send |
| `/payroll/confirm` | Transaction Confirmation |
| `/history` | Payroll Ledger — history + CSV export |

---

## Demo Mode

When `NOVAPAY_CONTRACT_ADDRESS` is the zero address (default), the app runs in **Demo Mode**:
- Two mock payroll runs are pre-populated in history
- The "Send Payroll" button simulates a 2.5-second transaction
- A fake tx hash is generated
- No MetaMask approval prompts appear
- USDC balance shows 50,000 for demo purposes
- All history is saved to `localStorage` and persists across reloads

**A yellow "DEMO MODE" badge appears in the navbar whenever Demo Mode is active.**

---

## Project Structure

```
NovaPay/
├── index.html
├── vite.config.js
├── package.json
├── hardhat.config.cjs          # Contract deploy config (Morph Hoodi)
├── contracts/
│   └── PayFlow.sol             # Batch payout smart contract
├── scripts/
│   └── deploy.cjs              # Hardhat deploy script
├── src/
│   ├── index.jsx               # React entry point
│   ├── App.jsx                 # Router + layout
│   ├── App.css                 # All styles (dark theme)
│   ├── context/
│   │   └── Web3Context.jsx     # Wallet connection, contract calls, history
│   ├── utils/
│   │   ├── contractABI.js      # ABI + contract/network config
│   │   ├── csvParser.js        # Parse + validate uploaded CSV
│   │   └── csvExporter.js      # Export history to CSV/XLSX
│   ├── components/
│   │   └── Navbar.jsx          # Top navigation bar
│   └── pages/
│       ├── ConnectWallet.jsx
│       ├── Dashboard.jsx
│       ├── NewPayrollRun.jsx
│       ├── TransactionConfirmation.jsx
│       └── PayrollHistory.jsx
└── README.md
```

---

## Deployment (Vercel + CI/CD)

### GitHub Actions CI
Every push to `main` or `dev`, and every pull request to `main`, triggers a build check automatically. If the build fails, the PR is blocked. No extra setup needed — the workflow is at [`.github/workflows/ci.yml`](.github/workflows/ci.yml).

### Deploying to Vercel
1. Push this repo to GitHub
2. Go to [vercel.com](https://vercel.com) → **Add New Project** → import your repo
3. Vercel auto-detects Vite — leave all settings as-is, then click **Deploy**

That's it. From then on:
- Every push to `main` → production deploy
- Every PR → preview deployment with a unique URL
- [`vercel.json`](vercel.json) handles SPA routing so direct links like `/dashboard` don't 404

---

## Tech Stack

- **React 18** + React Router 6
- **ethers.js v6** — wallet connection, contract interaction
- **PapaParse** — CSV parsing and export
- **Vite** — build tool
- **Morph Hoodi** — L2 blockchain
- Zero backend, zero auth — wallet is identity

---

## Troubleshooting

**`npm install` fails** — Make sure you're on Node.js v18 or higher. Run `node -v` to check. Download the LTS version from [nodejs.org](https://nodejs.org/).

**`vite: command not found`** — You skipped `npm install`. Run it first from inside the `NovaPay` folder.

**"MetaMask not installed"** — Install the MetaMask browser extension and refresh the page.

**Stuck on "Connecting…"** — Check that MetaMask is unlocked and you approved the connection request. Try refreshing the page and connecting again.

**Wrong network warning** — Click the warning banner in the app or open MetaMask manually and switch to Morph Hoodi (Chain ID 2910). The app can add the network automatically.

**Port 5173 already in use** — Start the dev server on a different port:
```bash
npm run dev -- --port 3000
```

**CSV upload shows errors** — Check that `wallet_address` is a valid 0x EVM address and `amount` is a positive number. Use the **"Sample CSV"** button in the app to download a working example.

**Transaction fails** — Ensure your USDC balance covers the total payout. In live mode the app approves the exact total before calling the contract.
