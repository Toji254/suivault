# SuiVault Dashboard — Frontend Integration Guide

You are building a **React/Next.js dashboard** for SuiVault, an on-chain agent wallet protocol on Sui. The Move smart contracts are deployed and the TypeScript SDK exists. You need to build a premium, dark-mode dashboard that lets vault owners manage their agent wallets.

This is for the **Sui Overflow 2026 hackathon** — the UI must look stunning and feel premium.

---

## CONTEXT: How SuiVault Works

SuiVault creates **policy-gated wallets for AI agents** on Sui:
1. Human owner creates a Vault → deposits SUI → sets spending rules → agent gets a VaultKey
2. Agent spends from vault, but every spend is checked against on-chain policy rules
3. Owner can freeze (kill switch), deposit more, withdraw, revoke keys, update policies
4. Everything is logged as on-chain events for audit trail

---

## SDK AVAILABLE

The SDK provides transaction builders and helper functions. Here's the full API:

```typescript
import { SuiVaultClient, parseVaultError, mistToSui, suiToMist } from "@suivault/sdk";
import { 
  PolicyPresets, ONE_SUI,
  Vault, VaultKey, VaultOwnerCap, Policy, PolicyConfig,
  CreateVaultParams, SuiVaultConfig,
  VaultCreatedEvent, SpendApprovedEvent, SpendBlockedEvent,
  VaultFrozenEvent, VaultUnfrozenEvent,
  VaultErrorCode, PolicyErrorCode,
} from "@suivault/sdk/types";

// Initialize client
const client = new SuiVaultClient({
  packageId: "PACKAGE_ID",  // Replace after deployment
  network: "testnet",
});

// === TRANSACTION BUILDERS (return Transaction objects for wallet signing) ===

// Create vault + issue key to agent (owner calls this)
client.buildCreateVault({
  coinObjectId: "0x...",        // Coin object to deposit
  name: "DeFi Trading Vault",
  agentAddress: "0x...",
  agentName: "Trading Bot",
  keyDurationMs: 604800000,     // 7 days
  policy: PolicyPresets.moderate(["0xrecipient1", "0xrecipient2"]),
});

// Agent spends from vault
client.buildSpend(vaultId, keyId, BigInt(5) * ONE_SUI, recipientAddress);

// Owner actions
client.buildFreezeVault(vaultId, capId);       // Kill switch
client.buildUnfreezeVault(vaultId, capId);     // Resume
client.buildDeposit(vaultId, capId, coinId);   // Add funds
client.buildWithdraw(vaultId, capId, amount);  // Remove funds
client.buildRevokeKey(vaultId, capId, keyId);  // Revoke agent access
client.buildUpdatePolicy(vaultId, capId, newPolicyConfig); // Change rules
client.buildIssueNewKey(vaultId, capId, agentAddr, agentName, durationMs);

// === QUERY FUNCTIONS ===
const vault = await client.getVault(vaultId);        // Fetch vault state
const key = await client.getVaultKey(keyId);          // Fetch key state
const vaults = await client.getVaultsByOwner(addr);   // All owner's vaults
const history = await client.getSpendingHistory(vaultId, 50); // Events
const unsub = await client.subscribeToVaultEvents(vaultId, callback); // Real-time

// === HELPERS ===
parseVaultError(101)  // → "Amount would exceed daily spending limit"
mistToSui(BigInt(5_000_000_000))  // → "5.0000"
suiToMist(5.0)        // → BigInt(5_000_000_000)

// === POLICY PRESETS ===
PolicyPresets.conservative(recipients)  // 1 SUI/tx, 10 SUI/day, 9-17 UTC
PolicyPresets.moderate(recipients)      // 10 SUI/tx, 100 SUI/day, 24/7
PolicyPresets.aggressive()              // 100 SUI/tx, 1000 SUI/day, no limits
PolicyPresets.unlimited()               // No restrictions
```

---

## MOVE CONTRACT EVENT TYPES (for real-time feeds)

Events emitted by the contract (use `PACKAGE_ID::vault::EventName`):
- `VaultCreated { vault_id, owner, name, initial_balance }`
- `KeyIssued { vault_id, key_id, agent_address, agent_name, expires_at_ms }`
- `SpendApproved { vault_id, agent_address, amount, recipient, remaining_balance, daily_spent }`
- `SpendBlocked { vault_id, agent_address, amount, reason }`
- `VaultFrozen { vault_id, frozen_by }`
- `VaultUnfrozen { vault_id, unfrozen_by }`
- `FundsDeposited { vault_id, amount, new_balance, deposited_by }`
- `FundsWithdrawn { vault_id, amount, remaining_balance, withdrawn_by }`
- `KeyRevoked { vault_id, key_id, revoked_by }`

---

## WALLET INTEGRATION

Use `@mysten/dapp-kit` for wallet connection:

```bash
npm install @mysten/dapp-kit @mysten/sui @tanstack/react-query
```

```tsx
// App root wrapper:
import { SuiClientProvider, WalletProvider } from "@mysten/dapp-kit";
import { getFullnodeUrl } from "@mysten/sui/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "@mysten/dapp-kit/dist/index.css";

const queryClient = new QueryClient();
const networks = { testnet: { url: getFullnodeUrl("testnet") } };

function App({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <SuiClientProvider networks={networks} defaultNetwork="testnet">
        <WalletProvider autoConnect>
          {children}
        </WalletProvider>
      </SuiClientProvider>
    </QueryClientProvider>
  );
}

// In components:
import { useCurrentAccount, useSignAndExecuteTransaction } from "@mysten/dapp-kit";
import { ConnectButton } from "@mysten/dapp-kit";

function VaultPage() {
  const account = useCurrentAccount();
  const { mutate: signAndExecute } = useSignAndExecuteTransaction();

  const handleFreeze = () => {
    const tx = client.buildFreezeVault(vaultId, capId);
    signAndExecute({ transaction: tx }, {
      onSuccess: (result) => { /* show toast */ },
      onError: (error) => { /* parse and show error */ },
    });
  };
}
```

---

## PAGES TO BUILD

### 1. Dashboard Home (`/`)
- Header with SuiVault logo, `<ConnectButton />`, and network indicator
- Grid of vault cards showing: name, status (🟢 Active / 🔴 Frozen), balance, daily spending progress bar, agent name, key expiry countdown
- "Create New Vault" button
- Empty state if no vaults

### 2. Create Vault Page (`/create`)
Multi-step form wizard:
- **Step 1**: Vault name + deposit amount (with wallet balance display)
- **Step 2**: Agent address + agent name + key duration (dropdown: 1d, 7d, 30d, custom)
- **Step 3**: Policy — preset selector (Conservative/Moderate/Aggressive/Custom) + custom fields for per-tx limit, daily limit, whitelisted addresses, active hours
- **Step 4**: Review all settings → Submit button

### 3. Vault Detail Page (`/vault/[id]`)
- **Status bar**: Status badge, balance, daily budget progress, key expiry countdown
- **Quick actions row**: 🔴 Freeze / 🟢 Unfreeze, 💰 Deposit, 💸 Withdraw, 🔑 Revoke Key, ⚙️ Edit Policy
- **Activity feed** (real-time): List of recent events with ✅/❌ icons, amounts, timestamps, recipients
- **Policy display**: Current rules in a card
- **Stats section**: Daily spending bar chart (last 7 days), approved vs blocked pie chart, budget utilization gauge

### 4. Agent View (`/agent`)
Simplified view for agents to check their keys:
- List of VaultKey objects owned by connected wallet
- For each key: vault name, balance, budget remaining, per-tx limit, expiry, status
- Spend button (opens spend form)

---

## DESIGN REQUIREMENTS

**CRITICAL: The dashboard must look PREMIUM. This is for a hackathon.**

- **Dark mode** — deep dark backgrounds (#0a0a0f), glassmorphism cards with subtle borders
- **Color palette**: Emerald green for approved/active (#10b981), Red for blocked/frozen (#ef4444), Amber for warnings (#f59e0b), Blue/purple accents (#8b5cf6)
- **Typography**: Use Inter or similar modern sans-serif from Google Fonts
- **Animations**: Smooth page transitions, card hover effects (scale + glow), number count-up animations for balances, skeleton loaders
- **Cards**: Glassmorphism style — `background: rgba(255,255,255,0.05); backdrop-filter: blur(10px); border: 1px solid rgba(255,255,255,0.1);`
- **Kill switch button**: Large, red, prominent — with a confirmation modal
- **Activity feed**: Real-time updates slide in from the top with a fade animation
- **Progress bars**: Animated gradient fill for daily spending (green → yellow → red as it approaches limit)
- **Mobile responsive**: Must work on mobile for emergency kill-switch access
- **Toast notifications**: Success/error toasts for all transaction results

---

## KEY CONFIGURATION

After deploying the contracts, update this:

```typescript
// config.ts
export const SUIVAULT_CONFIG = {
  packageId: "0x...",  // Set after `sui client publish`
  network: "testnet" as const,
};
```

---

## TECH STACK

- **Next.js 14+** with App Router
- **Vanilla CSS** (or CSS Modules) — no Tailwind unless explicitly requested
- **@mysten/dapp-kit** for wallet connection
- **@mysten/sui** for blockchain queries
- **recharts** or **chart.js** for spending analytics
- **sonner** or **react-hot-toast** for toast notifications
- **framer-motion** for animations

---

## DELIVERABLES

Output the complete contents of ALL files needed for a working Next.js app:
1. `package.json` with all dependencies
2. `app/layout.tsx` — root layout with providers
3. `app/page.tsx` — dashboard home
4. `app/create/page.tsx` — create vault wizard
5. `app/vault/[id]/page.tsx` — vault detail page
6. `app/agent/page.tsx` — agent view
7. `components/` — all reusable components (VaultCard, ActivityFeed, PolicyEditor, KillSwitch, etc.)
8. `lib/suivault.ts` — SuiVault client initialization
9. `app/globals.css` — complete dark theme styles
10. Any other files needed for a working app

Every file must be complete and ready to use. Do NOT use placeholder components — build the real thing.
