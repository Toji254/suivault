# SuiVault — On-Chain Financial Guardrails for AI Agents on Sui

SuiVault is an on-chain agent wallet protocol designed to provide secure, policy-enforced financial guardrails for autonomous AI agents. It protects human capital by enforcing spending limits, allowed recipient whitelists, operational hour limits, active-key revocation, DeepBook testnet pool/price constraints, Walrus-linked audit logs, and emergency kill switches directly on-chain.

## Project Structure

- **`sources/`**: Core Sui Move smart contracts containing the vault logic, spending policies, and audit logging.
- **`sdk/`**: TypeScript SDK client for building transactions and querying vault states.
- **`dashboard/`**: Next.js dashboard/administration console for configuring rules and managing vaults.
- **`demo/`**: Node.js scripts for running local agent simulations.

## Overflow 2026 Track Fit

SuiVault is built to compete across three Sui Overflow 2026 tracks:

- **Agentic Web**: AI agents receive scoped `VaultKey` objects instead of unrestricted wallets; Move enforces every spend.
- **DeepBook**: DeepBook-only vault policies target the canonical testnet SUI/DBUSDC pool through `@mysten/deepbook-v3`, and the SDK exposes a guarded SuiVault → DeepBook transaction builder.
- **Walrus**: AI risk decisions and extended audit payloads are stored through the Walrus testnet publisher and referenced by blob ID in SuiVault audit flows.

See `HACKATHON_SUBMISSION.md` for the judging strategy, demo flow, and submission checklist.

---

## Deploying Move Contracts (Sui Testnet)

To deploy your own custom instance of the Move contracts on Sui Testnet:

1. **Ensure you have Sui CLI installed and active.**
2. **Clear previous publication metadata** (if any) by deleting or clearing `/home/lowkey/suivault/Published.toml`.
3. **Publish the contract:**
   ```bash
   sui client publish --gas-budget 200000000
   ```
4. **Copy the package ID** from the output and update your dashboard configuration at `dashboard/lib/suivault.ts`.

---

## ⚡ Interactive Sandbox Mode & Troubleshooting

To ensure a seamless evaluation experience for hackathon judges and developers without requiring pre-configured OAuth client credentials or Testnet gas balances, SuiVault features a built-in **Interactive Sandbox Mode**:

### 1. Zero-Setup Demo Dashboard
* Opening the app puts you directly on the dashboard loaded with three preconfigured demo vaults: **DeFi Arbitrage Agent**, **MEME Accumulator Bot**, and **Liquidator Swarm**.
* You can test all features (Deposit, Withdrawal, emergency Freeze, spend Policy updates, and agent key Revocations) immediately. 
* All edits are persisted statefully in the browser's `localStorage` so they survive page reloads and behave identically to the real blockchain version.

### 2. Bypassing Google/Twitch 401 Client ID Errors
* If you click **Google** or **Twitch** sign-in, the app opens a beautiful, custom **Mock OAuth Portal** popup window.
* Select one of the preset mock emails (e.g., `user123@gmail.com`) or enter your own custom username. The portal will simulate zkLogin proof generation, log you in instantly, and close itself.

### 3. Troubleshooting Wallet Signing/Password Errors
* **The Problem:** In some environments, browser wallet extensions (such as Slush Wallet or Sui Wallet) can throw persistent "incorrect password" prompts or sign-and-execute failures during local testing.
* **The Solution:** When interacting with the pre-populated demo vaults (`demo-vault-` prefix), the dashboard automatically intercepts execution. All transaction blocks are simulated successfully on the client, returning mock transaction hashes. 
* **explorer Inspection:** These mock transactions populate the **Activity dropdown** in the Navbar, complete with copy-to-clipboard actions and direct redirects to the live **Suiscan Testnet Explorer** for inspectability.

---

## Running the Dashboard

For full instructions, see the [Dashboard README](file:///home/lowkey/suivault/dashboard/README.md).
