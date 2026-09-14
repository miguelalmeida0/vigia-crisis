export const DB_NAME = 'vigia-fieldnet-lite-v1';
export const DB_VERSION = 1;
export const ACTION_STORE = 'actions';
export const MEDIA_STORE = 'media';
export const META_STORE = 'meta';

export const state = {
  db: null,
  session: null,
  csrfToken: null,
  location: null,
  tasks: [],
  flushing: false
};

export const $ = (selector) => document.querySelector(selector);
export const $$ = (selector) => [...document.querySelectorAll(selector)];
export const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
export const formatTime = (value) => value ? new Intl.DateTimeFormat(undefined, { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) : '—';
export const uid = (prefix) => `${prefix}:${crypto.randomUUID()}`;

export function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(ACTION_STORE)) db.createObjectStore(ACTION_STORE, { keyPath: 'id' }).createIndex('createdAt', 'createdAt');
      if (!db.objectStoreNames.contains(MEDIA_STORE)) db.createObjectStore(MEDIA_STORE, { keyPath: 'evidenceHash' });
      if (!db.objectStoreNames.contains(META_STORE)) db.createObjectStore(META_STORE, { keyPath: 'key' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function storeRequest(storeName, mode, operation) {
  return new Promise((resolve, reject) => {
    const transaction = state.db.transaction(storeName, mode);
    const request = operation(transaction.objectStore(storeName));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

export const put = (storeName, value) => storeRequest(storeName, 'readwrite', (store) => store.put(value));
export const get = (storeName, key) => storeRequest(storeName, 'readonly', (store) => store.get(key));
export const getAll = (storeName) => storeRequest(storeName, 'readonly', (store) => store.getAll());

export async function digest(value) {
  const bytes = value instanceof ArrayBuffer ? value : new TextEncoder().encode(String(value));
  const result = await crypto.subtle.digest('SHA-256', bytes);
  return `sha256:${[...new Uint8Array(result)].map((byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

export function toast(message) {
  const element = $('#toast');
  element.textContent = message;
  element.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { element.hidden = true; }, 4200);
}

export async function api(path, options = {}) {
  const headers = { ...(options.headers ?? {}) };
  if (options.method && options.method !== 'GET') headers['x-vigia-field-csrf'] = state.csrfToken ?? '';
  if (options.body !== undefined) headers['content-type'] = 'application/json';
  return fetch(path, { credentials: 'same-origin', cache: 'no-store', ...options, headers, body: options.body === undefined ? undefined : JSON.stringify(options.body) });
}
