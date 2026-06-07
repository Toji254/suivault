# SuiVault React/Next.js Dashboard

This directory contains the premium, dark-mode administrative console and governance dashboard for **SuiVault**, an on-chain AI agent wallet protocol on Sui built for the **Sui Overflow 2026 Hackathon**.

The dashboard connects via `@mysten/dapp-kit` to let users securely provision vaults, configure spending rules, enforce daily budgets, activate emergency kill switches, and track on-chain agent activity logs in real-time.

---

## Visual Design System & Aesthetics

- **Dark Mode Architecture**: Deep dark base colors (`#05050a` / `#0b0b14`) with ambient backdrop gradients providing a glowing look.
- **Glassmorphism Panels**: UI cards use blurred glass paneling with premium thin borders:
  ```css
  background: rgba(255, 255, 255, 0.02);
  backdrop-filter: blur(16px);
  border: 1px solid rgba(255, 255, 255, 0.06);
  ```
- **Micro-Animations**: Real-time glow animations for active vault cards, hover transitions on buttons, and smooth modal overlays.
- **Typography & Font pairings**: Curated Space Grotesk (monospaced parameters) and Outfit (sans-serif text) pair beautifully for high readability and premium styling.

---

## Page Layout & Features

1. **Governance Home (`app/page.tsx`)**:
   - Wallet connection panel.
   - Grid cards of owned agent vaults detailing SUI balances, real-time budget utilization percentages, key validations, and freeze indicators.
2. **Setup Wizard (`app/create/page.tsx`)**:
   - Multi-step wizard to deposit funds, configure agent key duration, set transaction limit sizes, select spending presets (Conservative, Moderate, Aggressive, Unlimited), build allowed recipient whitelists, and enforce UTC active hour schedules.
3. **Control Center (`app/vault/[id]/page.tsx`)**:
   - **Emergency Kill Switch**: High-visibility trigger to instantly freeze/unfreeze on-chain agent trading operations.
   - **Administrative Controls**: Rapid buttons to deposit more funds, withdraw capitals, revoke agent keys, and edit active policies.
   - **Audit Logs Feed**: Real-time event subscriber to query on-chain spending logs, blocks, and keys, linking directly to extended off-chain logs stored on **Walrus protocol**.
4. **Agent Console (`app/agent/page.tsx`)**:
   - Interface for delegated agent keys.
   - Shows all active delegations granted to the connected wallet.
   - Spend simulator form enabling agents to submit transaction proposals and test policy-gate rules client-side (pre-flight checks) before broadcast.

---

## File Structure

```
dashboard/
├── app/
│   ├── layout.tsx         # App wrapper loaded with dapp-kit & QueryClient providers
│   ├── page.tsx           # Owner console index showing vault overview
│   ├── globals.css        # Full CSS tokens, animations, and custom overrides
│   ├── create/
│   │   └── page.tsx       # Wizard deploying new on-chain vaults & policies
│   ├── vault/
│   │   └── [id]/
│   │       └── page.tsx   # Detailed control center with deposit/withdrawals & revocation
│   └── agent/
│       └── page.tsx       # Agent view displaying delegations & spend simulators
├── components/
│   ├── Navbar.tsx         # Sticky header with ConnectButton
│   ├── VaultCard.tsx      # Vault status, balances, and utilization bars
│   ├── KillSwitch.tsx     # Emergency freeze confirmation panels
│   ├── PolicyEditor.tsx   # Preset selectors, whitelists, & active hour selectors
│   └── ActivityFeed.tsx   # Real-time event log viewer
├── lib/
│   └── suivault.ts        # Client initialization utilizing local SDK bundle
├── next.config.js         # Next.js configurations with fallback webpack helpers
├── tsconfig.json          # Strict TypeScript compiler options
└── package.json           # NPM package manifest
```

---

## How to Run locally

### 1. Install dependencies

```bash
cd dashboard
npm install
```

### 2. Configure Deployed Package ID

Publish your Move contract to the Sui Testnet, note the package ID, and update it in `lib/suivault.ts`:

```typescript
// lib/suivault.ts
export const SUIVAULT_CONFIG = {
  packageId: "YOUR_DEPLOYED_PACKAGE_ID", // Change this to your deployed package ID!
  network: "testnet" as const,
};
```

> [!IMPORTANT]
> **Redeploying / Custom Publication Note**:
> If you or another developer wants to publish a fresh custom copy of the Move contract to Testnet, you must first clear the previously stored publication metadata.
> Simply remove the `[published.testnet]` section or delete/empty the `Published.toml` file in the root directory before running:
> ```bash
> sui client publish --gas-budget 200000000
> ```

### 3. Spin up development server

```bash
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000) to view your dashboard!
