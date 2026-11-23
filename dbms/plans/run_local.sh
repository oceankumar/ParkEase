#!/bin/sh
# Creates and removes an isolated PostgreSQL cluster; never uses the app database.
set -eu
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
PG_BIN=${PG_BIN:-$(pg_config --bindir)}
PGROOT=$(mktemp -d "${TMPDIR:-/tmp}/parkease-cp4.XXXXXX")
cleanup() {
  "$PG_BIN/pg_ctl" -D "$PGROOT/data" -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$PGROOT"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
"$PG_BIN/initdb" -D "$PGROOT/data" -A trust --no-locale -E UTF8 > "$PGROOT/init.log"
"$PG_BIN/pg_ctl" -D "$PGROOT/data" -l "$PGROOT/server.log" \
  -o "-k $PGROOT -p 55439 -h ''" -w start || { cat "$PGROOT/server.log"; exit 1; }
"$PG_BIN/createdb" -h "$PGROOT" -p 55439 parkease_cp4
PATH="$PG_BIN:$PATH" python3 "$SCRIPT_DIR/benchmark.py" \
  --dsn "host=$PGROOT port=55439 dbname=parkease_cp4"
