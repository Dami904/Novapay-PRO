# NovaPay — Local Setup Guide (Windows / PowerShell)

---

### Step 1 — Accept the collaboration invite
Check your email for a GitHub invite from **Dami904** and click **Accept invitation**.

---

### Step 2 — Install prerequisites (skip if already installed)

- [Node.js](https://nodejs.org/) — download and install the **LTS** version
  - After installing, close and reopen PowerShell so it picks up the new commands
- [Git for Windows](https://git-scm.com/download/win) — required to clone the repo
- [MetaMask](https://metamask.io/) — install the browser extension

To verify Node and Git installed correctly, run:
```powershell
node -v
git --version
```
Both should print a version number. If you get **"not recognized"**, restart PowerShell and try again.

---

### Step 3 — Clone the repo
Open **PowerShell** (search it in the Start menu) and run:
```powershell
git clone https://github.com/Dami904/NovaPay.git
cd NovaPay
```

---

### Step 4 — Install dependencies
```powershell
npm install
```
Wait for it to finish — this may take a minute. You should see a `node_modules` folder appear.

> **If you get a permissions error**, run PowerShell as Administrator and try again.

---

### Step 5 — Start the app
```powershell
npm run dev
```
Keep this window open — the server must stay running while you use the app.

You should see output like:
```
  VITE v5.x.x  ready in xxx ms

  ➜  Local:   http://localhost:5173/
```

> **If `npm run dev` fails**, make sure step 4 completed without errors first.

---

### Step 6 — Open in browser
Go to **http://localhost:5173**

> If it says "connection refused", check that PowerShell is still running `npm run dev` — it must stay open.

---

### Step 7 — Connect your wallet
- Click **Connect Wallet**
- Approve the MetaMask popup
- If prompted to switch network, click **Switch** — it will add **Morph Hoodi** automatically

> The app runs in **Demo Mode** by default — no real transactions, everything is simulated. You'll see a yellow **DEMO MODE** badge in the top bar.
