import http from 'node:http';
const req = http.get({ hostname: '127.0.0.1', port: Number(process.env.PORT || 10000), path: '/__operator/ready',
  headers: { host: process.env.VIGIA_OPERATOR_PUBLIC_AUTHORITY || '' }, timeout: 4_000 }, res => {
  let text = '';
  res.on('data', chunk => { text += chunk; if (text.length > 16_000) req.destroy(new Error('oversized_health_response')); });
  res.on('error', () => { process.exitCode = 1; });
  res.on('end', () => { try { process.exitCode = res.statusCode === 200 && JSON.parse(text).ok === true ? 0 : 1; } catch { process.exitCode = 1; } });
});
req.on('timeout', () => req.destroy(new Error('health_timeout')));
req.on('error', () => { process.exitCode = 1; });
