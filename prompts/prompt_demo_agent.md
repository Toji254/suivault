# Build the SuiVault Demo Trading Agent

You are building a **demo AI trading agent** that uses SuiVault to safely manage its funds on Sui. This agent demonstrates the core value proposition: an AI agent that can trade autonomously but is constrained by on-chain spending policies set by a human owner.

This is for the **Sui Overflow 2026 hackathon** — the demo needs to be visually impressive in the terminal and clearly show SuiVault's policy enforcement in action.

---

## CONTEXT: How SuiVault Works

SuiVault is an on-chain agent wallet protocol:
1. A **human owner** creates a Vault, deposits SUI, and sets spending rules (per-tx limit, daily budget, recipient whitelist, active hours)
2. The owner issues a **VaultKey** to the AI agent
3. The agent uses the VaultKey to **spend from the vault** — but every spend is policy-checked on-chain
4. If any rule is violated, the transaction **aborts** with a specific error code
5. The owner can **freeze** the vault instantly (kill switch)

## MOVE CONTRACT FUNCTIONS THE AGENT CALLS

The deployed contract package ID will be provided — use `PACKAGE_ID` as placeholder.

```
// Agent calls this to spend:
PACKAGE_ID::vault::spend_to<0x2::sui::SUI>(
    vault: &mut Vault<SUI>,   // shared object (vault ID)
    key: &VaultKey,            // agent's owned object (key ID)
    amount: u64,               // in MIST (1 SUI = 1_000_000_000 MIST)
    recipient: address,        // where to send the funds
    clock: &Clock,             // system clock at 0x6
    ctx: &mut TxContext,
)
```

**Error codes when spend is blocked:**
- `1` = Vault is frozen (kill switch)
- `3` = VaultKey expired
- `7` = Caller is not the authorized agent
- `100` = Amount exceeds per-transaction limit
- `101` = Amount would exceed daily spending limit
- `102` = Recipient not in whitelist
- `103` = Outside active hours

---

## EXISTING SDK (use these in your code)

The SDK is at `sdk/client.ts`. Here are the key functions you'll use:

```typescript
import { SuiVaultClient, parseVaultError, mistToSui } from "../sdk/client";
import { SuiVaultConfig, ONE_SUI } from "../sdk/types";

// Initialize
const client = new SuiVaultClient({
  packageId: "PACKAGE_ID",
  network: "testnet",
});

// Build a spend transaction
const tx = client.buildSpend(vaultId, keyId, amount, recipient);

// Build freeze/unfreeze (owner only)
const freezeTx = client.buildFreezeVault(vaultId, capId);
const unfreezeTx = client.buildUnfreezeVault(vaultId, capId);

// Parse errors
const errorMsg = parseVaultError(101); // "Amount would exceed daily spending limit"

// Format display
const displayAmount = mistToSui(BigInt(5_000_000_000)); // "5.0000"
```

For signing transactions, the agent uses its own keypair:
```typescript
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { SuiClient } from "@mysten/sui/client";

const agentKeypair = Ed25519Keypair.fromSecretKey(AGENT_PRIVATE_KEY);
const suiClient = new SuiClient({ url: getFullnodeUrl("testnet") });

// Sign and execute
const result = await suiClient.signAndExecuteTransaction({
  transaction: tx,
  signer: agentKeypair,
});
```

---

## FILE STRUCTURE TO CREATE

```
demo/
├── config.ts          # Configuration (package ID, vault ID, key ID, etc.)
├── setup.ts           # Creates vault + issues key (run once before demo)
├── agent.ts           # Main demo agent — runs the scenario script
├── owner-actions.ts   # Simulates owner actions (freeze/unfreeze)
├── package.json       # Dependencies
├── tsconfig.json      # TypeScript config
└── README.md          # How to run the demo
```

---

## WHAT EACH FILE DOES

### `config.ts`
```typescript
// Stores all the IDs needed for the demo.
// After running setup.ts, these get populated.
export const CONFIG = {
  packageId: "PACKAGE_ID",           // Set after contract deployment
  network: "testnet" as const,
  vaultId: "",                        // Set by setup.ts
  keyId: "",                          // Set by setup.ts
  capId: "",                          // Set by setup.ts
  agentAddress: "",                   // Set by setup.ts
  ownerAddress: "",                   // Set by setup.ts
  whitelistedRecipient: "",           // A testnet address to send to
};
```

### `setup.ts` — Run Once Before Demo
1. Generate an owner keypair and an agent keypair (or use existing ones)
2. Request testnet SUI from faucet for both
3. Owner creates a vault with these settings:
   - Name: "DeFi Trading Vault"
   - Deposit: 100 SUI
   - Max per tx: 10 SUI
   - Max per day: 50 SUI
   - Whitelisted recipients: [one testnet address]
   - Active hours: 0-23 (all hours for demo)
   - Key duration: 24 hours
4. Save the vault ID, key ID, cap ID, and addresses to a `demo-config.json` file
5. Print a summary

### `agent.ts` — The Main Demo (THIS IS THE MOST IMPORTANT FILE)

Runs through these scenarios automatically with 3-second delays between each:

```
SCENARIO 1: ✅ Successful Trade
- Agent spends 2 SUI to whitelisted recipient
- Result: APPROVED

SCENARIO 2: ❌ Blocked — Over Per-TX Limit  
- Agent tries to spend 25 SUI (limit is 10 SUI)
- Result: BLOCKED — "Amount exceeds per-transaction limit"

SCENARIO 3: ❌ Blocked — Unauthorized Recipient
- Agent tries to send to a random address (not whitelisted)
- Result: BLOCKED — "Recipient not in whitelist"

SCENARIO 4: ✅ Another Successful Trade
- Agent spends 5 SUI to whitelisted address
- Result: APPROVED

SCENARIO 5: 🔴 Kill Switch (run owner-actions.ts in parallel to freeze)
- Agent tries to spend 1 SUI
- Result: BLOCKED — "Vault is frozen"

SCENARIO 6: 🟢 Resumed (owner unfreezes)
- Agent spends 3 SUI successfully
- Result: APPROVED
```

**Console output must be beautiful. Use colors and formatting:**

```
╔══════════════════════════════════════════════════════════╗
║  🤖 SuiVault Demo Agent — DeFi Trading Bot             ║
╠══════════════════════════════════════════════════════════╣
║  Vault:  0x1234...abcd                                  ║
║  Key:    0x5678...efgh                                  ║
║  Policy: 10 SUI/tx · 50 SUI/day · 1 whitelisted addr   ║
╚══════════════════════════════════════════════════════════╝

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🔄 [Trade 1/6] Swapping 2 SUI → whitelisted address
   📋 Amount: 2 SUI (limit: 10 SUI)  ✅
   📋 Recipient: 0xabcd...  ✅ whitelisted
   ✅ APPROVED — TX: 0xef01...  (0.4s)
   💰 Balance: 98 SUI │ Daily: 2/50 SUI

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🔄 [Trade 2/6] Swapping 25 SUI → whitelisted address
   📋 Amount: 25 SUI (limit: 10 SUI)  ❌ OVER LIMIT
   ❌ BLOCKED — Amount exceeds per-transaction limit
   💰 Balance: 98 SUI │ Daily: 2/50 SUI (unchanged)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

... etc.

══════════════════════════════════════════════════════════════
📊 Demo Summary
══════════════════════════════════════════════════════════════
   Total Trades Attempted:  6
   ✅ Approved:             3  (10 SUI total)
   ❌ Blocked:              3  
      - Per-TX limit:       1
      - Bad recipient:      1  
      - Vault frozen:       1
   💰 Final Balance:        90 SUI
══════════════════════════════════════════════════════════════
```

### `owner-actions.ts` — Run Separately to Freeze/Unfreeze

```typescript
// Usage: 
//   npx tsx demo/owner-actions.ts freeze
//   npx tsx demo/owner-actions.ts unfreeze
// 
// Reads config from demo-config.json, signs with owner keypair
```

---

## IMPORTANT IMPLEMENTATION NOTES

1. **Catch transaction errors gracefully.** When a spend is blocked, the transaction aborts. Parse the error to extract the abort code:
   ```typescript
   try {
     await suiClient.signAndExecuteTransaction({ transaction: tx, signer: keypair });
   } catch (error: any) {
     const match = error.message?.match(/MoveAbort.*?(\d+)\)/);
     if (match) {
       const code = parseInt(match[1]);
       console.log(`❌ BLOCKED — ${parseVaultError(code)}`);
     }
   }
   ```

2. **Use chalk for colors** (or similar — `chalk@5.x` for ESM).

3. **Use `setTimeout` / `await new Promise(r => setTimeout(r, 3000))` between trades** for dramatic effect.

4. **The demo should run in ~30-60 seconds total.**

5. **For Scenarios 5-6 (kill switch):** The agent should print "⏳ Waiting for owner to freeze vault..." and poll the vault state every 2 seconds until it detects `is_frozen = true`, then attempt the trade. Same for unfreeze.

6. **Agent needs testnet SUI for gas.** Use the Sui testnet faucet: `await suiClient.requestSuiFromFaucet({ recipient: agentAddress })`

## DEPENDENCIES

```json
{
  "dependencies": {
    "@mysten/sui": "^1.0.0",
    "chalk": "^5.0.0"
  },
  "devDependencies": {
    "typescript": "^5.0.0",
    "tsx": "^4.0.0"
  }
}
```

## DELIVERABLES

Output the complete contents of ALL files listed in the file structure above. Every file must be complete and ready to use.
