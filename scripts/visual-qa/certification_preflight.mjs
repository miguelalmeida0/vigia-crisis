export const CANONICAL_RUNTIME_COMPONENTS = Object.freeze(["Database", "Central API", "FieldNet", "Operator"]);
export const RELEASE_IDENTITY_FIELDS = Object.freeze(["releaseId", "codeStateHash", "operationalDataHash", "releaseStatementHash"]);

export function parseCanonicalRuntimeStatus(output = "") {
  return Object.fromEntries(
    CANONICAL_RUNTIME_COMPONENTS.map((component) => {
      const match = String(output).match(new RegExp(`^${component.replace(" ", "\\s+")}\\s+(READY|FAILED|DEGRADED|STARTING|STOPPED|NOT_READY)\\s*$`, "m"));
      return [component, match?.[1] ?? "MISSING"];
    }),
  );
}

const identityOf = (value = {}) => {
  const candidate = value?.identity ?? value?.releaseIdentity ?? value;
  return Object.fromEntries(RELEASE_IDENTITY_FIELDS.map((field) => [field, candidate?.[field] ?? null]));
};

export function validateCanonicalVqaPreflight({ statusOutput = "", statusExitCode = null, manifest = null, runtimeProof = null, pointer = null } = {}) {
  const violations = [];
  const components = parseCanonicalRuntimeStatus(statusOutput);
  if (statusExitCode !== 0) violations.push({ code: "VQA_LOCAL_STATUS_FAILED", actual: statusExitCode });
  for (const [component, state] of Object.entries(components))
    if (state !== "READY") violations.push({ code: "VQA_RUNTIME_COMPONENT_NOT_READY", component, actual: state });
  const manifestIdentity = identityOf(manifest),
    runtimeIdentity = identityOf(runtimeProof);
  for (const field of RELEASE_IDENTITY_FIELDS) {
    if (!manifestIdentity[field]) violations.push({ code: "VQA_MANIFEST_IDENTITY_INCOMPLETE", field });
    if (runtimeIdentity[field] !== manifestIdentity[field])
      violations.push({ code: "VQA_RUNTIME_IDENTITY_MISMATCH", field, expected: manifestIdentity[field], actual: runtimeIdentity[field] });
  }
  if (runtimeProof?.fieldnetReadiness?.ready !== true) violations.push({ code: "VQA_FIELDNET_AUTHORITATIVE_READINESS_FALSE" });
  if (!pointer || !/^http:\/\/127\.0\.0\.1:\d+$/.test(String(pointer.origin ?? "")) || !Number.isInteger(Number(pointer.port)))
    violations.push({ code: "VQA_OPERATOR_POINTER_INVALID" });
  if (pointer?.releaseId !== manifestIdentity.releaseId)
    violations.push({ code: "VQA_OPERATOR_POINTER_RELEASE_MISMATCH", expected: manifestIdentity.releaseId, actual: pointer?.releaseId ?? null });
  return { state: violations.length ? "FAIL" : "PASS", components, manifestIdentity, runtimeIdentity, violations };
}
