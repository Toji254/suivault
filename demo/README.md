# SuiVault DeFi Trading Agent Demo

This directory contains the autonomous AI trading agent simulation for **SuiVault**, an on-chain agent wallet protocol on Sui built for the **Sui Overflow 2026 Hackathon**.

The demo showcases how an AI agent can execute transactions autonomously within guardrails (policy limit checks) managed by a human owner on-chain.

---

## Scenarios Demonstrated

The simulation runs through 6 sequential transactions (trades) with a 3-second delay:

1. **✅ Scenario 1: Approved Trade** — Agent spends `0.02 SUI` to a whitelisted recipient. Since it is within the transaction limit (`0.1 SUI`), daily budget (`0.3 SUI`), and sent to a whitelisted address, it is approved.
2. **❌ Scenario 2: Per-TX limit violation** — Agent attempts to spend `0.25 SUI`. The contract intercepts this and aborts the transaction with `EExceedsPerTxLimit (100)`.
3. **❌ Scenario 3: Whitelist violation** — Agent tries to spend `0.01 SUI` to a random, non-whitelisted address. The contract aborts with `ERecipientNotWhitelisted (102)`.
4. **✅ Scenario 4: Second Approved Trade** — Agent spends `0.05 SUI` to the whitelisted recipient. Total daily spent becomes `0.07 SUI` (budget is `0.3 SUI`), and is approved.
5. **❌ Scenario 5: Emergency Kill Switch (Frozen)** — The owner triggers the freeze function on-chain. The agent attempts to trade `0.01 SUI` but is blocked with `EVaultFrozen (1)`.
6. **✅ Scenario 6: Operation Resumed** — The owner unfreezes the vault. The agent successfully executes a `0.03 SUI` trade.

---

## File Structure

- `config.ts`: Configuration settings (package ID, network, etc.) that dynamically loads the outputs of the setup script.
- `setup.ts`: One-time setup script that generates keypairs, funds them from the Sui testnet faucet, creates the vault, and issues a key.
- `agent.ts`: The main trading agent executing the 6 scenarios with color-coded console logs.
- `owner-actions.ts`: Script enabling manual vault freezing or unfreezing outside the automated agent flow.
- `package.json` & `tsconfig.json`: NPM package configurations.

---

## How to Run the Demo

### 1. Install dependencies

```bash
cd demo
npm install
```

### 2. Configure Deployed Package ID

Publish your Move contract to the Sui Testnet, note the package ID, and update `packageId` in `config.ts`:

```typescript
// demo/config.ts
export const CONFIG = {
  packageId: "YOUR_DEPLOYED_PACKAGE_ID", // Change this to your package ID!
  network: "testnet" as const,
  ...
};
```

### 3. Run Setup

Run the setup script to generate keypairs, request testnet gas tokens, create the vault, and issue the agent's key. This will automatically write `demo-config.json` so you do not need to manually configure addresses.

```bash
npm run setup
```

### 4. Run the Agent Demo

Run the main agent simulation to view the 6 scenarios execute in the terminal:

```bash
npm run agent
```

### 5. Manual Owner Controls (Optional)

You can manually freeze or unfreeze the vault at any time by running:

```bash
# Freeze (Activate Kill Switch)
npx tsx owner-actions.ts freeze

# Unfreeze (Resume Agent Trading)
npx tsx owner-actions.ts unfreeze
```
