import path from "node:path";
import { canonicalRuntime, command, freePort, root } from "./runner_runtime.mjs";

export async function runDocker(selectedLanes, context) {
  const { andurilBrowserOutput, blockedCanonical, contractDirectory, focusedRoute, output, prepareLaneOutput, worldBrowserOutput } = context;
  const runtime = await canonicalRuntime({ allowStart: true });
  if (runtime.blocked)
    return selectedLanes.map((selected) =>
      selected === "canonical"
        ? blockedCanonical(runtime.reason, { status: runtime.status })
        : { lane: selected, status: 2, blocked: true, reason: runtime.reason },
    );
  const image = "vigia-visual-qa:playwright-1.54.0";
  command("docker", ["build", "--pull=false", "--file", "infra/Dockerfile.visual-qa", "--tag", image, "."], { env: { DOCKER_BUILDKIT: "0" } });
  const results = [];
  for (const selected of selectedLanes) {
    prepareLaneOutput(selected);
    const proxyPort = await freePort();
    const dockerArguments = [
      "run",
      "--rm",
      "--init",
      "--ipc=host",
      "--add-host",
      "host.docker.internal:host-gateway",
      "--volume",
      `${root}:/workspace:ro`,
      "--volume",
      `${output}:/output:rw`,
      "--volume",
      `${output}:/workspace/.artifacts/deterministic-visual-qa:rw`,
      "--volume",
      `${worldBrowserOutput}:/workspace/.artifacts/world-leader-gap-closure/browser:rw`,
      "--volume",
      `${andurilBrowserOutput}:/workspace/.artifacts/anduril-class-crisis-os/browser:rw`,
      "--volume",
      `${contractDirectory}:/contract:rw`,
      "--env",
      `VIGIA_VQA_LANE=${selected}`,
      "--env",
      `VIGIA_VQA_OPERATOR_PORT=${runtime.port}`,
      "--env",
      `VIGIA_VQA_PROXY_PORT=${proxyPort}`,
      "--env",
      `VIGIA_VQA_RELEASE_ID=${runtime.releaseId}`,
      "--env",
      "VIGIA_VQA_FIELDNET_ORIGIN=http://host.docker.internal:4188",
    ];
    if (focusedRoute) dockerArguments.push("--env", `VIGIA_VQA_ROUTE=${focusedRoute}`);
    if (selected === "canonical") {
      dockerArguments.push(
        "--env",
        "VIGIA_VQA_ROOT=/workspace",
        "--env",
        "VIGIA_VQA_OUTPUT=/workspace/.artifacts/deterministic-visual-qa",
        "--env",
        "VIGIA_FINAL_WHITE_OUTPUT=/workspace/.artifacts/deterministic-visual-qa/canonical",
        "--env",
        "VIGIA_EXECUTIVE_CONTRACT=/contract/executive-ux",
        "--env",
        "VIGIA_VQA_CONTRACT=/contract/vigia-visual-contract.json",
        "--env",
        "VIGIA_VQA_TOOL_ROOT=/workspace/scripts/visual-qa",
        "--env",
        "VIGIA_VQA_NODE_MODULES=/opt/vigia-visual-qa/node_modules",
        "--entrypoint",
        "python",
        image,
        "/workspace/scripts/visual-qa/final_white_capture.py",
      );
    } else dockerArguments.push(image, "--lane", selected);
    const result = command("docker", dockerArguments, { allowFailure: true });
    results.push({
      lane: selected,
      status: result.status ?? 1,
      releaseId: runtime.releaseId,
    });
  }
  return results;
}
