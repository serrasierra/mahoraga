#!/usr/bin/env bash
# Call the local Worker agent API using MAHORAGA_API_TOKEN from .dev.vars
# Usage: ./scripts/local-agent.sh [status|enable|disable|trigger|logs]
# Override base URL: MAHORAGA_BASE_URL=http://127.0.0.1:8787 ./scripts/local-agent.sh status

set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VARS="$ROOT/.dev.vars"

if [[ ! -f "$VARS" ]]; then
	echo "Missing $VARS — copy .env.example to .dev.vars and fill in keys." >&2
	exit 1
fi

get_var() {
	local k="$1"
	grep "^${k}=" "$VARS" | head -1 | sed "s/^${k}=//"
}

TOKEN="${MAHORAGA_API_TOKEN:-$(get_var MAHORAGA_API_TOKEN)}"
BASE="${MAHORAGA_BASE_URL:-http://localhost:8787}"
AUTH=(-H "Authorization: Bearer ${TOKEN}")

out() {
	if command -v jq >/dev/null 2>&1; then
		jq .
	else
		cat
	fi
}

cmd="${1:-status}"
case "$cmd" in
	status) curl -sS "${AUTH[@]}" "$BASE/agent/status" | out ;;
	enable) curl -sS -X POST "${AUTH[@]}" "$BASE/agent/enable" | out ;;
	disable) curl -sS -X POST "${AUTH[@]}" "$BASE/agent/disable" | out ;;
	trigger) curl -sS -X POST "${AUTH[@]}" "$BASE/agent/trigger" | out ;;
	logs) curl -sS "${AUTH[@]}" "$BASE/agent/logs" | out ;;
	*)
		echo "Usage: $0 {status|enable|disable|trigger|logs}" >&2
		echo "Requires: npx wrangler dev running (default $BASE)" >&2
		exit 1
		;;
esac
