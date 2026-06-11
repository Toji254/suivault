# SuiVault — Overflow 2026 Submission Strategy

## Track positioning

SuiVault is now credible for three Overflow tracks:

1. Agentic Web — primary
   - AI agents receive scoped VaultKey objects instead of unrestricted wallets.
   - Sui Move enforces spend limits, recipient policies, active hours, key expiry, and emergency freezes.
   - Non-cooperative key deactivation prevents an agent from continuing to spend with an old key after the owner disables it.

2. DeepBook — secondary/technical track
   - Testnet DeepBook v3 metadata is wired through `@mysten/deepbook-v3`.
   - The dashboard DeepBook preset uses the canonical testnet SUI/DBUSDC pool.
   - The SDK exposes `buildGuardedDeepBookSwap`, a programmable transaction path that first withdraws a policy-checked coin from SuiVault and then passes it into the official DeepBook testnet SDK swap call.

3. Walrus — secondary/technical track
   - `WalrusAuditClient` stores rich AI risk/audit payloads with the Walrus testnet publisher.
   - Audit records keep the returned Walrus blob ID on-chain through SuiVault spend/log calls.
   - The dashboard activity feed reads extended reasoning from the Walrus testnet aggregator.
   - If the public publisher is unavailable, the client emits a deterministic local proof ID and clearly marks it as fallback rather than pretending it is a real blob.

## One-sentence pitch

SuiVault lets AI agents use real capital on Sui without unrestricted wallets: every spend is constrained by Move-enforced policy, logged through Walrus, and optionally routed into DeepBook testnet liquidity.

## Demo path judges should see

1. Open the dashboard.
2. Create or load a vault.
3. Apply the DeepBook Trading Preset.
4. Confirm the policy points at the testnet SUI/DBUSDC DeepBook pool.
5. Issue or import an agent VaultKey.
6. Use the Agent Console to submit a spend intent.
7. Show the AI Risk Guardian verdict and Walrus blob ID.
8. Execute the guarded spend / guarded DeepBook transaction.
9. Show the Activity Feed and Walrus reasoning expansion.
10. Show the package ID and explorer transaction.

## Required submission facts

- Public repository: required during judging.
- Demo video: <= 5 minutes, YouTube preferred.
- Deployment: testnet is acceptable; include package ID.
- Current package ID configured in dashboard:
  `0x76e4f4311ea9c7cafeb45ad5817e784887e7021ac4595b3e6baf514cf3e725b9`
- Website: strongly recommended. The dashboard static build can be deployed as a Walrus Site.
- Logo: prepare a 1:1 PNG/JPG.

## What changed for production readiness

- Added active-key validation on all spend paths.
- Added `deactivate_key` so owners can disable a key without possessing the agent's key object.
- Added tests proving old keys cannot spend after deactivation/reissue.
- Added real Walrus publisher/aggregator client with normalized testnet responses.
- Replaced ad-hoc Walrus upload logic in `AiRiskGuardian` with `WalrusAuditClient`.
- Added DeepBook testnet metadata and SDK helpers.
- Added a guarded DeepBook PTB builder for SuiVault -> DeepBook execution.
- Updated dashboard DeepBook preset to the canonical testnet SUI/DBUSDC pool.
- Updated agent console to use DeepBook + Walrus paths when a vault policy is DeepBook-only.

## Honest limitations to disclose if asked

- The project is configured for testnet.
- Full production mainnet deployment should follow an audit and capped launch.
- DeepBook execution requires the active testnet pool and wallet/client resolution at signing time.
- Walrus publisher availability is external; fallback IDs are clearly marked and are not represented as certified Walrus blobs.
