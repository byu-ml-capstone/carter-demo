#!/usr/bin/env bash
# smoke-test.sh — hit every important endpoint and report what came back.
#
# Two modes:
#
#   Local (no argument):
#     ./smoke-test.sh
#     -> builds + starts the stack (frontend + backend), waits for /health on
#        localhost:8000, curls the endpoints, leaves containers running.
#
#   Remote (argument = base URL):
#     ./smoke-test.sh http://<your-app>-staging.ml-capstone.cs.byu.edu
#     -> curls the public staging/prod URL. The frontend nginx proxy forwards
#        /health and the API routes to the backend on the same host.

set -euo pipefail
cd "$(dirname "$0")"

if [ $# -eq 0 ]; then
    MODE=local
    BASE_URL="http://localhost:8000"
else
    MODE=remote
    BASE_URL="${1%/}"
fi

if [ "$MODE" = "local" ]; then
    export SERVICE_FQDN_BACKEND="$BASE_URL"
    export SERVICE_FQDN_FRONTEND="http://localhost:43123"

    echo "=== local mode: building + starting stack (docker compose) ==="
    docker compose down --remove-orphans >/dev/null 2>&1 || true
    docker compose up -d --build
else
    echo "=== remote mode: smoke-testing $BASE_URL ==="
fi

echo -n "waiting for /health "
ready=0
for _ in $(seq 1 60); do
    if curl -sS "$BASE_URL/health" 2>/dev/null | python3 -c 'import json,sys; json.load(sys.stdin)["ok"]' >/dev/null 2>&1; then
        ready=1
        echo " ready"
        break
    fi
    echo -n "."
    sleep 1
done
if [ "$ready" -eq 0 ]; then
    echo
    echo "ERROR: /health never returned {\"ok\":true} at $BASE_URL/health"
    echo "If this is a deployed URL, confirm the domain is on the frontend service and redeploy."
    exit 1
fi

echo
echo "=== GET /health ==="
curl -sS "$BASE_URL/health"
echo
echo "=== GET /version ==="
curl -sS "$BASE_URL/version"
echo
echo "=== POST /auth/register ==="
SMOKE_EMAIL="smoke-$(date +%s)@example.com"
extract_token() {
    python3 -c 'import json,sys; print(json.load(sys.stdin)["token"])'
}
AUTH_JSON=$(curl -sS -X POST "$BASE_URL/auth/register" \
    -H 'Content-Type: application/json' \
    -d "{\"email\":\"$SMOKE_EMAIL\",\"password\":\"password1\"}")
if ! TOKEN=$(printf '%s' "$AUTH_JSON" | extract_token 2>/dev/null); then
    echo "$AUTH_JSON"
    echo "Register did not return a token; trying login as smoke@example.com..."
    AUTH_JSON=$(curl -sS -X POST "$BASE_URL/auth/login" \
        -H 'Content-Type: application/json' \
        -d '{"email":"smoke@example.com","password":"password1"}')
    TOKEN=$(printf '%s' "$AUTH_JSON" | extract_token)
fi
echo "token received"
echo "=== POST /projects ==="
curl -sS -X POST "$BASE_URL/projects" \
    -H "Authorization: Bearer $TOKEN" \
    -H 'Content-Type: application/json' \
    -d "{\"name\":\"Smoke project $SMOKE_EMAIL\"}"
echo
echo

if [ "$MODE" = "local" ]; then
    echo "API direct: http://localhost:8000"
    echo "UI (with API proxy): http://localhost:43123"
    echo "SQLite data is on the workspace-data volume and survives docker compose down."
    echo "docker compose down -v deletes that volume."
    echo "Stop everything with: docker compose down"
else
    echo "Remote smoke test complete: $BASE_URL"
fi
