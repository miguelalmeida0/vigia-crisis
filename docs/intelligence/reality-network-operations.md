# Reality Network operations

## Commands

```bash
npm run providers:doctor -- --json
npm run live:wildfire -- --once
npm run shadow:wildfire -- --once
npm run backfill:wildfire:reality -- --from=2024-09-17 --to=2024-09-18 --region=portugal
npm run demo:reality-network
npm run eval:reality-network
npm run report:reality-quality
npm run benchmark:reality-network
npm run test:reality-network
```

`live:wildfire` is named for live ingestion; control remains SHADOW-only. `--duration` is capped at ten minutes. Backfill is capped at ten inclusive days and preserves products/opportunities without turning empty rows into negative labels.

## Durable locations

- `data/runtime/reality-network/bronze/`: content-addressed raw bytes, mode 0600.
- `data/runtime/reality-network/raw-vault-state.json`: raw product/checkpoint metadata.
- `data/runtime/reality-network/provider-state.json`: providers, cursors, runs and retrieval bindings.
- `data/runtime/reality-network/operational-events-v4.jsonl`: checksummed append-only event/rejection journal.
- `data/validation/reality-network/latest-live-run.json`: latest bounded live proof and consumer snapshot.
- `data/validation/reality-network/historical-evaluation.json`: deterministic historical metrics, manifest, ablations and leakage report.

## Status meanings

- `LIVE`: a real product was fetched and accepted in the current run.
- `READY`: configuration and provider probe passed; it is not proof of a live observation.
- `DEGRADED`: at least one provider product succeeded and at least one failed.
- `CREDENTIALS_REQUIRED`: no payload request is claimed.
- `UNAVAILABLE`, `RATE_LIMITED`, `SCHEMA_DRIFT`: explicit failure; never absence evidence.
- `PARTNER_REQUIRED`: port exists but no lawful/validated endpoint is configured.

## Credentials

Use environment/container secrets or the existing private secret file/Keychain flow. Supported fields include NASA FIRMS, CDSE, EUMETSAT and partner-port tokens. Do not put values in tracked files or command lines. Doctor/report output shows only presence and redacted state.

## Incident selection and failure recovery

The runtime fetches a bounded current WFIGS page and current US GOES products, chooses the official incident with the best nearby ABI support, then scopes other providers to a small incident box. Only records within 25 km are associated. A provider failure does not abort the other providers. Restart reuses raw objects and journal identities; identity conflicts are quarantined as rejections rather than overwritten.

If the run is blocked, inspect `providers:doctor`, provider state `lastFailure`, the retrieval record and raw-vault capacity. Do not clear the cursor or raw vault merely to make the next run green. Local PostGIS was not running during certification; start/migrate it before claiming the database persistence path.
