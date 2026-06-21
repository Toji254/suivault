import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from "@mysten/sui/jsonRpc";
import { Transaction } from "@mysten/sui/transactions";
import { CONFIG } from "./config.js";

const amount = BigInt(process.env.DEMO_AGENT_TOPUP_MIST || "15000000");

async function main() {
  if (!CONFIG.ownerPrivateKey || !CONFIG.agentAddress) throw new Error("Missing ownerPrivateKey or agentAddress in demo-config.json");
  const client = new SuiJsonRpcClient({ url: getJsonRpcFullnodeUrl(CONFIG.network) });
  const owner = Ed25519Keypair.fromSecretKey(CONFIG.ownerPrivateKey);
  const tx = new Transaction();
  tx.setSender(owner.toSuiAddress());
  const [coin] = tx.splitCoins(tx.gas, [tx.pure.u64(amount)]);
  tx.transferObjects([coin], tx.pure.address(CONFIG.agentAddress));
  tx.setGasBudget(8_000_000);
  const result = await client.signAndExecuteTransaction({ transaction: tx, signer: owner, options: { showEffects: true } });
  await client.waitForTransaction({ digest: result.digest, timeout: 60_000 });
  if (result.effects?.status.status === "failure") throw new Error(result.effects.status.error);
  console.log(`Funded active agent with ${Number(amount) / 1_000_000_000} SUI`);
  console.log(`TX: ${result.digest}`);
  console.log(`Suiscan: https://suiscan.xyz/testnet/tx/${result.digest}`);
}
main().catch((err) => { console.error(err); process.exit(1); });
