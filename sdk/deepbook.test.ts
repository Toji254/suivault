import { describe, expect, it } from "vitest";
import { SuiVaultClient } from "./client.ts";
import { createDeepBookTestnetConfig, SUIVAULT_DEEPBOOK_TESTNET } from "./deepbook.ts";

describe("DeepBook testnet integration", () => {
  it("ships canonical DeepBook testnet pool metadata for the guarded SUI/USDC path", () => {
    expect(SUIVAULT_DEEPBOOK_TESTNET.defaultPoolKey).toBe("SUI_DBUSDC");
    expect(SUIVAULT_DEEPBOOK_TESTNET.pools.SUI_DBUSDC.address).toMatch(/^0x[0-9a-f]+/i);
    expect(SUIVAULT_DEEPBOOK_TESTNET.coins.SUI.type).toContain("::sui::SUI");
    expect(SUIVAULT_DEEPBOOK_TESTNET.coins.DBUSDC.type).toContain("::");
  });

  it("creates a DeepBook client config wired to the same Sui client and testnet network", () => {
    const vault = new SuiVaultClient({ packageId: "0x123", network: "testnet" });
    const config = createDeepBookTestnetConfig(vault.client, "0xagent");

    expect(config.client).toBe(vault.client);
    expect(config.network).toBe("testnet");
    expect(config.address).toBe("0xagent");
    expect(config.pools.SUI_DBUSDC.address).toBe(SUIVAULT_DEEPBOOK_TESTNET.pools.SUI_DBUSDC.address);
  });

  it("builds a guarded DeepBook intent transaction that first withdraws from SuiVault then targets a DeepBook pool", async () => {
    const vault = new SuiVaultClient({ packageId: "0x123", network: "testnet" });
    const tx = vault.buildGuardedDeepBookSpend({
      vaultId: "0x456",
      keyId: "0x789",
      amount: 1_000_000n,
      poolKey: "SUI_DBUSDC",
      limitPrice: 100n,
      walrusBlobId: "real-walrus-blob",
    });

    const serialized = await tx.toJSON();
    const data = JSON.parse(serialized);
    expect(data.commands[0].MoveCall.package).toBe("0x0000000000000000000000000000000000000000000000000000000000000123");
    expect(data.commands[0].MoveCall.module).toBe("vault");
    expect(data.commands[0].MoveCall.function).toBe("spend_for_deepbook_order");
    expect(data.inputs).toHaveLength(7);
  });
});
