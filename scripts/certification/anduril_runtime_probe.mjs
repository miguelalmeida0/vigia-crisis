import { probeCanonicalRuntimeIdentity } from "../release/runtime_identity_binding.mjs";

export async function captureRuntimeIdentity({ manifest, apiOrigin, operatorOrigin, writeJson }) {
  let runtimeProof = null;
  let runtimeIdentityError = null;
  try {
    runtimeProof = await probeCanonicalRuntimeIdentity({
      manifest,
      apiOrigin,
      operatorOrigin,
    });
  } catch (error) {
    runtimeIdentityError = String(error?.message ?? error);
  }
  await writeJson("release/runtime-identity.json", {
    schemaVersion: "vigia.anduril-crisis-os-runtime-identity.v1",
    generatedAt: new Date().toISOString(),
    state: runtimeProof ? "PASS" : "FAIL",
    runtime: runtimeProof,
    error: runtimeIdentityError,
  });
  return { runtimeProof, runtimeIdentityError };
}
