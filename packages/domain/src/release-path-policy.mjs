export const CANONICAL_OPERATOR_CONSOLE = 'apps/operator-console';
export const QUARANTINED_OPERATOR_PROTOTYPE = 'apps/mission-dark';
export const LEGACY_NONCANONICAL_WEB = 'apps/web';
export const QUARANTINE_CONTROL_FILES = new Set([
  'apps/mission-dark/package.json',
  'apps/mission-dark/docs/internal/automation/AGENTS.md',
  'apps/mission-dark/QUARANTINED.md',
  'apps/mission-dark/scripts/quarantined.mjs',
]);

export function isSensitiveReleasePath(value) {
  return value !== '.env.example'
    && (/(^|\/)(?:\.env(?:\.|$)|secrets?(?:\.|\/|$)|credentials?(?:\.|\/|$)|id_(?:rsa|ed25519)$|user$)|\.(?:pem|p12|key)$/i.test(value)
      || /^\.c\/(?:lima|\.colima).*\/_config\/user$/.test(value));
}

export function classifyReleasePath(value) {
  const releasePath = value.replaceAll('\\', '/');
  if (isSensitiveReleasePath(releasePath)) return 'SECRET / MUST NEVER COMMIT';
  if (releasePath === '.env.example') return 'SOURCE — release code';
  if (QUARANTINE_CONTROL_FILES.has(releasePath)) return 'SOURCE — release code';
  if (releasePath === LEGACY_NONCANONICAL_WEB || releasePath.startsWith(`${LEGACY_NONCANONICAL_WEB}/`)) return 'QUARANTINED LEGACY / NON-RELEASE';
  if (/(?:^|\/)(?:\.tmp|tmp|coverage|dist|build|playwright-report|test-results)(?:\/|$)|\.(?:log|pid|sock|tmp)$/i.test(releasePath)) return 'TEMPORARY';
  if (/^\.c\/|^\.forge-(?:colima|tmp)\/|(?:^|\/)(?:\.cache|\.venv|__pycache__|node_modules)(?:\/|$)|(?:^|\/)\.DS_Store$/i.test(releasePath)) return 'RUNTIME CACHE';
  if (releasePath === QUARANTINED_OPERATOR_PROTOTYPE || releasePath.startsWith(`${QUARANTINED_OPERATOR_PROTOTYPE}/`)) return 'QUARANTINED PROTOTYPE / NON-RELEASE';
  if (/^data\/runtime\//.test(releasePath)) return 'RUNTIME CACHE';
  if (/^data\/replay\/raw\/|^data\/validation\/physical-sensing\/raw\//.test(releasePath)) return 'RAW IMMUTABLE EVIDENCE';
  if (/^data\/validation\/|^\.external-campaigns\//.test(releasePath) || /^apps\/web\/data\//.test(releasePath)) return 'GOVERNED EVIDENCE';
  if (/^data\/reference\/|^data\/replay\/(?:corpus|results)\//.test(releasePath)) return 'REFERENCE DATA';
  if (/(?:^|\/)(?:test|tests)\/|\.test\.[cm]?[jt]s$|^scripts\/(?:browser_qa|fire_qa|mobile_qa|production_browser_qa)\.py$|^workers\/.*test.*\.py$/.test(releasePath)) return 'TEST';
  if (/^(?:apps|packages|scripts|workers|infra|docs)\/|^(?:package(?:-lock)?\.json|\.dockerignore|README\.md)$/.test(releasePath)) return 'SOURCE — release code';
  if (/\.(?:js|mjs|cjs|ts|tsx|jsx|py|sql|css|html|sh|json|yaml|yml|md)$/.test(releasePath)) return 'SOURCE — release code';
  return 'REFERENCE DATA';
}

export function isReleaseSourcePath(value) {
  return ['SOURCE — release code', 'TEST'].includes(classifyReleasePath(value));
}
