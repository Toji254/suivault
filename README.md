<p align="center">
  <img src="assets/suivault-icon.svg" alt="SuiVault Icon" width="140" />
</p>

<h1 align="center">SuiVault</h1>

<p align="center">
  <strong>On-chain financial guardrails for autonomous AI agents on Sui.</strong>
</p>

<p align="center">
  <a href="https://youtu.be/adT97JyeIdY">Watch Demo Video</a> ·
  <a href="https://github.com/Toji254/suivault">GitHub Repository</a> ·
  <a href="https://suivault-e6flhsfya-loki11.vercel.app">Live App</a>
</p>

---

## Overview

SuiVault is an on-chain wallet safety protocol for AI agents. Instead of giving autonomous agents unrestricted access to a wallet, SuiVault gives them scoped vault keys with strict rules enforced by Sui Move smart contracts.

The goal is simple: **AI agents can act, but they cannot drain funds, bypass limits, send assets to unknown addresses, or keep operating after being revoked.**

SuiVault protects human capital by enforcing spending limits, daily budgets, recipient whitelists, active-hour restrictions, DeepBook pool and price constraints, Walrus-linked audit logs, and emergency kill switches directly on-chain.

---

## Demo Video

Watch the full walkthrough here:

[https://youtu.be/adT97JyeIdY](https://youtu.be/adT97JyeIdY)

<a href="https://youtu.be/adT97JyeIdY">
  <img src="https://img.youtube.com/vi/adT97JyeIdY/maxresdefault.jpg" alt="SuiVault Demo Video" width="720" />
</a>

---

## Why SuiVault Matters

AI agents are becoming capable of trading, managing portfolios, executing DeFi strategies, and moving assets automatically. The dangerous part is that most agents still rely on unrestricted private keys or wallet permissions.

That creates major risks:

- An agent can spend more than intended.
- A compromised agent can drain funds.
- A bad prompt or faulty strategy can trigger unintended transactions.
- Owners may not have a fast kill switch.
- Audit trails are often weak or fully off-chain.

SuiVault solves this by turning the wallet into a programmable policy vault. The owner defines what the agent is allowed to do, and the Move contract enforces the rules before funds are released.

---

## Core Features

| Feature | What it Does |
|---|---|
| Scoped Agent Vaults | Gives AI agents limited vault keys instead of unrestricted wallets. |
| Per-Transaction Limits | Blocks any spend above the configured transaction cap. |
| Daily Budget Limits | Prevents agents from spending beyond a daily allowance. |
| Recipient Whitelists | Allows funds to move only to approved addresses or protocols. |
| Active-Hour Controls | Restricts agent operations to selected UTC time windows. |
| DeepBook Guardrails | Supports DeepBook-only policies with pool and price constraints. |
| Walrus Audit Links | Stores extended AI risk decisions and audit metadata through Walrus references. |
| Emergency Kill Switch | Lets the owner instantly freeze vault activity. |
| Key Revocation | Owners can revoke or deactivate agent keys when needed. |
| Demo Sandbox Mode | Judges can test the app without needing real funds or OAuth setup. |

---

## Sui Overflow 2026 Track Fit

SuiVault is designed for the Sui Overflow 2026 ecosystem and fits strongly into these tracks:

### Agentic Web

AI agents receive scoped `VaultKey` objects instead of raw wallet control. Every spend is checked by Move policy rules before execution.

### DeepBook

SuiVault includes DeepBook-focused guardrails for agent trading workflows, including pool restrictions and price boundaries.

### Walrus

Extended audit payloads, AI reasoning logs, and risk metadata can be stored off-chain through Walrus and referenced on-chain by blob ID.

---

## Architecture

```text
User / Vault Owner
        |
        v
Next.js Dashboard
        |
        v
SuiVault TypeScript SDK
        |
        v
Sui Move Smart Contracts
        |
        +--> Vault Object
        +--> VaultKey Object
        +--> OwnerCap Object
        +--> Policy Rules
        +--> Audit Events
        |
        v
Sui Testnet / Mainnet-ready Architecture

Optional integrations:
        +--> DeepBook guarded trading flow
        +--> Walrus audit blob references
        +--> Browser sandbox mode for demos
```

---

## Project Structure

```text
suivault/
├── sources/                  # Sui Move smart contracts
├── sdk/                      # TypeScript SDK for transactions and vault queries
├── dashboard/                # Next.js dashboard and demo interface
├── demo/                     # Agent simulation scripts
├── tests/                    # Move tests
├── assets/                   # Branding assets, including SuiVault icon
├── Move.toml                 # Sui Move package config
├── package.json              # Root workspace scripts
├── HACKATHON_SUBMISSION.md   # Hackathon pitch and checklist
└── README.md                 # Main project documentation
```

---

## Prerequisites

Install these before running the project:

- Node.js 18 or newer
- npm 9 or newer
- Git
- Sui CLI
- A Sui wallet extension such as Slush Wallet or Sui Wallet
- Testnet SUI if you want to publish and run real on-chain transactions

For quick judging or demo usage, the dashboard includes sandbox behavior, so users can explore most flows without needing a fully funded wallet.

---

## Quick Start

### 1. Clone the Repository

```bash
git clone https://github.com/Toji254/suivault.git
cd suivault
```

### 2. Install Dependencies

```bash
npm install --legacy-peer-deps
```

### 3. Run the Dashboard

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

The root package delegates dashboard commands into the `dashboard/` workspace.

---

## Run on Windows

### Option A: Windows PowerShell

```powershell
git clone https://github.com/Toji254/suivault.git
cd suivault
npm install --legacy-peer-deps
npm run dev
```

Open:

```text
http://localhost:3000
```

### Option B: Windows Subsystem for Linux

```bash
git clone https://github.com/Toji254/suivault.git
cd suivault
npm install --legacy-peer-deps
npm run dev
```

If PowerShell blocks scripts, run PowerShell as administrator and use:

```powershell
Set-ExecutionPolicy RemoteSigned
```

Then retry `npm run dev`.

---

## Run on macOS

```bash
git clone https://github.com/Toji254/suivault.git
cd suivault
npm install --legacy-peer-deps
npm run dev
```

Open:

```text
http://localhost:3000
```

If Node.js is missing, install it with Homebrew:

```bash
brew install node
```

---

## Run on Linux

```bash
git clone https://github.com/Toji254/suivault.git
cd suivault
npm install --legacy-peer-deps
npm run dev
```

Open:

```text
http://localhost:3000
```

On Ubuntu/Debian, install Node.js and npm if missing:

```bash
sudo apt update
sudo apt install nodejs npm git
```

For newer Node versions, using `nvm` is recommended.

---

## Dashboard-Only Commands

If you want to work directly inside the dashboard app:

```bash
cd dashboard
npm install --legacy-peer-deps
npm run dev
```

Build production output:

```bash
npm run build
```

Start the production server:

```bash
npm run start
```

---

## Build the Full Project

From the repository root:

```bash
npm run build
```

This runs the dashboard production build.

Expected successful output includes routes such as:

```text
/                 Dashboard landing page
/agent            Agent console
/create           Vault creation wizard
/vault/[id]       Vault control center
/welcome          Onboarding page
```

---

## Deploying Move Contracts to Sui Testnet

### 1. Install and Configure Sui CLI

Follow the official Sui CLI installation guide, then confirm it works:

```bash
sui --version
```

Set your environment to testnet:

```bash
sui client switch --env testnet
```

Check your active address:

```bash
sui client active-address
```

Request testnet SUI from the faucet if needed.

### 2. Publish the Move Package

From the project root:

```bash
sui client publish --gas-budget 200000000
```

After publishing, copy the package ID from the output.

### 3. Update Dashboard Configuration

Open:

```text
dashboard/lib/suivault.ts
```

Update the package ID:

```ts
export const SUIVAULT_CONFIG = {
  packageId: "YOUR_DEPLOYED_PACKAGE_ID",
  network: "testnet" as const,
};
```

### 4. Run the Dashboard Again

```bash
npm run dev
```

---

## Important Move Deployment Note

If you republish the Move package and Sui complains about existing publication metadata, clear or remove the previous testnet publication section in:

```text
Published.toml
```

Then publish again:

```bash
sui client publish --gas-budget 200000000
```

---

## Environment Variables

The dashboard can run in demo mode without custom environment variables.

Optional variables:

```env
NEXT_PUBLIC_ENOKI_API_KEY=your_enoki_public_key
```

If this is not provided, the app falls back to its demo-friendly configuration.

---

## Interactive Sandbox Mode

SuiVault includes a judge-friendly sandbox mode so reviewers can test the product quickly.

### Zero-Setup Demo Dashboard

Opening the app loads preconfigured demo vaults such as:

- DeFi Arbitrage Agent
- MEME Accumulator Bot
- Liquidator Swarm

Users can test deposits, withdrawals, freezes, policy edits, and revocations without needing to prepare a full live environment.

### Mock OAuth Flow

If Google or Twitch sign-in is selected, the app shows a custom mock OAuth portal. This avoids blocking judges with missing third-party OAuth credentials.

### Mock Transaction Handling

For demo vaults using the `demo-vault-` prefix, the dashboard simulates successful transaction execution and returns mock transaction hashes for inspection flows.

---

## Vercel Deployment

Recommended Vercel settings:

```text
Framework Preset: Next.js
Root Directory: dashboard
Install Command: npm install --legacy-peer-deps
Build Command: npm run build
Output Directory: .next
```

If a Vercel deployment fails after fixes have been pushed, redeploy with build cache disabled:

```text
Deployments → Redeploy → Use existing build cache: OFF
```

---

## Common Troubleshooting

### `Command 'Build' not found`

These are Vercel settings, not terminal commands:

```text
Build Command: npm run build
Install Command: npm install --legacy-peer-deps
Output Directory: .next
```

Do not paste them into the terminal. Put them inside Vercel project settings.

### `npm install` dependency conflict

Use:

```bash
npm install --legacy-peer-deps
```

### Next.js build fails during type checking

Pull the latest repository changes and rebuild:

```bash
git pull
npm install --legacy-peer-deps
npm run build
```

### Vercel shows `404: NOT_FOUND`

Usually this means the latest deployment failed or Vercel is pointing at the wrong folder. Confirm:

```text
Root Directory: dashboard
```

Then redeploy the latest successful commit.

### Wallet extension asks for password repeatedly

Use the built-in demo vaults first. Demo flows are designed to simulate execution safely in-browser.

---

## Development Scripts

From the repository root:

```bash
npm run dev      # Run the dashboard locally
npm run build    # Build the dashboard
npm run start    # Start the production dashboard server
```

From inside `dashboard/`:

```bash
npm run dev
npm run build
npm run start
```

---

## Main Tech Stack

- Sui Move
- Sui Testnet
- TypeScript
- Next.js 14
- React 18
- Tailwind CSS
- Mysten dApp Kit
- Mysten Sui SDK
- DeepBook v3 integration path
- Walrus audit reference path

---

## Security Model

SuiVault is built around least-privilege agent execution.

Instead of asking, "Can the AI agent be trusted?" SuiVault asks, "What is the maximum damage this agent can do?" and then limits that damage with on-chain rules.

Security controls include:

- Owner-controlled vault creation
- Scoped agent keys
- Transaction caps
- Daily spend caps
- Whitelisted recipients
- Time-window restrictions
- DeepBook pool restrictions
- Emergency freeze controls
- Key revocation
- On-chain audit events

---

## Current Status

SuiVault is a hackathon-ready prototype with working dashboard flows, Move contract structure, SDK helpers, sandbox testing, and Sui-focused architecture.

Before production mainnet use, the project should undergo:

- Full smart contract audit
- More complete integration testing
- Mainnet package deployment
- Production-grade indexer support
- Hardened OAuth and wallet handling

---

## Roadmap

- Mainnet-ready SuiVault deployment
- Production DeepBook execution integration
- Full Walrus audit storage pipeline
- Agent marketplace integrations
- Multi-vault team controls
- DAO treasury guardrails
- AI risk scoring before transaction execution
- Advanced analytics dashboard

---

## Useful Links

- Demo Video: [https://youtu.be/adT97JyeIdY](https://youtu.be/adT97JyeIdY)
- Repository: [https://github.com/Toji254/suivault](https://github.com/Toji254/suivault)
- Live App: [https://suivault-e6flhsfya-loki11.vercel.app](https://suivault-e6flhsfya-loki11.vercel.app)
- Hackathon Submission Notes: [`HACKATHON_SUBMISSION.md`](HACKATHON_SUBMISSION.md)
- Dashboard Docs: [`dashboard/README.md`](dashboard/README.md)

---

## License

This project is currently provided for hackathon evaluation and educational use. Add a formal license before production or public commercial use.
