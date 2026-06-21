/**
 * GET /api/active-agent
 *
 * Reads the shared agent state files written by `demo/active-agent.ts` and
 * serves them to the dashboard. If no agent is running (files missing or
 * older than 90s), falls back to a minimal demo feed so the UI never looks
 * dead during a hackathon demo.
 *
 * Files:
 *   ./.agent-status.json  — counters + meta (startedAt, mode, vaultId, etc.)
 *   ./.agent-events.json  — recent event log (max 50 entries)
 *
 * Override paths with AGENT_STATUS_PATH / AGENT_EVENTS_PATH env vars.
 */

import { NextResponse } from "next/server";
import { readFile, access } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// The daemon writes event/status JSON into the repo's demo/ folder.
// Resolve from the location of this file so we don't depend on Next's cwd.
// File path: dashboard/app/api/active-agent/route.ts
// To reach repo root: go up 4 levels (active-agent/ → api/ → app/ → dashboard/).
const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..", "..", "..", "..");
const DEFAULT_STATUS = resolve(REPO_ROOT, "demo", ".agent-status.json");
const DEFAULT_EVENTS = resolve(REPO_ROOT, "demo", ".agent-events.json");

const STATUS_PATH = process.env.AGENT_STATUS_PATH || DEFAULT_STATUS;
const EVENTS_PATH = process.env.AGENT_EVENTS_PATH || DEFAULT_EVENTS;
const STALE_AFTER_MS = 90_000;

const DEFAULT_STATS = {
  opportunitiesFound: 0,
  decisionsApproved: 0,
  decisionsBlocked: 0,
  transactionsExecuted: 0,
  transactionsSimulated: 0,
  errors: 0,
  startedAt: null,
  lastScanAt: null,
  isActive: false,
  mode: "dry-run",
  vaultId: null,
  agentAddress: null,
};

async function readJsonSafe(path: string) {
  try {
    await access(path);
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return null;
  }
}

export async function GET() {
  const now = Date.now();
  const [statusRaw, eventsRaw] = await Promise.all([
    readJsonSafe(STATUS_PATH),
    readJsonSafe(EVENTS_PATH),
  ]);

  const stats = statusRaw ? { ...DEFAULT_STATS, ...statusRaw } : { ...DEFAULT_STATS };

  let events = Array.isArray(eventsRaw) ? eventsRaw.slice(-20).reverse() : [];

  // Consider the agent "alive" only if its status file was updated recently.
  const lastScanAt = stats.lastScanAt ? Date.parse(stats.lastScanAt) : null;
  const isFresh = lastScanAt !== null && now - lastScanAt < STALE_AFTER_MS;
  stats.isActive = isFresh;

  // If the daemon has never run, surface a friendly demo message so the
  // UI doesn't look empty.
  if (events.length === 0 && !stats.startedAt) {
    events = [
      {
        id: "demo-placeholder-1",
        timestamp: new Date(now - 60_000).toISOString(),
        type: "opportunity",
        title: "Agent daemon not running",
        description: "Start it with: cd demo && VAULT_ID=… KEY_ID=… npx tsx active-agent.ts",
        data: null,
      },
    ];
  }

  return NextResponse.json({ stats, recentEvents: events });
}