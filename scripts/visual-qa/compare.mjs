import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

async function dependency(name, entry = "") {
  try {
    return await import(name);
  } catch (error) {
    const root = String(process.env.VIGIA_VQA_NODE_MODULES ?? "").trim();
    if (!root) throw error;
    return import(pathToFileURL(path.join(root, name, entry)).href);
  }
}
const pixelmatchModule = await dependency("pixelmatch", "index.js");
const pngModule = await dependency("pngjs", "lib/png.js");
const pixelmatch = pixelmatchModule.default;
const PNG = pngModule.PNG ?? pngModule.default?.PNG;
let odiffCompare = null;
try {
  odiffCompare = (await dependency("odiff-bin")).compare;
} catch {}

const [referencePath, runtimePath, differencePath, differenceMaskPath, pixelmatchMaskPath, overlayPath, ignoreRegionsPath] = process.argv.slice(2);
if (![referencePath, runtimePath, differencePath, differenceMaskPath, pixelmatchMaskPath, overlayPath].every(Boolean))
  throw new Error("visual_compare_arguments_required");
const ignoreRegions = ignoreRegionsPath ? (JSON.parse(readFileSync(ignoreRegionsPath, "utf8")).ignoreRegions ?? []) : [];
for (const region of ignoreRegions) {
  if (!["x1", "y1", "x2", "y2"].every((key) => Number.isInteger(region[key]))) throw new Error("visual_compare_ignore_region_invalid");
}

const reference = PNG.sync.read(readFileSync(referencePath));
const runtime = PNG.sync.read(readFileSync(runtimePath));
if (reference.width !== runtime.width || reference.height !== runtime.height)
  throw new Error(`visual_compare_layout_mismatch:${reference.width}x${reference.height}:${runtime.width}x${runtime.height}`);

const { width, height } = reference,
  totalPixels = width * height;
const overlay = new PNG({ width, height, colorType: 6 });
for (let index = 0; index < reference.data.length; index += 4) {
  overlay.data[index] = Math.round((reference.data[index] + runtime.data[index]) / 2);
  overlay.data[index + 1] = Math.round((reference.data[index + 1] + runtime.data[index + 1]) / 2);
  overlay.data[index + 2] = Math.round((reference.data[index + 2] + runtime.data[index + 2]) / 2);
  overlay.data[index + 3] = 255;
}
writeFileSync(overlayPath, PNG.sync.write(overlay, { colorType: 6, inputColorType: 6 }));

const pixelmatchReference = Buffer.from(reference.data),
  pixelmatchRuntime = Buffer.from(runtime.data);
for (const { x1, y1, x2, y2 } of ignoreRegions) {
  for (let y = Math.max(0, y1); y < Math.min(height, y2); y++)
    for (let x = Math.max(0, x1); x < Math.min(width, x2); x++) {
      const index = (y * width + x) * 4;
      pixelmatchRuntime[index] = pixelmatchReference[index];
      pixelmatchRuntime[index + 1] = pixelmatchReference[index + 1];
      pixelmatchRuntime[index + 2] = pixelmatchReference[index + 2];
      pixelmatchRuntime[index + 3] = pixelmatchReference[index + 3];
    }
}
const pixelmatchMask = new PNG({ width, height, colorType: 6 });
const pixelmatchCount = pixelmatch(pixelmatchReference, pixelmatchRuntime, pixelmatchMask.data, width, height, {
  threshold: 0.1,
  includeAA: false,
  alpha: 0,
  aaColor: [255, 190, 0],
  diffColor: [255, 0, 0],
  diffColorAlt: [0, 128, 255],
  diffMask: true,
});
writeFileSync(pixelmatchMaskPath, PNG.sync.write(pixelmatchMask, { colorType: 6, inputColorType: 6 }));

let odiff, odiffMask;
if (odiffCompare) {
  odiff = await odiffCompare(referencePath, runtimePath, differencePath, {
    threshold: 0.1,
    antialiasing: true,
    outputDiffMask: false,
    diffOverlay: false,
    failOnLayoutDiff: true,
    captureDiffLines: true,
    captureDiffCols: true,
    ...(ignoreRegions.length ? { ignoreRegions } : {}),
  });
  odiffMask = await odiffCompare(referencePath, runtimePath, differenceMaskPath, {
    threshold: 0.1,
    antialiasing: true,
    outputDiffMask: true,
    diffOverlay: false,
    failOnLayoutDiff: true,
    ...(ignoreRegions.length ? { ignoreRegions } : {}),
  });
} else {
  const encoded = PNG.sync.write(pixelmatchMask, { colorType: 6, inputColorType: 6 });
  writeFileSync(differencePath, encoded);
  writeFileSync(differenceMaskPath, encoded);
  odiff = {
    match: pixelmatchCount === 0,
    diffPercentage: (pixelmatchCount / totalPixels) * 100,
    reason: "odiff_unavailable_pixelmatch_fallback",
    threshold: 0.1,
  };
  odiffMask = { ...odiff, outputDiffMask: true };
}
if (odiff.match) {
  const blank = new PNG({ width, height, colorType: 6 });
  writeFileSync(differencePath, PNG.sync.write(blank, { colorType: 6, inputColorType: 6 }));
  writeFileSync(differenceMaskPath, PNG.sync.write(blank, { colorType: 6, inputColorType: 6 }));
}

process.stdout.write(
  `${JSON.stringify({
    engineVersions: { odiff: odiffCompare ? "4.5.0" : "unavailable-local-fallback", pixelmatch: "7.2.0", pngjs: "7.0.0" },
    odiff,
    odiffMask,
    pixelmatch: { changedPixels: pixelmatchCount, changedPixelRatio: pixelmatchCount / totalPixels, threshold: 0.1, antialiasingIgnored: true },
    ignoredRegions: ignoreRegions,
    dimensions: { width, height },
  })}\n`,
);
