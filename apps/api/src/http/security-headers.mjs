const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "script-src 'self' https://cdn.jsdelivr.net",
  "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
  "img-src 'self' data: blob: https://server.arcgisonline.com https://*.basemaps.cartocdn.com",
  "connect-src 'self' http://127.0.0.1:* http://localhost:* https://cdn.jsdelivr.net https://server.arcgisonline.com https://*.basemaps.cartocdn.com https://*.amazonaws.com https://earth-search.aws.element84.com",
  "worker-src 'self' blob:",
  "object-src 'none'"
].join('; ');

export function applySecurityHeaders(res) {
  res.setHeader('content-security-policy', CONTENT_SECURITY_POLICY);
  res.setHeader('cross-origin-opener-policy', 'same-origin');
  res.setHeader('referrer-policy', 'no-referrer');
  res.setHeader('permissions-policy', 'geolocation=(self), microphone=(), camera=()');
  res.setHeader('x-frame-options', 'DENY');
  res.setHeader('x-content-type-options', 'nosniff');
}
