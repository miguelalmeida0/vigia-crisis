import { createHash } from "node:crypto";
import { readFileSync, realpathSync, statSync } from "node:fs";
import path from "node:path";

const references = Object.freeze([
  ["01_COMMAND_OVERVIEW_VISUAL_BASE.png", "ee9b5452470c414deefecaf91ad70448af92d041524bf4ae2bd67c36c49fa6ee"],
  ["02_INCIDENTS_VISUAL_BASE.png", "591c5d4c11612d152ef3127dc31158640191e52c99131d453061079e55187019"],
  ["03_INCIDENT_DETAIL_VISUAL_BASE.png", "a8ca39cafa6c8ec4da8c5e4eca5f4e73cffb8b543b103e8d7b879a21cb7ca5bb"],
  ["04_INTELLIGENCE_FINAL_TARGET.png", "0598a1d1a7eeda6afbb6e04fe984d60f9718bda004b36cb7fac9f156677a8fa4"],
  ["05_OPERATIONS_VISUAL_BASE.png", "1095d43c7effbe678aa92d09110408ec5b00edca3f28da34a8b721fc8dd2c180"],
  ["06_REPORTS_ANALYTICS_VISUAL_BASE.png", "b2d46b4d2fb1f671cb39470d36cea346a9192a1d8f2d9e315339117e0c5cd96a"],
  ["07_GLOBAL_AWARENESS_VISUAL_BASE.png", "cbbb87925a3269b39f7bd1daa3aefcbb3057b981fe90137f45d8c5e4e20822cc"],
]);

export function assertVisualReferences(root) {
  const referenceRoot = path.join(root, "docs/internal/handoffs/final-white-frontend-2026-09-01");
  for (const [name, expected] of references) {
    const file = path.join(referenceRoot, name);
    const metadata = statSync(file, { throwIfNoEntry: false });
    if (!metadata?.isFile() || metadata.isSymbolicLink()) throw new Error(`visual_reference_invalid:${name}`);
    if (realpathSync(file) !== file) throw new Error(`visual_reference_path_not_canonical:${name}`);
    const actual = createHash("sha256").update(readFileSync(file)).digest("hex");
    if (actual !== expected) throw new Error(`visual_reference_hash_mismatch:${name}:${actual}`);
  }
}
