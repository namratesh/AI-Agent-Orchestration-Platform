#!/usr/bin/env bash
# End-to-end demo: list seeded agents/workflows, execute "Research & Write", poll until done.
# Usage: bash demo.sh [BASE_URL]
#   BASE_URL defaults to http://localhost:8000

set -euo pipefail

BASE="${1:-http://localhost:8000}"
TASK="${TASK:-"What are the latest developments in large language models in 2024?"}"

sep() { printf '\n%s\n' "────────────────────────────────────────────────────────"; }

sep
echo "AI Agent Orchestration Platform — End-to-End Demo"
echo "BASE: $BASE"

# ── 1. Health check ───────────────────────────────────────────────────────────
sep
echo "1. Health check"
curl -sf "$BASE/health" | python3 -m json.tool || { echo "Backend not reachable at $BASE"; exit 1; }

# ── 2. List agents ────────────────────────────────────────────────────────────
sep
echo "2. Seeded agents"
curl -sf "$BASE/agents" | python3 -m json.tool

# ── 3. List workflows ─────────────────────────────────────────────────────────
sep
echo "3. Seeded workflows"
WORKFLOWS=$(curl -sf "$BASE/workflows")
echo "$WORKFLOWS" | python3 -m json.tool

# Find "Research & Write" workflow ID
WORKFLOW_ID=$(echo "$WORKFLOWS" | python3 -c "
import sys, json
wfs = json.load(sys.stdin)
match = next((w for w in wfs if 'Research' in w['name']), None)
if not match:
    print('NO_WORKFLOW')
else:
    print(match['id'])
")

if [ "$WORKFLOW_ID" = "NO_WORKFLOW" ]; then
  echo "ERROR: 'Research & Write' workflow not found. Run docker compose up --build on a fresh volume."
  exit 1
fi

# ── 4. Execute the workflow ───────────────────────────────────────────────────
sep
echo "4. Executing workflow $WORKFLOW_ID"
echo "   Task: $TASK"

EXEC=$(curl -sf -X POST "$BASE/workflows/$WORKFLOW_ID/execute" \
  -H "Content-Type: application/json" \
  -d "{\"task\": \"$TASK\"}")
echo "$EXEC" | python3 -m json.tool

EXEC_ID=$(echo "$EXEC" | python3 -c "import sys, json; print(json.load(sys.stdin)['execution_id'])")
echo "   Execution ID: $EXEC_ID"

# ── 5. Poll until done ────────────────────────────────────────────────────────
sep
echo "5. Polling execution status (up to 5 min)…"

TIMEOUT=300
ELAPSED=0
STATUS="queued"

while [ "$ELAPSED" -lt "$TIMEOUT" ]; do
  RESULT=$(curl -sf "$BASE/executions/$EXEC_ID" 2>/dev/null || echo '{"status":"queued"}')
  STATUS=$(echo "$RESULT" | python3 -c "import sys, json; print(json.load(sys.stdin).get('status','queued'))")
  echo "   [$ELAPSED s] status: $STATUS"
  if [ "$STATUS" = "success" ] || [ "$STATUS" = "error" ]; then
    break
  fi
  sleep 5
  ELAPSED=$((ELAPSED + 5))
done

# ── 6. Print result ───────────────────────────────────────────────────────────
sep
echo "6. Final result (status: $STATUS)"
echo "$RESULT" | python3 -m json.tool

if [ "$STATUS" = "success" ]; then
  sep
  echo "Demo complete. The workflow executed successfully."
  echo ""
  echo "Open http://localhost:3000 to explore the UI:"
  echo "  /workflows       — run workflows"
  echo "  /history         — inspect node-by-node execution trace"
  echo "  /workspace       — visual workflow builder"
  echo "  /agents          — manage agents"
else
  echo ""
  echo "Workflow did not succeed (status: $STATUS)."
  echo "Check the logs: docker compose logs worker"
fi
