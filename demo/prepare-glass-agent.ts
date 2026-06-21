import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

const GLASS_OWNER = "0xf0d1230718187f66093b6787160f75a2bd36d68cde68ed4f38ec83b9660a2201";
const configPath = join(process.cwd(), "glass-agent-config.json");

let config: any = {};
if (existsSync(configPath)) {
  config = JSON.parse(readFileSync(configPath, "utf8"));
}

if (!config.agentPrivateKey || !config.agentAddress) {
  const keypair = new Ed25519Keypair();
  config.agentPrivateKey = keypair.getSecretKey();
  config.agentAddress = keypair.toSuiAddress();
}

config.ownerAddress = GLASS_OWNER;
config.agentName = config.agentName || "SuiVault Sentinel-1";
config.vaultName = config.vaultName || "Glass Wallet Agent Guardrail";
config.deposit = config.deposit || "1.0";
config.agentGas = config.agentGas || "0.08";
config.maxPerTx = config.maxPerTx || "0.10";
config.maxPerDay = config.maxPerDay || "0.50";
config.recipient = config.recipient || GLASS_OWNER;
config.network = "testnet";

writeFileSync(configPath, JSON.stringify(config, null, 2));

const params = new URLSearchParams({
  vaultName: config.vaultName,
  deposit: config.deposit,
  agentGas: config.agentGas,
  agentAddress: config.agentAddress,
  agentName: config.agentName,
  maxPerTx: config.maxPerTx,
  maxPerDay: config.maxPerDay,
  recipient: config.recipient,
});

console.log("Glass wallet owner:", config.ownerAddress);
console.log("Imported agent address:", config.agentAddress);
console.log("Agent private key saved locally at:", configPath);
console.log("Open this URL in the browser with Glass wallet connected:");
console.log(`http://127.0.0.1:3000/create?${params.toString()}`);
