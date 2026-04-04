#!/usr/bin/env bash
# Exit 0 if .dev.vars has non-placeholder Alpaca + OpenAI keys; else print what to fix.

set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VARS="$ROOT/.dev.vars"

if [[ ! -f "$VARS" ]]; then
	echo "Missing .dev.vars — run: cp .env.example .dev.vars"
	exit 1
fi

get_var() {
	local k="$1"
	grep "^${k}=" "$VARS" | head -1 | sed "s/^${k}=//"
}

ok=1
AK="$(get_var ALPACA_API_KEY)"
AS="$(get_var ALPACA_API_SECRET)"
OAI="$(get_var OPENAI_API_KEY)"

if [[ "$AK" == *"PLACEHOLDER"* ]] || [[ "$AK" == "PK_TEST_PLACEHOLDER" ]] || [[ ${#AK} -lt 8 ]]; then
	echo "[ ] ALPACA_API_KEY still looks like a placeholder — add paper keys from https://app.alpaca.markets/paper/dashboard/overview"
	ok=0
else
	echo "[x] ALPACA_API_KEY is set"
fi

if [[ "$AS" == *"placeholder"* ]] || [[ ${#AS} -lt 8 ]]; then
	echo "[ ] ALPACA_API_SECRET — set your paper secret"
	ok=0
else
	echo "[x] ALPACA_API_SECRET is set"
fi

if [[ "$OAI" == "sk-test-placeholder" ]] || [[ "$OAI" == *"your_openai"* ]] || [[ ${#OAI} -lt 20 ]]; then
	echo "[ ] OPENAI_API_KEY — add a real key from https://platform.openai.com/api-keys (or switch LLM_PROVIDER in .dev.vars)"
	ok=0
else
	echo "[x] OPENAI_API_KEY looks configured"
fi

if [[ "$ok" -eq 1 ]]; then
	echo ""
	echo "Ready for local testing. Next: terminal A → npm run dev   terminal B → npm run local:status"
	exit 0
fi

echo ""
echo "Edit .dev.vars, then run this script again."
	exit 1
