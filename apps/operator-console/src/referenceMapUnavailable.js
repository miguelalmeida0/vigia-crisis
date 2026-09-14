import { esc } from './components.js?v=2.1.0';
import { icon } from './icons.js?v=2.1.0';

// Missing scenes collapse without inventing geography or repeating layer failures.
export function referenceMapUnavailable(label, layers) {
  return `<section class="reference-map-unavailable" aria-label="${esc(label)} unavailable">
    <div class="reference-map-unavailable__controls" aria-label="Map controls unavailable without a scene">
      <button disabled aria-label="Zoom in unavailable">+</button>
      <button disabled aria-label="Zoom out unavailable">−</button>
      <button disabled aria-label="Map layers unavailable">${icon('layers',16)}</button>
    </div>
    <div class="reference-map-unavailable__message" role="status">${icon('map',24)}
      <strong>${esc(label)} currently unavailable</strong>
      <p>No last-known scene is available. Refresh to check again.</p>
    </div>
  </section>`;
}
