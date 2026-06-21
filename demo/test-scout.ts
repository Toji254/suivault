/**
 * Test script to verify MarketScout works against live DeepBook testnet
 */
import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from "@mysten/sui/jsonRpc";
import { MarketScout } from "../sdk/market-scout";

async function main() {
  const client = new SuiJsonRpcClient({
    url: getJsonRpcFullnodeUrl("testnet"),
  });

  const scout = new MarketScout(client);

  console.log("🔍 Scanning DeepBook testnet for opportunities...\n");

  try {
    const opportunities = await scout.scanMarkets();

    if (opportunities.length === 0) {
      console.log("✓ No arbitrage/volatility opportunities detected at this moment");
    } else {
      console.log(`✓ Found ${opportunities.length} opportunity(ies):\n`);
      opportunities.forEach((opp, i) => {
        console.log(`  [${i + 1}] ${opp.type.toUpperCase()}`);
        console.log(`      Base: ${opp.baseAsset} → Quote: ${opp.quoteAsset}`);
        console.log(`      Current Price: ${opp.currentPrice.toString()}`);
        console.log(`      Fair Value: ${opp.fairValue.toString()}`);
        console.log(`      Potential Return: ${opp.potentialReturn.toFixed(2)}%`);
        console.log(`      Risk Level: ${opp.riskLevel}`);
        console.log(`      Reason: ${opp.reason}\n`);
      });
    }

    console.log("✓ Test passed: MarketScout can query DeepBook testnet");
  } catch (err) {
    console.error("✗ Test failed:", err);
    process.exit(1);
  }
}

main().catch(console.error);
