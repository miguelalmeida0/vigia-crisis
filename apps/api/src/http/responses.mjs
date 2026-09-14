export function json(res, status, body, headers = {}) {
  const encoded = Buffer.from(JSON.stringify(body));
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': encoded.length,
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    ...headers
  });
  res.end(encoded);
}

export function noContent(res, status = 204) {
  res.writeHead(status, { 'cache-control': 'no-store' });
  res.end();
}

export function problem(res, status, code, message, details) {
  return json(res, status, {
    error: code,
    message,
    ...(details === undefined ? {} : { details })
  });
}
