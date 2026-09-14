export function escapeHtml(value = '') { return String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]); }
export function attr(value = '') { return escapeHtml(typeof value === 'string' ? value : JSON.stringify(value)); }
