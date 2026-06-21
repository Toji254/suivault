import { readFileSync, existsSync } from "fs";
import { join } from "path";

const CONFIG_FILE_PATH = join(process.cwd(), "demo", "demo-config.json");

let dynamicConfig = {
  vaultId: "",
  keyId: "",
  capId: "",
  agentAddress: "",
  ownerAddress: "",
  ownerPrivateKey: "",
  agentPrivateKey: "",
  whitelistedRecipient: "",
};

if (existsSync(CONFIG_FILE_PATH)) {
  try {
    dynamicConfig = JSON.parse(readFileSync(CONFIG_FILE_PATH, "utf-8"));
  } catch (e) {
    // ignore
  }
}

export const CONFIG = {
  packageId: "0xb1681ec32499ffc90c30d21bc7ffe8d3b160572cd25440e0ed0288a4f31bd98b", // Owner replaces this with deployed package ID
  network: "testnet" as const,
  ...dynamicConfig,
};
