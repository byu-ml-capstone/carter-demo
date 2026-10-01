#!/usr/bin/env bash
# smoke-test.sh — hit every important endpoint and report what came back.
#
# Two modes:
#
#   Local (no argument):
#     ./smoke-test.sh
#     -> builds + starts the API (hello) with its SQLite volume,
#        waits for /health on localhost:8000, curls the endpoints,
#        leaves everything running so you can keep poking at it.
#
#   Remote (argument = base URL):
#     ./smoke-test.sh http://<your-app>.ml-capstone.cs.byu.edu
#     -> skips docker compose entirely; curls the endpoints against
#        the given URL. Useful for smoke-testing a Coolify deploy
#        (staging or prod) from your laptop after a push.
#
# Both modes hit /health, /version, register, and create a project.
# Workspace routes need the bearer token from register. Data lives in
# the SQLite file on the workspace-data volume.

set -euo pipefail
cd "$(dirname "$0")"

if [ $# -eq 0 ]; then
    MODE=local
    BASE_URL="http://localhost:8000"
else
    MODE=remote
    # Strip a trailing slash so /health etc. don't become //health.
    BASE_URL="${1%/}"
fi

if [ "$MODE" = "local" ]; then
    # Stub SERVICE_FQDN_HELLO for the compose interpolation in
    # docker-compose.yaml. In production Coolify populates this.
    export SERVICE_FQDN_HELLO="$BASE_URL"

    echo "=== local mode: building + starting hello (docker compose) ==="
    docker compose down --remove-orphans >/dev/null 2>&1 || true
    docker compose up -d --build
else
    echo "=== remote mode: smoke-testing $BASE_URL ==="
fi

# Wait for /health. In local mode the compose build + startup takes a beat;
# in remote mode this catches "did the deploy actually finish yet".
echo -n "waiting for /health "
for _ in $(seq 1 60); do
    if curl -sSf "$BASE_URL/health" >/dev/null 2>&1; then
        echo " ready"
        break
    fi
    echo -n "."
    sleep 1
done

echo
echo "=== GET /health ==="
curl -sS "$BASE_URL/health"
echo
echo "=== GET /version ==="
curl -sS "$BASE_URL/version"
echo
echo "=== POST /auth/register ==="
TOKEN=$(curl -sS -X POST "$BASE_URL/auth/register" \
    -H 'Content-Type: application/json' \
    -d '{"email":"smoke@example.com","password":"password1"}' \
    | python3 -c 'import json,sys; print(json.load(sys.stdin)["token"])')
echo "token received"
echo "=== POST /projects ==="
curl -sS -X POST "$BASE_URL/projects" \
    -H "Authorization: Bearer $TOKEN" \
    -H 'Content-Type: application/json' \
    -d '{"name":"Smoke project"}'
echo
echo

if [ "$MODE" = "local" ]; then
    echo "hello is running at http://localhost:8000"
    echo "SQLite data is on the workspace-data volume and survives docker compose down."
    echo "docker compose down -v deletes that volume."
    echo "Stop everything with: docker compose down"
else
    echo "Remote smoke test complete: $BASE_URL"
fi
