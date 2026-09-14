export function createToasts(root) {
  return { show(message, { duration = 3200 } = {}) { const item = document.createElement('div'); item.className = 'toast'; item.textContent = message; root.append(item); setTimeout(() => item.remove(), duration); } };
}
