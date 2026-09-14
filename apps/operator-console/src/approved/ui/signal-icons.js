import { icon as baseIcon } from './icons.js';
const paths={
 'arrow-up':'<path d="M12 20V4m-7 7 7-7 7 7"/>',
 'arrow-down':'<path d="M12 4v16m-7-7 7 7 7-7"/>',
 bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4M12 2V1"/>',
 'air-quality': '<path d="m8 3-5 5v8l5 5h8l5-5V8l-5-5ZM12 17V7m-4 4 4-4 4 4"/>',
 temperature: '<path d="M10 14.5V5a2 2 0 0 1 4 0v9.5a4 4 0 1 1-4 0ZM12 8v9M17 6h3M17 10h2"/>',
 droplet: '<path d="M12 2C9 7 5 11 5 15a7 7 0 0 0 14 0c0-4-4-8-7-13Z"/><path d="M8 15a4 4 0 0 0 4 4"/>',
 wind: '<path d="M3 8h12a3 3 0 1 0-3-3M2 12h17a3 3 0 1 1-3 3M4 17h5a2 2 0 1 1-2 2"/>',
 rain: '<path d="M6 13a4 4 0 1 1 1-8 5 5 0 0 1 10 1 3.5 3.5 0 0 1 1 7M7 16l-1 4M12 16l-1 4M17 16l-1 4"/>',
 air: '<path d="M3 8h12a3 3 0 1 0-3-3M2 12h17a3 3 0 1 1-3 3M4 17h5a2 2 0 1 1-2 2"/>',
};
export function icon(name){return paths[name]?`<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]}</svg>`:baseIcon(name);}
