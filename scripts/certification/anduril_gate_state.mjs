const NON_BLOCKING_NOT_APPLICABLE_GATES = new Set(["verifiedCurrentResponseCoverage"]);

export function certificationGateSatisfied(name, gate) {
  if (gate?.state === "PASS") return true;
  return gate?.state === "NOT_APPLICABLE" && NON_BLOCKING_NOT_APPLICABLE_GATES.has(name);
}
