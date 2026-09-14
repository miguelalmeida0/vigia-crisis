import { escapeHtml } from '../utils/html.js';

export function fieldNetEntry(event) {
  return `<section class="fieldnet-incident-entry" data-fieldnet-entry data-incident-id="${escapeHtml(event.id)}" hidden aria-live="polite"></section>`;
}
