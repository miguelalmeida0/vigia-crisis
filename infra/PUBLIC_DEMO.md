# VIGIA public portfolio deployment

This profile exposes the canonical VIGIA Operator Console as a **read-only research/portfolio system**. It is not an emergency service, does not claim operational certification, and must never expose the supervised operator-admission boundary.

## Safety boundary

- Public browser traffic reaches only `gateway -> web`.
- The API and PostGIS are not published to the host network.
- The public web gateway forwards unsigned API reads only. The API therefore resolves the existing `public-readonly` / `public_viewer` request context.
- Every mutation except the console's session bootstrap is rejected by the public gateway. That bootstrap is converted to the API's existing public `GET /api/v10/session` endpoint.
- Stream endpoints are disabled in this profile.
- No operator proxy key, operator access token, FieldNet control key, or write-capable credential belongs in this profile.
- The canonical `apps/operator-console` source is not modified by this deployment layer; release/source identity checks remain intact.

## Host requirements

Use one small Linux host with Docker Engine + Docker Compose v2, persistent SSD storage, and inbound TCP 80/443 plus UDP 443. Point one DNS A/AAAA record such as `vigia.example.com` at the host. Caddy terminates TLS automatically.

For a portfolio deployment, prefer fixed-price infrastructure with a hard monthly ceiling. Do not enable provider APIs with uncapped paid usage merely to make a demo appear more live.

## Protected files

Create these owner-readable files outside the repository and `chmod 600` them:

- `VIGIA_POSTGRES_PASSWORD_FILE` — a random Postgres password.
- `VIGIA_DATABASE_URL_FILE` — `postgresql://vigia:<password>@postgis:5432/vigia`.
- `VIGIA_PROVIDER_CREDENTIALS_FILE` — newline-delimited provider environment values. It may be an empty file when no provider is configured.

Never commit these values.

## Release identity

Read the exact values from `data/validation/release/current-release-manifest.json`. Do not hand-edit or invent hashes.

```sh
export VIGIA_RELEASE_ID='vigia-intelligence-fabric-14b343443ea8c494'
export VIGIA_CODE_STATE_HASH='sha256:6ffbbb28e7b876d254907061d816c960fd4dfe2b1438b686694402d76e824bd2'
export VIGIA_OPERATIONAL_DATA_HASH='sha256:0ee7f5dd8cf02d36e4e2b8f9b09f66adb743be05d9367367e1d131524f8f7351'
export VIGIA_APPROVED_RELEASE_STATEMENT_SHA256='sha256:3b8d061f802a9fecdc42932a7b96220dbea7463216fce29438e4775794848444'
```

Those values describe the current retained release and must be replaced when the governed release changes. The current manifest still reports pending certification states; the public site must therefore retain the research/portfolio disclaimer and must not be described as certified or agency-ready.

## Deployment values

```sh
export VIGIA_PUBLIC_AUTHORITY='vigia.example.com'
export VIGIA_PUBLIC_TLS_EMAIL='owner@example.com'
export VIGIA_API_IMAGE_REFERENCE="vigia-public-api:${VIGIA_RELEASE_ID}"
export VIGIA_OPERATOR_IMAGE_REFERENCE="vigia-public-web:${VIGIA_RELEASE_ID}"

export VIGIA_POSTGRES_PASSWORD_FILE='/srv/vigia/secrets/postgres-password'
export VIGIA_DATABASE_URL_FILE='/srv/vigia/secrets/database-url'
export VIGIA_PROVIDER_CREDENTIALS_FILE='/srv/vigia/secrets/providers.env'
```

`NASA_FIRMS_MAP_KEY` is optional. If it is absent, VIGIA must disclose the resulting source limitation rather than fabricate freshness.

## Validate and start

```sh
docker compose -f infra/docker-compose.public-demo.yml config --quiet
docker compose -f infra/docker-compose.public-demo.yml up -d --build --wait --wait-timeout 300
```

## Acceptance checks

The following must all pass before the portfolio links to the deployment:

```sh
curl --fail --silent "https://${VIGIA_PUBLIC_AUTHORITY}/__operator/ready"
curl --fail --silent "https://${VIGIA_PUBLIC_AUTHORITY}/backend/api/v10/session"
curl --fail --silent "https://${VIGIA_PUBLIC_AUTHORITY}/backend/api/v10/release"
```

The ready response must contain `publicDemo: true`, `readOnly: true`, the expected release ID, and the portfolio disclaimer.

A mutation must fail closed:

```sh
curl -i -X POST "https://${VIGIA_PUBLIC_AUTHORITY}/backend/api/v10/alerts/example/acknowledge"
```

Expected: `405` with `public_demo_read_only`.

Also test the UI in a fresh anonymous browser. It must load without operator credentials, render retained truth only, and expose no usable write control. Any write-looking control that remains visible must fail closed at the gateway and should be removed/disabled in a later UI-specific public mode rather than made functional.

## Backup

```sh
docker compose -f infra/docker-compose.public-demo.yml --profile maintenance run --rm backup
```

Keep backups outside the public web root and copy them off-host on a schedule appropriate to the retained demo data.

## Upgrade

Build and verify the new governed VIGIA release first. Then update the four release identity variables and image tags together and run:

```sh
docker compose -f infra/docker-compose.public-demo.yml up -d --build --wait --wait-timeout 300
```

Do not delete the PostGIS volume during an upgrade. Re-run the acceptance checks before reopening the portfolio link.

## Stop

```sh
docker compose -f infra/docker-compose.public-demo.yml down
```

Do not add `--volumes` unless intentionally destroying the public demo's retained database and TLS state.
