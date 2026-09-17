#!/usr/bin/env bash
# Disposable synthetic demo only. Never migrate, copy, or connect to Neon here.
set -Eeuo pipefail
[[ "${VIGIA_DEMO_CONFIRM:-}" == SYNTHETIC_DEMO_ONLY ]] || { echo 'Synthetic demo confirmation is required.' >&2; exit 64; }
[[ "${VIGIA_DEMO_DATABASE_MODE:-}" == ephemeral_local_postgis ]] || { echo 'Explicit ephemeral_local_postgis mode is required.' >&2; exit 64; }
for key in VIGIA_DATABASE_URL VIGIA_DATABASE_URL_FILE DATABASE_URL; do
  [[ -z "${!key:-}" ]] || { echo "Refusing external/ambient database configuration: $key" >&2; exit 64; }
done
[[ "$(id -un)" == node ]] || { echo 'Run only as the unprivileged container user node.' >&2; exit 64; }
[[ "${PORT:-}" =~ ^[0-9]+$ && "$PORT" -ge 1024 && "$PORT" -le 65535 && "$PORT" != 55432 && "$PORT" != 4178 ]] || { echo 'A valid, non-conflicting public PORT is required.' >&2; exit 64; }
[[ "${VIGIA_OPERATOR_PUBLIC_AUTHORITY:-}" =~ ^[A-Za-z0-9.-]+(:[0-9]{2,5})?$ ]] || { echo 'An explicit public authority is required.' >&2; exit 64; }
# Inherited libpq service/options files must not redirect even bootstrap SQL.
unset PGHOST PGPORT PGUSER PGPASSWORD PGDATABASE PGSERVICE PGSERVICEFILE PGPASSFILE PGOPTIONS PGSSLMODE
export PATH="/usr/lib/postgresql/15/bin:$PATH"
export VIGIA_LOCAL_SECRETS_DISABLED=1 VIGIA_KEYCHAIN_DISABLED=1 VIGIA_AUTOMATIC_EVIDENCE_REQUESTS=0
export NODE_ENV=production NODE_OPTIONS=--max-old-space-size=224
# A Docker restart can retain the writable layer. Do not combine a new
# PostgreSQL cluster with stale JSON runtime caches from the preceding boot.
if [[ -L data/runtime ]]; then
  previous="$(readlink data/runtime)"
  [[ "$previous" =~ ^/tmp/vigia-isolated-demo\.[A-Za-z0-9]{8}/state$ && -f "${previous%/state}/.demo-owned" ]] || { echo 'Refusing an unrecognized runtime state link.' >&2; exit 64; }
  rm -- data/runtime
  rm -rf -- "${previous%/state}"
elif [[ -e data/runtime ]]; then
  echo 'Refusing to overwrite an existing non-demo runtime directory.' >&2; exit 64
fi
runtime="$(mktemp -d /tmp/vigia-isolated-demo.XXXXXXXX)"
touch "$runtime/.demo-owned"
mkdir -m 700 "$runtime/state"
mkdir -p data
ln -s "$runtime/state" data/runtime
pg_pid='' app_pid='' monitor_pid=''
cleanup() {
  local status=$?
  trap - EXIT TERM INT
  if [[ -n "$monitor_pid" ]]; then kill -TERM "$monitor_pid" 2>/dev/null || true; fi
  # The application is its own process group; terminate seed/API/gateway too,
  # including children left behind if their immediate parent already exited.
  if [[ -n "$app_pid" ]]; then
    kill -TERM -- "-$app_pid" 2>/dev/null || true
    for _ in {1..20}; do kill -0 -- "-$app_pid" 2>/dev/null || break; sleep 0.2; done
    kill -KILL -- "-$app_pid" 2>/dev/null || true
    wait "$app_pid" 2>/dev/null || true
  fi
  if [[ -n "$pg_pid" ]]; then
    kill -INT "$pg_pid" 2>/dev/null || true
    for _ in {1..20}; do kill -0 "$pg_pid" 2>/dev/null || break; sleep 0.2; done
    kill -KILL "$pg_pid" 2>/dev/null || true
    wait "$pg_pid" 2>/dev/null || true
  fi
  # Only remove the private directory created by this invocation, never a
  # supplied state path or an existing production cluster.
  if [[ -L data/runtime && "$(readlink data/runtime)" == "$runtime/state" ]]; then rm -- data/runtime; fi
  rm -rf -- "$runtime"
  exit "$status"
}
trap cleanup EXIT
trap 'exit 143' TERM
trap 'exit 130' INT
mkdir -m 700 "$runtime/socket"
initdb -D "$runtime/db" -U node --auth-local=peer --auth-host=scram-sha-256 --encoding=UTF8 --locale=C >/dev/null
cat >> "$runtime/db/postgresql.conf" <<CONFIG
listen_addresses = '127.0.0.1'
port = 55432
unix_socket_directories = '$runtime/socket'
shared_buffers = '16MB'
work_mem = '1MB'
maintenance_work_mem = '16MB'
effective_cache_size = '32MB'
max_connections = 16
max_parallel_workers = 0
max_worker_processes = 0
jit = off
max_wal_size = '64MB'
min_wal_size = '32MB'
log_statement = 'none'
CONFIG
postgres -D "$runtime/db" >&2 & pg_pid=$!
ready=0
for _ in {1..150}; do
  kill -0 "$pg_pid" 2>/dev/null || { echo 'Local PostGIS process exited during startup.' >&2; exit 1; }
  if pg_isready -h "$runtime/socket" -p 55432 -U node -d postgres >/dev/null 2>&1; then ready=1; break; fi
  sleep 0.2
done
[[ "$ready" == 1 ]] || { echo 'Local PostGIS startup timeout.' >&2; exit 1; }
password="$(node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('hex'))")"
# Generated hexadecimal password is passed on stdin, never as a CLI argument.
psql -X -v ON_ERROR_STOP=1 -h "$runtime/socket" -p 55432 -U node -d postgres >/dev/null <<SQL
CREATE ROLE vigia_demo LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD '$password';
CREATE DATABASE vigia_demo OWNER vigia_demo;
\connect vigia_demo
CREATE EXTENSION IF NOT EXISTS postgis;
SQL
export VIGIA_DATABASE_URL="postgresql://vigia_demo:$password@127.0.0.1:55432/vigia_demo"
unset password
if [[ "${VIGIA_DEMO_QUEUE_TEST_ONLY:-}" == 1 ]]; then
  psql -X -v ON_ERROR_STOP=1 -h "$runtime/socket" -p 55432 -U node -d postgres -c 'CREATE DATABASE vigia_queue_test OWNER vigia_demo' >/dev/null
  export VIGIA_TEST_DATABASE_URL="${VIGIA_DATABASE_URL%/vigia_demo}/vigia_queue_test"
  node --test infra/integration/situation-job-postgres.mjs
  exit 0
fi
# The existing start path applies real migrations and the governed, deterministic
# SHADOW import. It also keeps recurring operational workers disabled.
setsid node infra/render-demo-start.mjs & app_pid=$!
(
  startup_deadline=$((SECONDS+300))
  while ! node infra/demo/local-healthcheck.mjs >/dev/null 2>&1; do
    kill -0 "$app_pid" 2>/dev/null && kill -0 "$pg_pid" 2>/dev/null || exit 1
    (( SECONDS < startup_deadline )) || { echo 'Demo dependency readiness did not pass within startup deadline.' >&2; exit 1; }
    sleep 2
  done
  echo '{"component":"demo_local_postgis","state":"ready","externalDatabaseConnections":0,"persistentUserData":false}'
  while kill -0 "$app_pid" 2>/dev/null && kill -0 "$pg_pid" 2>/dev/null; do sleep 2; done
  exit 1
) & monitor_pid=$!
# A crash of the database monitor or the app is fatal; do not leave a healthy-
# looking frontend process serving a dead database.
set +e
wait -n "$app_pid" "$monitor_pid"
result=$?
set -e
[[ "$result" -ne 0 ]] || result=1
exit "$result"
