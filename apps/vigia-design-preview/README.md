# VIGIA design preview

A complete dependency-free frontend implementation of the selected seven-route design. Isolated fictional data; not a live emergency application.

## Development-only reference — not a second product

The canonical application is `apps/operator-console` on port 4190. This preview
is retained solely as the signed-off presentation source and a development
reference. The operator integration tests compare approved styles and shared
primitives against this directory. It is not a deployment target, an operational
data source, or a fallback when canonical requests fail.

The generated `preview.html` and `dist/` are rebuildable local outputs and are
not required in version control. Do not delete this source reference without
replacing its integration-test dependency and obtaining user approval.

```bash
npm run dev              # http://127.0.0.1:4310/
npm test                 # unit tests
npm run check            # syntax and local imports
npm run build            # static dist plus single-file preview.html
```

No `npm install` is needed. Node 22+ is sufficient. Use `npm run dev -- --port 4311` if 4310 is occupied.

The header supports populated, limited, stale and read-only review states. Search, filters, pagination, selections, question inspection, task ownership, notes, state transitions, report periods/tabs, CSV export, region selection and map zoom/fullscreen are implemented.

## Module boundaries

- `src/routes/`: each page owns its layout and primary job.
- `src/ui/`: shared escaped HTML helpers, symbols, shell, dialogs, charts, reference-map adapter.
- `src/data/`: fictional fixtures, pure state transitions/selectors, local provider.
- `src/app.js`: router and delegated event binding.
- `src/actions.js`, `src/task-actions.js`, `src/review-actions.js`: interaction handlers.
- `styles/`: tokens, shell, components, route layouts and responsive rules.
- `tests/`: Node unit suite and reproducible optional Python/Playwright browser harness.

## Safety and integration

This app never calls the existing VIGIA backend. Task changes stay in a namespaced local browser store. A failed live provider must never fall back to these fixtures. There is no real dispatch, authority notification or emergency guidance.

Maps are cropped illustrative rasters from the user-supplied design references, not live satellite imagery or geographically accurate data. Some map symbols/place labels are baked into the rasters. Replace this adapter with a properly licensed production map and actual geographic records during integration. Do not treat pixel positions as incident coordinates.

No font binaries are bundled. The implementation uses system fonts. Review screenshots use Chromium with a 1× device scale. The screenshot is a rendering baseline, not a claim that an AI-generated reference was reproduced with zero pixel difference on every OS.

The single-file exporter supports only this app's named local ESM imports/exports. It is intentionally not a general-purpose bundler. Edit source and regenerate it; do not edit generated HTML.
