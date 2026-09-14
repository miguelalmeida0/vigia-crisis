async function collectJson(req, limitBytes) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > limitBytes) throw new Error('request_body_too_large');
    chunks.push(chunk);
  }
  if (chunks.length === 0) return {};
  const raw = Buffer.concat(chunks).toString('utf8');
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error('invalid_json');
  }
}

export async function readJson(req, { limitBytes = 128_000, timeoutMs = 10_000 } = {}) {
  if (Buffer.isBuffer(req?.vigiaRawBody)) {
    if (req.vigiaRawBody.length > limitBytes) throw new Error('request_body_too_large');
    if (req.vigiaRawBody.length === 0) return {};
    try { return JSON.parse(req.vigiaRawBody.toString('utf8')); }
    catch { throw new Error('invalid_json'); }
  }
  const boundedTimeout = Math.max(1, Number(timeoutMs) || 10_000);
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const error = Object.assign(new Error('request_body_timeout'), { statusCode: 408 });
      req.destroy?.(error);
      reject(error);
    }, boundedTimeout);
  });
  try {
    return await Promise.race([collectJson(req, limitBytes), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

export const readJsonBody = readJson;
