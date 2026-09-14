import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

export const ACTION_HANDLER_CONTRACT = "vigia.operator-action-handler-sources.v2";

export const ACTION_HANDLER_SOURCE_PATHS = Object.freeze([
  "apps/operator-console/src/app.js",
  "apps/operator-console/src/appActionController.js",
  "apps/operator-console/src/responseCapabilityActions.js",
]);

const digest = (value) => `sha256:${createHash("sha256").update(value).digest("hex")}`;

export async function inspectActionHandlerSources(root) {
  const sourceRecords = [];
  const aggregate = createHash("sha256");
  const handlerKinds = new Set();

  for (const sourcePath of ACTION_HANDLER_SOURCE_PATHS) {
    const source = await readFile(path.join(root, sourcePath));
    const text = source.toString("utf8");
    sourceRecords.push({ path: sourcePath, sha256: digest(source) });
    aggregate.update(sourcePath);
    aggregate.update("\0");
    aggregate.update(source);
    aggregate.update("\0");
    for (const match of text.matchAll(/\bcase\s*['"]([^'"]+)['"]\s*:/gu)) {
      handlerKinds.add(match[1]);
    }
    for (const match of text.matchAll(/\[((?:\s*['"][^'"]+['"]\s*,?)+)\]\.includes\(kind\)/gu)) {
      for (const item of match[1].matchAll(/['"]([^'"]+)['"]/gu)) handlerKinds.add(item[1]);
    }
  }

  return {
    contract: ACTION_HANDLER_CONTRACT,
    sources: sourceRecords,
    sourceSha256: `sha256:${aggregate.digest("hex")}`,
    handlerKinds: [...handlerKinds].sort(),
  };
}
