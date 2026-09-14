import { releaseIdentityOf } from "./release/runtime_identity_binding.mjs";
import { validateReproducibilityLedger } from "./certification/anduril_integrity.mjs";
import { runFinalSealMode } from "./certification/anduril_final_seal_mode.mjs";
import { runObservationMode } from "./certification/anduril_observation_mode.mjs";
import { createReproducibilityContext, readJson, sequenceFilesystemVerification } from "./certification/anduril_reproducibility_context.mjs";

const labelArgument = process.argv.find((value) => value.startsWith("--label="));
const label = labelArgument?.slice("--label=".length) ?? null;
const verifyOnly = process.argv.includes("--verify");
const sealFinal = process.argv.includes("--seal-final");
const verifyFinal = process.argv.includes("--verify-final");
if ([verifyOnly, sealFinal, verifyFinal].filter(Boolean).length > 1) throw new Error("reproducibility_mode_conflict");

const context = await createReproducibilityContext();
const manifest = await readJson(context.manifestPath);
if (!manifest) throw new Error("current_release_manifest_unavailable");
const identity = releaseIdentityOf(manifest);

if (sealFinal || verifyFinal) {
  await runFinalSealMode({ context, manifest, identity, sealFinal });
} else if (verifyOnly) {
  const ledger = await readJson(context.ledgerPath);
  const verification = await sequenceFilesystemVerification(context, identity, ledger, validateReproducibilityLedger(ledger, identity));
  process.stdout.write(`${JSON.stringify(verification, null, 2)}\n`);
  if (verification.state !== "PASS") process.exitCode = 1;
} else {
  await runObservationMode({ context, manifest, identity, label });
}
