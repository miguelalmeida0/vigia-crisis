// Public deployments retain HTTPS. HTTP is an explicit loopback-only test mode.
export function demoPublicScheme(env = process.env) {
  const scheme = String(env.VIGIA_OPERATOR_PUBLIC_SCHEME || 'https').trim();
  const authority = String(env.VIGIA_OPERATOR_PUBLIC_AUTHORITY || '').trim();
  if (scheme === 'https') return scheme;
  if (scheme === 'http'
      && /^(127\.0\.0\.1|localhost)(?::\d{2,5})?$/.test(authority)
      && env.VIGIA_DEMO_CONFIRM === 'SYNTHETIC_DEMO_ONLY'
      && env.VIGIA_DEMO_DATABASE_MODE === 'ephemeral_local_postgis') return scheme;
  throw new Error('public_demo_https_required_except_explicit_local_test');
}
