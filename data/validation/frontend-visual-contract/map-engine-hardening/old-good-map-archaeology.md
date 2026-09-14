# VIGIA map-engine archaeology

Captured 2026-09-02. Investigation was read-only. No alternate worktree was modified.

## Exact original implementation found

The surviving original interactive implementation is:

- file: `/Users/malmeida/Documents/Development/vigia/apps/mission-dark/src/components/TileMap.tsx`
- SHA-256: `03d582fff46b69c3a8eac996d1200489e77c7289d397fcad5f5b93d72c0f8283`
- file creation/modification time: `2026-08-20T15:21:29+0200`
- source status in that checkout: untracked surviving workspace source
- package provenance: commit `09ec360a688714ccd4f938120c7257429f5f0a55` records `leaflet: ^1.9.4`; the lock resolves Leaflet `1.9.4`

The file creates one `L.map` in a mount-only effect, explicitly enables `dragging` and `keyboard`, uses Leaflet's native drag, installs Esri World Imagery plus an independent labels pane, deduplicates resize through `ResizeObserver`, and calls `map.remove()` only on component unmount. TileMap itself creates no DOM incident markers.

## Comparison

| Property | Old good map | Pre-patch canonical console | Hardened canonical console |
|---|---|---|---|
| Library/version | Leaflet 1.9.4 | None | MapLibre GL JS 6.7.0, exactly pinned |
| Renderer | Leaflet slippy-map DOM renderer | Custom 4×4 HTML image grid + SVG/canvas/HTML overlay | One WebGL canvas |
| Base imagery | Esri World Imagery | 16 same-origin proxied imagery tiles + 16 label tiles | Governed same-origin raster tile pyramids for imagery and labels |
| Marker strategy | No markers inside `TileMap.tsx` | Up to 92 HTML buttons in a normal route render; stress observation exceeded 5,000 nodes after interrupted grid swaps | Clustered GeoJSON circle layers in WebGL; at most one exceptional accessible DOM marker |
| Route lifecycle | Create once; remove on unmount | `app.innerHTML`/`replaceChildren` lifecycle disposed and recreated map work; the then-current custom drag also committed camera with a full application render on pointer-up | Route-scoped persistent hosts and map instances; camera persists on `moveend` without rendering |
| Drag behavior | Leaflet owns native gesture | Application-owned CSS transform of a stitched raster grid | MapLibre `dragPan` owns the native gesture |
| Source update | Leaflet tile lifecycle | Whole image grids were assembled/replaced; interrupted replacement could retain incoming grids | Stable sources; identical payloads no-op; changed GeoJSON uses in-place `setData`; thermal uses `updateImage`; no `setStyle` |

## Exact regression

The perceived drag regression was architectural, not CSS. The interactive engine had been replaced by a custom HTML/SVG/raster compositor. Continuous pointer work transformed a stitched 1024 px grid, while completion persisted the camera and ran the route renderer. The in-progress grid replacement path could append an incoming full grid and return after abort without removing it, causing DOM accumulation under repeated updates. That path combined main-thread image decode/layout, DOM marker work, and application reconstruction with the drag lifecycle.

The pre-patch five-second trace measured p50 `8.4 ms`, p95 `24.1 ms`, max `907.7 ms`, ten application renders, and ten frames over `50 ms`. The new native GL trace measures p50 `8.3 ms`, p95 `9.3 ms`, max `67.2 ms`, one (not repeated) frame over `50 ms`, and zero application renders, mounts, destroys, style reloads, or source updates during drag.

## GIBS audit

No canonical operator-console NASA GIBS map code path was found. The console therefore does not claim GIBS use and does not reconstruct a GIBS viewport during pan. The current basemap is Esri imagery through the governed same-origin XYZ proxy. The authorized thermal overlay is a separate bounded `/api/v10/events/thermal/overlay` image source and is not an authoritative perimeter. It is created or updated only when its route configuration changes, never from a move/drag callback. Any future GIBS integration must use a dated EPSG:3857-compatible WMTS tile pyramid with `(layer,date,projection,z,x,y)` cache identity.

