import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from './market-scout.js';
import { testnetPools } from "@mysten/deepbook-v3";

async function main() {
  const client = new SuiJsonRpcClient({ url: getJsonRpcFullnodeUrl("testnet"), network: "testnet" });
  const poolKey = "SUI_DBUSDC" as const;
  const pool = (testnetPools as any)[poolKey];
  console.log("Pool key:", poolKey);
  console.log("Pool object:", JSON.stringify(pool, null, 2));
  console.log("All pool keys:", Object.keys(testnetPools));

  try {
    const obj = await client.getObject({
      id: pool.address,
      options: { showContent: true, showType: true, showOwner: true },
    });
    console.log("Object error:", obj.error);
    console.log("Object type:", obj.data?.type);
    if (obj.data?.content) {
      const fields = (obj.data.content as any).fields;
      console.log("Top-level fields:", Object.keys(fields));
      if (fields.inner) {
        console.log("inner keys:", Object.keys(fields.inner));
        // DeepBook v3 pool: inner is a struct wrapper { type, fields }
        const innerWrapper = fields.inner;
        const inner = innerWrapper.fields || innerWrapper;
        console.log("inner fields type:", innerWrapper.type);
        if (innerWrapper.type) {
          console.log("inner type:", innerWrapper.type);
        }
        console.log("inner unwrapped keys:", Object.keys(inner));
        if (inner.bids) console.log("bids value:", typeof inner.bids, JSON.stringify(inner.bids).slice(0, 120));
        if (inner.asks) console.log("asks value:", typeof inner.asks, JSON.stringify(inner.asks).slice(0, 120));
      }
    }
  } catch (e: any) {
    console.error("getObject failed:", e.message);
  }
}
main();
