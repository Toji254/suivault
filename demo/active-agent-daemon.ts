import { spawn } from "child_process";
import chalk from "chalk";

const intervalMs = Number(process.env.DEMO_ACTIVE_AGENT_DAEMON_INTERVAL_MS || "30000");
const maxTicks = Number(process.env.DEMO_ACTIVE_AGENT_DAEMON_MAX_TICKS || "0");
const restartDelayMs = Number(process.env.DEMO_ACTIVE_AGENT_DAEMON_RESTART_DELAY_MS || "5000");

let stopped = false;
let running = false;
let tick = 0;
let timer: NodeJS.Timeout | null = null;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function scheduleNext(delay = intervalMs) {
  if (stopped) return;
  if (maxTicks > 0 && tick >= maxTicks) {
    console.log(chalk.cyan(`Daemon completed ${tick} tick(s).`));
    stopped = true;
    return;
  }
  timer = setTimeout(() => {
    void runTick();
  }, delay);
}

async function runTick() {
  if (stopped || running) return;
  running = true;
  tick += 1;

  const startedAt = new Date();
  console.log(chalk.cyan(`\n[agent-daemon] tick ${tick} started at ${startedAt.toISOString()}`));
  console.log(chalk.gray(`[agent-daemon] mode: ${process.env.DEMO_ACTIVE_AGENT_EXECUTE_SPENDS === "1" ? "REAL TRADE EXECUTION" : "watch-only / no vault principal movement"}`));

  const child = spawn("npx", ["tsx", "active-agent.ts"], {
    stdio: "inherit",
    env: {
      ...process.env,
      DEMO_ACTIVE_AGENT_CYCLES: process.env.DEMO_ACTIVE_AGENT_CYCLES || "1",
      DEMO_ACTIVE_AGENT_BLOCK_LOGS: process.env.DEMO_ACTIVE_AGENT_BLOCK_LOGS || "0",
    },
  });

  const exitCode = await new Promise<number | null>((resolve) => {
    child.on("exit", (code) => resolve(code));
    child.on("error", (err) => {
      console.error(chalk.red(`[agent-daemon] failed to start active agent: ${err.message}`));
      resolve(1);
    });
  });

  running = false;
  const finishedAt = new Date();
  if (exitCode === 0) {
    console.log(chalk.green(`[agent-daemon] tick ${tick} finished at ${finishedAt.toISOString()}`));
    scheduleNext(intervalMs);
  } else {
    console.error(chalk.red(`[agent-daemon] tick ${tick} exited with code ${exitCode}; retrying in ${restartDelayMs}ms`));
    await sleep(restartDelayMs);
    scheduleNext(0);
  }
}

function shutdown(signal: string) {
  stopped = true;
  if (timer) clearTimeout(timer);
  console.log(chalk.yellow(`\n[agent-daemon] received ${signal}; stopping after current tick.`));
  if (!running) process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

console.log(chalk.cyan("SuiVault active-agent daemon"));
console.log(chalk.gray(`interval: ${intervalMs}ms`));
console.log(chalk.gray(`max ticks: ${maxTicks > 0 ? maxTicks : "unlimited"}`));
console.log(chalk.gray("Set DEMO_ACTIVE_AGENT_EXECUTE_SPENDS=1 to allow real vault-funded trades/spends."));
console.log(chalk.gray("Without that flag, the daemon watches/evaluates and updates the live feed without opening trades."));

void runTick();
