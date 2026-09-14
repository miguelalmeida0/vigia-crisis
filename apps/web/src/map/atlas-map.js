import { ATLAS_VIEW, clampView, scaleView, viewBoxValue, viewForCoordinate } from './map-projection.js';
import { renderAtlas } from './atlas-renderer.js';

const NS = 'http://www.w3.org/2000/svg';

export class AtlasMap {
  constructor(container, { onSelect }) {
    this.container = container;
    this.onSelect = onSelect;
    this.mode = 'prevent';
    this.data = null;
    this.view = { ...ATLAS_VIEW };
    this.drag = null;
    this.thermalVisible = true;
    this.root = document.createElement('div');
    this.root.className = 'atlas-map-shell';
    this.svg = document.createElementNS(NS, 'svg');
    this.svg.classList.add('atlas-map');
    this.svg.setAttribute('viewBox', viewBoxValue(this.view));
    this.svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    this.svg.setAttribute('role', 'img');
    this.svg.setAttribute('aria-label', 'Interactive Portugal wildfire intelligence map');
    this.tooltip = document.createElement('div');
    this.tooltip.className = 'atlas-tooltip';
    this.tooltip.hidden = true;
    this.root.append(this.svg, this.tooltip);
    this.container.replaceChildren(this.root);
    this.bind();
    this.render();
  }

  bind() {
    this.svg.addEventListener('click', (event) => {
      const marker = event.target.closest?.('[data-kind][data-id]');
      if (marker && marker.dataset.kind !== 'risk') this.onSelect({ kind: marker.dataset.kind, id: marker.dataset.id });
    });
    this.svg.addEventListener('keydown', (event) => {
      const marker = event.target.closest?.('[data-kind][data-id]');
      if (marker && ['Enter', ' '].includes(event.key)) {
        event.preventDefault();
        this.onSelect({ kind: marker.dataset.kind, id: marker.dataset.id });
      }
    });
    this.svg.addEventListener('pointermove', (event) => this.pointerMove(event));
    this.svg.addEventListener('pointerleave', () => { this.tooltip.hidden = true; this.drag = null; });
    this.svg.addEventListener('pointerdown', (event) => this.pointerDown(event));
    this.svg.addEventListener('pointerup', (event) => { this.svg.releasePointerCapture?.(event.pointerId); this.drag = null; });
    this.svg.addEventListener('pointercancel', () => { this.drag = null; });
    this.svg.addEventListener('dblclick', (event) => { event.preventDefault(); this.setView(scaleView(this.view, .72)); });
    this.svg.addEventListener('wheel', (event) => {
      event.preventDefault();
      this.setView(scaleView(this.view, event.deltaY > 0 ? 1.16 : .86));
    }, { passive: false });
  }

  pointerDown(event) {
    if (event.target.closest?.('[data-kind][data-id]')) return;
    this.svg.setPointerCapture?.(event.pointerId);
    this.drag = { x: event.clientX, y: event.clientY, view: { ...this.view } };
  }

  pointerMove(event) {
    const marker = event.target.closest?.('[data-kind][data-id]');
    if (marker && marker.dataset.kind !== 'risk') {
      const bounds = this.root.getBoundingClientRect();
      this.tooltip.textContent = marker.dataset.label;
      this.tooltip.style.left = `${event.clientX - bounds.left + 14}px`;
      this.tooltip.style.top = `${event.clientY - bounds.top + 14}px`;
      this.tooltip.hidden = false;
    } else this.tooltip.hidden = true;
    if (!this.drag) return;
    const bounds = this.svg.getBoundingClientRect();
    const dx = (event.clientX - this.drag.x) / bounds.width * this.drag.view.width;
    const dy = (event.clientY - this.drag.y) / bounds.height * this.drag.view.height;
    this.setView(clampView({ ...this.drag.view, x: this.drag.view.x - dx, y: this.drag.view.y - dy }));
  }

  setData(data) { this.data = data; this.render(); }
  setSelection() {}
  setMode(mode) { if (this.mode !== mode) { this.mode = mode; this.render(); } }
  setTimeline() { this.render(); }
  render() { renderAtlas(this.svg, { data: this.data, mode: this.mode, view: this.view }); this.svg.setAttribute('viewBox', viewBoxValue(this.view)); }
  setView(view) { this.view = clampView(view); this.render(); }
  flyTo(coordinate, zoom = 9.5) { if (Array.isArray(coordinate)) this.setView(viewForCoordinate(coordinate, zoom)); }
  home() { this.setView({ ...ATLAS_VIEW }); }
  zoomIn() { this.setView(scaleView(this.view, .76)); }
  zoomOut() { this.setView(scaleView(this.view, 1.3)); }
  toggleThermal() { this.thermalVisible = !this.thermalVisible; this.root.classList.toggle('hide-thermal', !this.thermalVisible); return this.thermalVisible; }
  destroy() { this.root.remove(); }
}
