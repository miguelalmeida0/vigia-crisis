# VIGIA Operator Console 2.1.0 — canonical-data client

`apps/operator-console` is the repository-owned canonical UI. It contains no fallback fire/event fixtures on live routes. Canonical VIGIA at `127.0.0.1:4177` remains the source of truth; the console is served only on `127.0.0.1:4190`.

## Required runtime

Start canonical VIGIA first:

```bash
cd /Users/malmeida/Documents/Development/vigia
npm run db:doctor
VIGIA_BACKEND_ONLY=1 /bin/sh scripts/release/trusted_operator_certification.sh --local
npm run operator:start
npm run operator:verify:static
/bin/sh scripts/release/trusted_operator_certification.sh
```

The static command runs every interaction, persistence, truth, real-data, proxy, browser-contract, and build gate. The direct shell command is the only authoritative live-release certification entrypoint: it verifies the complete locked Node runtime, clears startup injection state before Node starts, snapshots the locked Python/Playwright runtime, and owns a private random-port CDP browser for the run. Certification is deliberately not exposed through an npm alias because npm itself is a Node parent. `npm run operator:stop` stops only a listener owned by this repository package; it refuses to kill another process on 4190.

## Real-data rules

- Detect: `/api/v10/events` + per-event operator projection + real basemap proxy + configured live thermal overlay.
- PREVENT: persisted prevention findings + real governed observation pair / Copernicus browse imagery when returned.
- Evidence: selected canonical event observations and source families.
- Replay: official Portugal archival replay corpus; synthetic replay is rejected.
- Source Health / System Proof / FieldNet: canonical runtime projections only.
- Respond: selected live-event operations projection. No Mayday/crew/resource state is invented when command state is not linked.
- Resources: no fire-service apparatus is shown until a governed CAD/AVL/resource integration exists. OSM monitored assets are explicitly reference context, not apparatus.
- Accountability: only canonical SHADOW actor roster rows may be shown. No fake firefighters.
- Dispatch: no CAD, ETA, mutual-aid or public-warning integration is invented.

If `4177` fails, Mission Dark shows the failure; it never falls back to Serra/Canyon/Pinecrest-style demo data.
