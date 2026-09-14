# VIGIA supervised remote-shadow deployment

This profile is a deterministic, loopback-bound supervised pilot deployment. It starts PostGIS, the checksum-governed migration job, API, FieldNet, and the admitted Operator Console from the exact repository release manifest. It is not a claim of live-agency or human-validation readiness.

## 1. Prepare protected inputs

Create these eight owner-readable files outside the repository. Do not place their values in shell history, Compose files, or logs.

| Environment variable | File contents |
| --- | --- |
| `VIGIA_POSTGRES_PASSWORD_FILE` | Postgres password |
| `VIGIA_DATABASE_URL_FILE` | `postgresql://vigia:<password>@postgis:5432/vigia` |
| `VIGIA_PROVIDER_CREDENTIALS_FILE` | Existing VIGIA provider credential environment file; may be an explicit empty file when no provider is configured |
| `VIGIA_OPERATOR_PROXY_KEY_FILE` | Random HMAC key shared only by API and Operator Console; the key itself is never sent over the network |
| `VIGIA_OPERATOR_ACCESS_TOKEN_FILE` | Separate random one-time-admission signing token |
| `VIGIA_FIELDNET_CONTROL_KEY_FILE` | Random FieldNet control key |
| `VIGIA_FIELDNET_NODE_KEY_FILE` | Random key for the declared FieldNode identity |
| `VIGIA_FIELDNET_NODE_REGISTRY_FILE` | JSON object binding that exact node ID and key to an incident allowlist |

Also export:

- `VIGIA_RELEASE_ID` from `data/validation/release/current-release-manifest.json`;
- `VIGIA_FIELDNET_INCIDENT_SCOPE` as the exact governed incident ID;
- optionally `VIGIA_FIELDNET_NODE_ID` (defaults to `field-node:pilot-1`);
- optionally loopback host ports `VIGIA_API_PORT`, `VIGIA_FIELDNET_PORT`, and `VIGIA_SHADOW_PORT` (defaults 4177, 4188, and 4190).

The node-registry file has this bounded form:

```json
{
  "field-node:pilot-1": {
    "key": "<same value as VIGIA_FIELDNET_NODE_KEY_FILE>",
    "incidentIds": ["<same value as VIGIA_FIELDNET_INCIDENT_SCOPE>"],
    "capabilities": ["fieldnet:sync", "fieldnet:command-survival"],
    "status": "active"
  }
}
```

## 2. Validate and deploy

```sh
docker compose -f infra/docker-compose.remote-shadow.yml config --quiet
docker compose -f infra/docker-compose.remote-shadow.yml up -d --build --wait --wait-timeout 300
```

The migration job must finish successfully before API startup. API readiness gates FieldNet; API and FieldNet readiness gate the Operator Console. All published ports remain loopback-only. Each long-running service has bounded resources, rotated local logs, graceful shutdown, and `unless-stopped` restart behavior.

Verify exact identity without printing any secret:

```sh
curl --fail --silent http://127.0.0.1:${VIGIA_API_PORT:-4177}/live
curl --fail --silent http://127.0.0.1:${VIGIA_FIELDNET_PORT:-4188}/api/fieldnet/release
curl --fail --silent http://127.0.0.1:${VIGIA_SHADOW_PORT:-4190}/__operator/ready
```

The admitted Operator Console uses the one-time admission workflow. Generate the signed admission URL on the operator workstation with the protected admission-token file; never paste or log the underlying token. For the canonical local profile, `npm run operator:open` performs this workflow directly.

## 3. Upgrade and forward recovery

Build the new release manifest and images before changing `VIGIA_RELEASE_ID`. Preserve volumes, update the exported release ID, then run:

```sh
docker compose -f infra/docker-compose.remote-shadow.yml up -d --build --wait --wait-timeout 300
```

The API rejects an environment release ID that does not match the immutable manifest in its image. On a failed upgrade, restore the last accepted release ID and image inputs and run the same command. Do not recreate the PostGIS or FieldNet volumes. Require API, FieldNet, and Operator Console release convergence before access is reopened, then regenerate the browser certificate against that exact release.

## 4. Backup and isolated restore

Create a timestamped custom-format backup:

```sh
docker compose -f infra/docker-compose.remote-shadow.yml --profile maintenance run --rm backup
```

Restore is intentionally not automatic. Stop API, FieldNet, and web; take a fresh backup; resolve one explicit dump path from the `vigia-backups` volume; restore it with `pg_restore --clean --if-exists --no-owner` into an isolated PostGIS instance; rerun the migration job; and verify the audit chain, incident/evidence reconstruction, release identity, and archive inventory. Never delete or recreate `vigia-postgis` as part of an in-place restore.

## 5. Stop without data loss

```sh
docker compose -f infra/docker-compose.remote-shadow.yml down
```

Do not add `--volumes` for a real pilot environment. The automated deployment drill uses its own unique Compose project and removes only the isolated volumes it created.
