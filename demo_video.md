# NovaPay — App Guide

Feature reference, judge Q&A, and a full walkthrough of every screen and interaction in the app.

---

## Feature Reference (for questions after the demo)

| Feature | Where it is | How it works |
|---|---|---|
| Wallet connect | Screen 1 | ethers.js `BrowserProvider` + MetaMask `eth_requestAccounts` |
| Network auto-switch | On connect | `wallet_addEthereumChain` for Morph Hoodi (Chain ID 2910) |
| CSV validation | Screen 3, Step 2 | PapaParse + ethers `isAddress()` check per row |
| Onchain label | Screen 3, Step 3 | Passed as `string` param to `batchPayout()`, emitted in `PayrollBatch` event |
| Batch transaction | Screen 3 → 4 | Single `batchPayout(address[], uint256[], string)` call — one tx pays everyone |
| USDC approval | Before send | `approve(contract, totalAmount)` called automatically before `batchPayout` |
| History source | Screen 5 | Reads `PayrollBatch` events from contract + localStorage cache |
| CSV export | Screen 5 | PapaParse `unparse()` → Blob download, no server needed |
| Demo Mode | Always visible | Active when contract address is zero — simulates full flow without a deployed contract |

---

## Common Questions Judges Will Ask

**"Is this on mainnet?"**
We're on Morph Hoodi. The same code deploys to Morph mainnet — just update the contract address and chain ID.

**"What stops someone from sending a bad CSV?"**
The frontend validates every row before the Send button activates — it checks address format with `ethers.isAddress()`, rejects zero or negative amounts, and blocks the send if any row has an error.

**"How does the accounting export work?"**
The frontend reads `PayrollBatch` events emitted by the contract. Those events contain the label, recipient count, and total. The per-recipient breakdown is stored locally (from the original CSV upload) and merged with the onchain record on export.

**"What if someone doesn't have enough USDC?"**
The sidebar shows their live USDC balance vs the total payout and disables the Send button with a warning if the balance is insufficient.

**"Could this support other tokens?"**
Yes — the contract interface and frontend are both token-agnostic. USDC is hardcoded right now to keep the demo clean, but swapping in any ERC-20 is a one-line change in `contractABI.js`.

---

---

# App Exploration Guide

This section is for teammates who want to click through the app themselves and understand exactly what everything does before the demo. Read this top to bottom before you open the browser.

---

## Getting the App Running

```bash
npm install      # only needed once after cloning
npm run dev      # starts at http://localhost:5173
```

The app runs entirely in the browser — no backend, no server, no database. Everything is either stored in `localStorage` or read from the blockchain. If you're not connecting a real wallet, **Demo Mode is on by default** and the full flow still works.

---

## Demo Mode — What It Means

When you first open the app, it runs in **Demo Mode**. You will see a yellow **DEMO MODE** badge in the top navbar whenever it is active.

In Demo Mode:
- Two pre-loaded payroll batches already exist in the history (April 2026 data) so the app never looks empty
- Clicking **Send Payroll** simulates a 2.5-second transaction instead of calling a real contract
- A randomly generated fake transaction hash is created and displayed on the confirmation screen
- Your USDC balance shows as **$50,000** regardless of your real wallet balance
- No MetaMask approval popups appear during the send flow

Demo Mode switches off automatically the moment you update `NOVAPAY_CONTRACT_ADDRESS` in `src/utils/contractABI.js` to a real deployed contract address. You do not need to change any other setting.

---

## Page 1 — Connect Wallet (`/`)

**This is the landing page. It is the only page visible before a wallet is connected.**

### What you see
- The NovaPay logo (✦ + "NovaPay") centred on a dark background with purple ambient glow orbs and a subtle grid pattern
- The headline: *"Web3 Payroll That Actually Makes Sense"*
- A one-line description below it
- Four feature summary cards arranged in a 2×2 grid:
  - **Upload CSV** — Drop in wallet addresses and amounts
  - **One-Click Payout** — Batch pay everyone in a single transaction
  - **Labeled Onchain** — Every payroll tagged as a permanent record
  - **Export Ledger** — Audit-ready spreadsheet in seconds
- A large **Connect Wallet** button with the MetaMask fox emoji
- A small hint line below it: *"MetaMask or WalletConnect · Morph Hoodi"*
- A footer strip showing the chain dot, network name, and tech stack

### What happens when you click Connect Wallet
1. MetaMask opens and asks you to approve the connection
2. Once approved, the app checks what network MetaMask is on
3. If you are already on Morph Hoodi (Chain ID 2910) → you land straight on the Dashboard
4. If you are on a different network → you are redirected to the Dashboard but the **wrong network** warning appears (see Navbar section below)
5. If MetaMask is not installed → an error message appears below the button: *"MetaMask not installed. Please install MetaMask to use NovaPay."*

### What you cannot do here
- You cannot access any other page without connecting a wallet. Typing `/dashboard` directly in the URL redirects you back to `/` if no wallet is connected.

---

## The Navbar (visible on all pages after connecting)

The navbar is fixed to the top of every page once you are connected. It contains several live indicators worth understanding.

### Left side
- **✦ NovaPay** logo — clicking it always takes you to the Dashboard

### Centre
- **Dashboard**, **New Payroll**, **Ledger** navigation links
- The active page link is highlighted in purple

### Right side (left to right)
- **DEMO MODE badge** (yellow) — only appears when running without a real contract. Disappears in live mode.
- **Network badge** — shows one of two states:
  - 🟢 **Morph Hoodi** — you are on the correct network, pulsing green dot
  - 🔴 **Wrong Network** — you are on the wrong chain. **This badge is a button.** Clicking it calls MetaMask's `wallet_switchEthereumChain`. If you don't have Morph Hoodi added yet, MetaMask shows the "Add Network" prompt pre-filled with the correct details (Chain ID 2910, RPC, explorer). While the switch is pending the badge reads "Switching…"
- **USDC balance** — shows your current USDC balance on Morph Hoodi in real time. Shows $50,000 in Demo Mode.
- **Wallet chip** — shows your connected address shortened (first 6 + last 4 characters), with a green dot. The small ✕ on the right disconnects the wallet and returns you to the Connect Wallet page.

### Below the navbar (wrong network only)
A red warning bar appears spanning the full width of the screen: *"⚠ Please switch to Morph Hoodi → Click to switch"*. The entire bar is also a button with the same switch behaviour. It disappears once you are on the correct network.

---

## Page 2 — Dashboard (`/dashboard`)

**The home screen after connecting. Shows your payroll overview at a glance.**

### What you see

**Four stat cards across the top:**

| Card | What it shows | Notes |
|---|---|---|
| Total Paid Out | Cumulative USDC across all payroll runs | Pulls from full history including Demo Mode mock data |
| Payroll Runs | Count of completed batches | Increments every time a payroll is sent |
| USDC Balance | Your current spendable balance | Live from chain, or $50,000 in Demo Mode |
| Last Payroll | Label + date of most recent run | Shows "None yet" if no history exists |

Hovering over any stat card highlights its border in purple.

**Recent Activity section** (below the stats):
- Lists the last 3 payroll runs in the history
- Each row shows: label, recipient count, date, total USDC amount, and a clickable tx hash link that opens the Morph Hoodi explorer
- If no history exists at all, an empty state is shown with a "Run First Payroll" button instead

**View all → link** — appears top-right of the Recent Activity section when history exists. Takes you to the full Ledger page.

**CTA banner** at the bottom of the page — a purple-tinted banner with a **+ New Payroll Run** button as a secondary entry point.

### What you can do from here
- Click **+ Run New Payroll** (top right or bottom banner) → goes to New Payroll Run page
- Click **View all →** → goes to Ledger page
- Click any tx hash link → opens that transaction in the Morph Hoodi block explorer in a new tab
- Click **NovaPay** in the navbar → stays on Dashboard (you're already here)

---

## Page 3 — New Payroll Run (`/payroll/new`)

**The core feature of the app. This is where you build and send a payroll batch.**

The page is split into two columns: a **main area** (left, takes up most of the width) with three sequential steps, and a **sticky sidebar** (right) showing a live summary.

---

### Main Area — Step 1: Upload CSV

A drag-and-drop zone occupies most of the card.

**Three ways to get your CSV in:**
1. Drag a `.csv` file from your file manager and drop it onto the zone
2. Click anywhere on the zone to open a file browser picker
3. Click **↓ Sample CSV** (top right of the card) to download a pre-formatted example with three mock employees — open it, edit it, and re-upload

**What the CSV must contain:**
- `wallet_address` column — a valid 0x Ethereum address for each recipient
- `amount` column — a positive number representing USDC to send (e.g. `3000` means $3,000 USDC)
- `name` column — optional, used for display and export only

**Column name aliases accepted** (case-insensitive):
- Address: `wallet_address`, `address`, `wallet`
- Amount: `amount`, `usdc_amount`, `usdc`
- Name: `name`, `employee_name`, `employee`

**After upload**, the zone changes appearance — it shows the filename in green with a "Click to replace" hint. You can click it again to swap in a different file at any time.

---

### Main Area — Step 2: Review Recipients

This card appears immediately after a CSV is uploaded. It does not require any action — it is read-only information.

**The preview table** shows one row per CSV entry:
- Row number
- Name (or "Recipient N" if the name column was empty)
- Wallet address (truncated with ellipsis if long)
- Amount in USDC
- Status badge: green ✓ Valid or red ✕ Error

**The red error banner** appears at the top of the card if any row failed validation. It lists each problem by line number and field — for example: *"Line 3: Invalid address: 0xinvalid"* or *"Line 5: Missing amount"*. Rows with errors are highlighted with a red background tint.

**Errors that get caught:**
- Address is missing entirely
- Address is not a valid 0x EVM format (checked with `ethers.isAddress()`)
- Amount is missing
- Amount is zero, negative, or not a number

**Total Payout row** at the bottom of the table — sums only the valid (non-error) rows. Updates live as you swap CSVs.

---

### Main Area — Step 3: Label This Payroll

This card also appears after upload. It contains a single text input.

Type a descriptive label like `Payroll - May 2026` or `Contractor Payments Q2 2026`. There is a 100-character limit.

This label is not just a display name — it is passed as a parameter to the smart contract's `batchPayout()` function and emitted in the `PayrollBatch` event on Morph. It is permanently stored onchain. This is the field that makes the accounting trail bulletproof.

---

### Sidebar — Payroll Summary

The sidebar stays fixed on screen as you scroll. It contains:

**Summary rows:**
- Recipients — count of valid rows only
- Total Amount — sum of valid rows in USDC, highlighted in purple
- Your Balance — your live USDC balance; turns red if it is less than the total amount
- Label — shows what you have typed so far, or "—" if empty

**Insufficient balance warning** — an amber warning box appears below the summary if your balance is lower than the total payout. The Send button is also disabled in this state.

**Pre-flight checklist** — four checks at the bottom of the sidebar, each turning green as you complete the step:
- ○ / ✓ CSV uploaded
- ○ / ✓ No validation errors
- ○ / ✓ Payroll label set
- ○ / ✓ Sufficient balance

**Send Payroll button** — disabled (greyed out) until all four checks are green. Once active, it reads *"Send Payroll → $X,XXX USDC"* with the total amount inline.

**What happens when you click Send:**
1. The button shows a spinner and reads "Sending Payroll…"
2. In live mode: MetaMask opens twice — first to approve the USDC spend, then to confirm the `batchPayout` transaction
3. In Demo Mode: a 2.5-second simulated delay runs, then you are automatically navigated to the Confirmation page
4. If the transaction fails (user rejects in MetaMask, network error, etc.) — an error box appears in the sidebar with the error message and the button resets. You do not lose your CSV or label.

---

## Page 4 — Transaction Confirmation (`/payroll/confirm`)

**You are taken here automatically after a successful send. You cannot navigate here directly.**

If you try to open `/payroll/confirm` directly without going through the send flow, you are immediately redirected to the Dashboard.

### What you see

The page fades in with an animation:
- A large circle with a **✓ checkmark** filled with a purple-to-violet gradient
- Two animated ripple rings expanding outward from the circle
- **"Payroll Sent!"** heading
- *"Your batch payout has been processed onchain and permanently recorded."* subtext

**Details card** showing four rows:
| Field | Value |
|---|---|
| Label | The label you set on the previous page, shown in green |
| Recipients | Number of employees paid (e.g. "5 employees paid") |
| Total Disbursed | Total USDC sent, shown in purple |
| Transaction Hash | Shortened hash — clicking it opens the full transaction on the Morph Hoodi explorer in a new tab |

**View on Morph Explorer button** — a dedicated button below the details card that opens the block explorer for that transaction. Even in Demo Mode, this navigates to the explorer URL so you can see what the explorer page would look like.

**Three navigation buttons:**
- **+ Run Another Payroll** → takes you straight to a fresh New Payroll Run page
- **View Ledger** → takes you to the Payroll History page where the new run is already listed at the top
- **Dashboard** → returns to the dashboard where the stats have updated

**Footer note** — a small box at the bottom confirming: *"This payroll event is permanently recorded on Morph with the label '…'. Head to the Ledger to export your accounting report."*

---

## Page 5 — Payroll Ledger (`/history`)

**The accounting and history page. Every payroll batch ever sent is listed here.**

### Filter Bar

Three filter controls sit at the top:
- **Search box** — filters rows by label as you type. Typing "May" shows only batches with "May" in the label. Case-insensitive.
- **From / To date pickers** — filter to a specific date range. From and To work independently — you can set just one.
- **Clear filters button** — appears only when at least one filter is active. Resets all three.

The **Ledger Summary line** below the filters updates live: *"3 payroll runs · Total: $29,000 USDC"* — this always reflects the filtered results, not the full history.

### History List

Each payroll batch appears as a card row. The row is clickable — clicking it expands or collapses the recipient detail table beneath it.

**Collapsed row shows:**
- Payroll label (bold)
- Date (e.g. "Wed, Apr 30, 2026") and recipient count
- Total USDC amount (right side)
- Tx hash link → opens Morph Hoodi explorer in a new tab
- **↓ CSV button** — exports just this one batch as a CSV file named `novapay-[label].csv`
- Expand/collapse arrow (▼ or ▲)

**Expanded row shows** a full recipient table with columns: Name, Wallet Address, Amount (USDC). The table has a slightly darker background to distinguish it from the row header.

**Export All CSV button** (top right of the page) — exports all currently filtered batches as a single CSV. If you have a date filter active, only that date range is exported. The file is named `novapay-ledger.csv`.

**The exported CSV contains:**
- Date, Payroll Label, Recipient Name, Wallet Address, Amount (USDC), Tx Hash, Block Explorer link — one row per recipient across all batches

### Empty states
- If no payroll history exists at all: an empty state shows with a "Run First Payroll" button
- If filters produce no matches: a different empty state shows with a "Clear filters" suggestion

---

## Navigation Flow Summary

```
/ (Connect Wallet)
    ↓ connect wallet
/dashboard
    ↓ "Run New Payroll"          ↓ "View all →"
/payroll/new               /history
    ↓ send payroll
/payroll/confirm
    ↓ "Run Another"   ↓ "View Ledger"   ↓ "Dashboard"
/payroll/new          /history          /dashboard
```

The navbar links (Dashboard / New Payroll / Ledger) are always available and work from any page.

---

## Things Worth Clicking During Exploration

| What to try | Where | What happens |
|---|---|---|
| Connect wallet on wrong network | Screen 1 | Dashboard loads but red warning bar appears |
| Click the red "Wrong Network" badge | Navbar | MetaMask opens to switch/add Morph Hoodi |
| Click the red warning bar | Below navbar | Same MetaMask switch prompt |
| Click ✕ on the wallet chip | Navbar | Disconnects and returns to Connect Wallet page |
| Download the sample CSV | New Payroll, Step 1 | Downloads `novapay-sample.csv` with 3 example rows |
| Upload a CSV with a bad address | New Payroll | Row turns red, error banner appears, Send button stays disabled |
| Upload a CSV with a zero amount | New Payroll | Same — caught and flagged before any transaction |
| Type in the label field | New Payroll, Step 3 | Sidebar label updates live, 4th check turns green |
| Watch sidebar checklist | New Payroll | Each check turns green as you complete each step |
| Click Send without all checks green | New Payroll | Button is disabled — nothing happens |
| Click Send with all checks green | New Payroll | Spinner → Confirmation page (2.5s in Demo Mode) |
| Click "View on Morph Explorer" | Confirmation | Opens explorer-hoodi.morphl2.io in a new tab |
| Click a tx hash link in history | Ledger or Dashboard | Opens that specific transaction on the explorer |
| Expand a history row | Ledger | Shows recipient-level breakdown table |
| Export a single batch | Ledger | Downloads `novapay-[label].csv` for that batch only |
| Export all (with filter active) | Ledger | Downloads only the filtered results, not full history |
| Type in the search box | Ledger | List filters in real time as you type |
| Refresh the page | Any | History persists from localStorage — nothing is lost |
