# NovaPay — Local Setup Guide

Get the app running on your machine in under 5 minutes. You don't need a crypto wallet or any funds to explore it — **Demo Mode works out of the box**.

---

## Step 1 — Accept the collaboration invite

Check your email for a GitHub invite from **Dami904** and click **Accept invitation**.

---

## Step 2 — Install prerequisites

Skip anything you already have.

**Node.js v18 or higher**
- Download the LTS version from [nodejs.org](https://nodejs.org/)
- After installing, verify: `node -v` should print `v18.x.x` or higher

**npm v9 or higher** (comes bundled with Node.js)
- Verify: `npm -v`

**MetaMask** *(optional — only needed to connect a real wallet)*
- Install from [metamask.io](https://metamask.io/) as a browser extension

---

## Step 3 — Clone the repo

Open your terminal and run:

```bash
git clone https://github.com/Dami904/NovaPay.git
cd NovaPay
```

---

## Step 4 — Install dependencies

```bash
npm install
```

This installs React, ethers.js, Vite, and everything else. Takes about 30–60 seconds.

---

## Step 5 — Start the app

```bash
npm run dev
```

You should see output like:
```
  VITE v5.x.x  ready in 300ms

  ➜  Local:   http://localhost:5173/
```

---

## Step 6 — Open in browser

Go to **[http://localhost:5173](http://localhost:5173)**

> **Demo Mode is on by default** — you'll see a yellow **DEMO MODE** badge in the navbar. Two mock payroll runs are pre-loaded, transactions are simulated, and no MetaMask prompts appear. You can explore the full app without a wallet.

---

## Step 7 — Connect your wallet *(optional)*

If you want to test the wallet connection flow:

1. Click **Connect Wallet** on the landing page
2. Approve the MetaMask popup
3. If prompted to switch network, click **Switch** — the app adds **Morph Hoodi** (Chain ID 2910) automatically

---

## Troubleshooting

**`node -v` shows v16 or lower**
Upgrade to Node.js v18+ from [nodejs.org](https://nodejs.org/). Older versions will break the install.

**`npm install` errors out**
Delete the `node_modules` folder and `package-lock.json`, then re-run:
```bash
rm -rf node_modules package-lock.json
npm install
```

**Port 5173 already in use**
Start on a different port:
```bash
npm run dev -- --port 3000
```

**MetaMask popup doesn't appear**
Refresh the page and try connecting again. Make sure MetaMask is unlocked.

**CSV upload shows errors**
Download the sample file using the **"Sample CSV"** button inside the app — it shows the exact format expected.

---

## Optional: Deploy the smart contract

You only need this if you want to run **live transactions** (real USDC on Morph Hoodi). For local testing, skip it entirely.

1. Create a `.env` file in the project root:
```
PRIVATE_KEY=your_wallet_private_key_here
```

2. Deploy to Morph Hoodi:
```bash
npx hardhat run scripts/deploy.cjs --network morphHoodi
```

3. Copy the printed contract address and paste it into `src/utils/contractABI.js`:
```js
export const NOVAPAY_CONTRACT_ADDRESS = '0xYourDeployedAddress'
```

Once set to a real address, Demo Mode turns off automatically.
