#!/bin/bash
#
# Agent Launcher - Starts the autonomous SuiVault agent daemon
#
# Usage:
#   ./start-agent.sh [--vault-id VAULT_ID] [--key-id KEY_ID] [--interval MS]
#

set -e

# Parse command-line arguments
VAULT_ID="${VAULT_ID:-}"
KEY_ID="${KEY_ID:-}"
SCAN_INTERVAL="${SCAN_INTERVAL:-30000}"

while [[ $# -gt 0 ]]; do
  case $1 in
    --vault-id)
      VAULT_ID="$2"
      shift 2
      ;;
    --key-id)
      KEY_ID="$2"
      shift 2
      ;;
    --interval)
      SCAN_INTERVAL="$2"
      shift 2
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

# Validate required environment variables
if [ -z "$VAULT_ID" ]; then
  echo "❌ Error: VAULT_ID not set. Usage: VAULT_ID=<id> KEY_ID=<id> ./start-agent.sh"
  exit 1
fi

if [ -z "$KEY_ID" ]; then
  echo "❌ Error: KEY_ID not set. Usage: VAULT_ID=<id> KEY_ID=<id> ./start-agent.sh"
  exit 1
fi

echo "🤖 Starting SuiVault Autonomous Agent"
echo "   Vault ID:      $VAULT_ID"
echo "   Key ID:        $KEY_ID"
echo "   Scan Interval: ${SCAN_INTERVAL}ms"
echo ""

# Set environment variables and run the agent
export VAULT_ID
export KEY_ID
export SCAN_INTERVAL_MS="$SCAN_INTERVAL"
export AGENT_ADDRESS="${AGENT_ADDRESS:-}"
export APPROVAL_THRESHOLD="${APPROVAL_THRESHOLD:-70}"

# Run the daemon
cd "$(dirname "$0")"
npx tsx active-agent.ts
