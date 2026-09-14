import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { ACTION_HANDLER_SOURCE_PATHS, inspectActionHandlerSources } from "./anduril_action_handler_contract.mjs";
import { controlledActionKinds } from "./anduril_browser_integrity.fixtures.mjs";

test("operator action contract binds the facade and extracted controller sources", async () => {
  const contract = await inspectActionHandlerSources(process.cwd());
  assert.deepEqual(
    contract.sources.map((item) => item.path),
    ACTION_HANDLER_SOURCE_PATHS,
  );
  assert.match(contract.sourceSha256, /^sha256:[a-f0-9]{64}$/u);
  assert.ok(contract.handlerKinds.length > 100, "expected the complete governed action switch");

  const appSource = await readFile(ACTION_HANDLER_SOURCE_PATHS[0], "utf8");
  assert.match(appSource, /createAppActionController/u);
  for (const actionKind of controlledActionKinds) {
    assert.ok(contract.handlerKinds.includes(actionKind), `missing handler ${actionKind}`);
  }
});
