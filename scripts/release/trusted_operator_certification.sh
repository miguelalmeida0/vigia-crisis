#!/bin/sh
set -eu
PATH=/usr/bin:/bin:/usr/sbin:/sbin
export PATH

script_dir=$(CDPATH= cd -- "$(/usr/bin/dirname -- "$0")" && pwd -P)
project_root=$(CDPATH= cd -- "$script_dir/../.." && pwd -P)
trusted_node=/opt/homebrew/Cellar/node/26.0.0/bin/node
trusted_node_runtime_lock="$script_dir/browser-certification-node-runtime-lock.txt"

if [ ! -x "$trusted_node" ]; then
  echo "trusted_operator_certification_node_unavailable" >&2
  exit 78
fi
if ! /usr/bin/shasum -a 256 -c "$trusted_node_runtime_lock" >/dev/null; then
  echo "trusted_operator_certification_node_lock_mismatch" >&2
  exit 78
fi

entry="$project_root/scripts/release/run_operator_certification.mjs"
if [ "${1-}" = "--probe" ]; then
  entry="$project_root/scripts/release/trusted_node_probe.mjs"
elif [ "${1-}" = "--local" ]; then
  entry="$project_root/scripts/release/local_release.mjs"
elif [ "$#" -ne 0 ]; then
  echo "trusted_operator_certification_usage" >&2
  exit 64
fi

exec /usr/bin/env -i \
  PATH=/usr/bin:/bin:/usr/sbin:/sbin \
  HOME="${HOME-}" \
  USER="${USER-}" \
  LOGNAME="${LOGNAME-}" \
  LANG="${LANG-C.UTF-8}" \
  LC_ALL="${LC_ALL-}" \
  LC_CTYPE="${LC_CTYPE-}" \
  TZ="${TZ-UTC}" \
  TMPDIR="$project_root/.tmp" \
  VIGIA_TRUSTED_NODE_LAUNCH=1 \
  VIGIA_BASE_URL="${VIGIA_BASE_URL-}" \
  FIELDNET_BASE_URL="${FIELDNET_BASE_URL-}" \
  VIGIA_OPERATOR_URL="${VIGIA_OPERATOR_URL-}" \
  VIGIA_OPERATOR_ACCESS_TOKEN="${VIGIA_OPERATOR_ACCESS_TOKEN-}" \
  VIGIA_OPERATOR_ACCESS_TOKEN_FILE="${VIGIA_OPERATOR_ACCESS_TOKEN_FILE-}" \
  VIGIA_BACKEND_ONLY="${VIGIA_BACKEND_ONLY-}" \
  VIGIA_LOCAL_RUNTIME_ROOT="${VIGIA_LOCAL_RUNTIME_ROOT-}" \
  VIGIA_RELEASE_API_PORT="${VIGIA_RELEASE_API_PORT:-4177}" \
  VIGIA_RELEASE_FIELD_PORT="${VIGIA_RELEASE_FIELD_PORT:-4188}" \
  VIGIA_DATABASE_URL="${VIGIA_DATABASE_URL-}" \
  VIGIA_DATABASE_URL_FILE="${VIGIA_DATABASE_URL_FILE-}" \
  VIGIA_SECRETS_FILE="${VIGIA_SECRETS_FILE-}" \
  VIGIA_LOCAL_SECRETS_DISABLED="${VIGIA_LOCAL_SECRETS_DISABLED-}" \
  VIGIA_KEYCHAIN_DISABLED="${VIGIA_KEYCHAIN_DISABLED-}" \
  "$trusted_node" "$entry"
