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
  packageId: "0x76e4f4311ea9c7cafeb45ad5817e784887e7021ac4595b3e6baf514cf3e725b9", // Owner replaces this with deployed package ID
  network: "testnet" as const,
  ...dynamicConfig,
};
