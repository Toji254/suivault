/**
 * Persistent state for the autonomous SuiVault agent.
 *
 * The daemon writes one of these files per cycle. The dashboard's
 * /api/active-agent route reads the same file to render live state in
 * AgentMonitor. This keeps the daemon and the dashboard in sync without
 * needing a shared database.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export type AgentEventType =
  | "opportunity"
  | "approved"
  | "blocked"
  | "executed"
  | "error"
  | "info";

export interface AgentEvent {
  id: string;
  timestamp: string; // ISO
  type: AgentEventType;
  title: string;
  description: string;
  data?: Record<string, unknown>;
}

export interface AgentStats {
  opportunitiesFound: number;
  decisionsApproved: number;
  decisionsBlocked: number;
  transactionsExecuted: number;
  isActive: boolean;
  startedAt: string; // ISO
  lastScanAt?: string; // ISO
  lastError?: string;
  agentAddress: string;
  vaultId: string;
  approvalThreshold: number;
  dryRun: boolean;
  walrusEnabled: boolean;
}

export interface AgentState {
  stats: AgentStats;
  recentEvents: AgentEvent[];
}

export const DEFAULT_STATE_PATH = resolve(
  process.cwd(),
  "data",
  "agent-state.json",
);

export function defaultAgentState(args: {
  agentAddress: string;
  vaultId: string;
  approvalThreshold: number;
  dryRun: boolean;
  walrusEnabled: boolean;
}): AgentState {
  return {
    stats: {
      opportunitiesFound: 0,
      decisionsApproved: 0,
      decisionsBlocked: 0,
      transactionsExecuted: 0,
      isActive: true,
      startedAt: new Date().toISOString(),
      agentAddress: args.agentAddress,
      vaultId: args.vaultId,
      approvalThreshold: args.approvalThreshold,
      dryRun: args.dryRun,
      walrusEnabled: args.walrusEnabled,
    },
    recentEvents: [],
  };
}

export function loadAgentState(path: string = DEFAULT_STATE_PATH): AgentState {
  if (!existsSync(path)) {
    return defaultAgentState({
      agentAddress: "",
      vaultId: "",
      approvalThreshold: 70,
      dryRun: true,
      walrusEnabled: false,
    });
  }
  try {
    const raw = readFileSync(path, "utf8");
    const parsed = JSON.parse(raw) as AgentState;
    if (!parsed.stats || !Array.isArray(parsed.recentEvents)) {
      throw new Error("malformed state file");
    }
    return parsed;
  } catch (err) {
    // Corrupt file – start fresh rather than crashing the daemon.
    // eslint-disable-next-line no-console
    console.warn(`[agent-state] could not parse ${path}: ${(err as Error).message}. Resetting.`);
    return defaultAgentState({
      agentAddress: "",
      vaultId: "",
      approvalThreshold: 70,
      dryRun: true,
      walrusEnabled: false,
    });
  }
}

export function saveAgentState(state: AgentState, path: string = DEFAULT_STATE_PATH): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(state, null, 2), "utf8");
}

export function appendEvent(
  state: AgentState,
  event: Omit<AgentEvent, "id" | "timestamp"> & Partial<Pick<AgentEvent, "id" | "timestamp">>,
): AgentEvent {
  const full: AgentEvent = {
    id: event.id ?? `evt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: event.timestamp ?? new Date().toISOString(),
    type: event.type,
    title: event.title,
    description: event.description,
    data: event.data,
  };
  state.recentEvents.unshift(full);
  state.recentEvents = state.recentEvents.slice(0, 30);
  return full;
}

/** Convenience: a stable path under the supplied working dir, e.g. /repo/data/agent-state.json */
export function resolveStatePath(workdir: string, filename = "agent-state.json"): string {
  return join(resolve(workdir), "data", filename);
}
