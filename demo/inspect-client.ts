
import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from "@mysten/sui/jsonRpc";
import { CONFIG } from "./config.js";

async function inspect() {
  const suiClient = new SuiJsonRpcClient({ url: getJsonRpcFullnodeUrl(CONFIG.network) });
  const anyClient = suiClient as any;

  console.log("Core keys:", Object.keys(anyClient.core || {}));
  if (anyClient.core) {
     console.log("Core proto keys:", Object.keys(Object.getPrototypeOf(anyClient.core)));
     console.log("Has core.simulateTransaction:", typeof anyClient.core.simulateTransaction);
  }
}

inspect();
