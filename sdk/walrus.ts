export interface WalrusAuditClientOptions {
  publisherUrl?: string;
  aggregatorUrl?: string;
  epochs?: number;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export interface WalrusStoreResult {
  ok: boolean;
  blobId: string;
  blobObjectId?: string;
  source: "walrus" | "fallback";
  error?: string;
}

export const WALRUS_TESTNET_PUBLISHER = "https://publisher.walrus-testnet.walrus.space";
export const WALRUS_TESTNET_AGGREGATOR = "https://aggregator.walrus-testnet.walrus.space";

export class WalrusAuditClient {
  private publisherUrl: string;
  private aggregatorUrl: string;
  private epochs: number;
  private timeoutMs: number;
  private fetchImpl: typeof fetch;

  constructor(options: WalrusAuditClientOptions = {}) {
    this.publisherUrl = options.publisherUrl || WALRUS_TESTNET_PUBLISHER;
    this.aggregatorUrl = options.aggregatorUrl || WALRUS_TESTNET_AGGREGATOR;
    this.epochs = options.epochs ?? 5;
    this.timeoutMs = options.timeoutMs ?? 4_000;
    this.fetchImpl = options.fetchImpl || fetch;
  }

  async storeJson(payload: unknown): Promise<WalrusStoreResult> {
    const body = JSON.stringify(payload, bigintReplacer);
    const fallbackId = `local-walrus-proof-${await deterministicHash(body)}`;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const res = await this.fetchImpl(`${this.publisherUrl}/v1/blobs?epochs=${this.epochs}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body,
          signal: controller.signal,
        });

        if (!res.ok) {
          return {
            ok: false,
            blobId: fallbackId,
            source: "fallback",
            error: `Walrus publisher returned ${res.status}: ${await safeText(res)}`,
          };
        }

        const data = await res.json();
        const normalized = normalizeWalrusStoreResponse(data);
        if (!normalized.blobId) {
          return {
            ok: false,
            blobId: fallbackId,
            source: "fallback",
            error: "Walrus publisher response did not include a blob ID",
          };
        }

        return {
          ok: true,
          blobId: normalized.blobId,
          blobObjectId: normalized.blobObjectId,
          source: "walrus",
        };
      } finally {
        clearTimeout(timeout);
      }
    } catch (error) {
      return {
        ok: false,
        blobId: fallbackId,
        source: "fallback",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async readJson<T = unknown>(blobId: string): Promise<T> {
    const res = await this.fetchImpl(`${this.aggregatorUrl}/v1/blobs/${encodeURIComponent(blobId)}`);
    if (!res.ok) {
      throw new Error(`Walrus aggregator returned ${res.status}: ${await safeText(res)}`);
    }
    return (await res.json()) as T;
  }

  blobUrl(blobId: string): string {
    return `${this.aggregatorUrl}/v1/blobs/${encodeURIComponent(blobId)}`;
  }
}

function normalizeWalrusStoreResponse(data: any): { blobId?: string; blobObjectId?: string } {
  if (data?.newlyCreated?.blobObject?.blobId) {
    return {
      blobId: data.newlyCreated.blobObject.blobId,
      blobObjectId: data.newlyCreated.blobObject.id,
    };
  }
  if (data?.alreadyCertified?.blobId) {
    return {
      blobId: data.alreadyCertified.blobId,
      blobObjectId: data.alreadyCertified.event?.blobObjectId,
    };
  }
  if (data?.blobId) {
    return { blobId: data.blobId, blobObjectId: data.blobObjectId };
  }
  return {};
}

async function deterministicHash(input: string): Promise<string> {
  if (globalThis.crypto?.subtle) {
    const bytes = new TextEncoder().encode(input);
    const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 24);
  }

  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = Math.imul(31, hash) + input.charCodeAt(i) | 0;
  }
  return Math.abs(hash).toString(16).padStart(8, "0");
}

/**
 * JSON.stringify replacer that serializes BigInt values as their decimal
 * string form (matching Sui Move's on-chain integer encoding convention).
 */
function bigintReplacer(_key: string, value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  return value;
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "<unreadable response body>";
  }
}
