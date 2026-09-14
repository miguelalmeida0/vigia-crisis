import { spawnSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const outputPath = path.resolve(root, process.env.FIELDNET_HARDWARE_REPORT ?? 'data/validation/fieldnet/sensors/hardware-discovery.json');
const families = [
  ['THERMAL_CAMERA', /\b(flir|thermal camera|seek thermal)\b/i],
  ['ENVIRONMENTAL_SENSOR', /\b(bme2?80|sht3?\d|dht\d+|sensirion|environmental sensor)\b/i],
  ['WEATHER_SENSOR', /\b(kestrel|anemometer|weather sensor|rain gauge)\b/i],
  ['AIR_QUALITY_SENSOR', /\b(particulate|air quality|purpleair|airgradient)\b/i]
];

const profiler = spawnSync('/usr/sbin/system_profiler', ['SPUSBDataType', 'SPBluetoothDataType', '-json'], { encoding:'utf8', timeout:45_000, maxBuffer:16 * 1024 * 1024 });
if (profiler.status !== 0) throw new Error(`hardware_discovery_failed:${String(profiler.stderr).slice(0, 120)}`);
const raw = JSON.parse(profiler.stdout);
const detected = new Set();
let usbEntries = 0, bluetoothEntries = 0;
const visit = (value, bus) => {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) { value.forEach((item) => visit(item, bus)); return; }
  const descriptor = [value._name, value.device_name, value.manufacturer, value.product_name, value.model].filter((item) => typeof item === 'string').join(' ');
  if (descriptor) {
    if (bus === 'USB') usbEntries += 1;
    if (bus === 'BLUETOOTH') bluetoothEntries += 1;
    for (const [family, pattern] of families) if (pattern.test(descriptor)) detected.add(family);
  }
  Object.values(value).forEach((item) => visit(item, bus));
};
visit(raw.SPUSBDataType, 'USB'); visit(raw.SPBluetoothDataType, 'BLUETOOTH');
const inspectedAt = new Date().toISOString(), supportedFamiliesDetected = [...detected].sort();
const report = {
  schemaVersion: 'vigia.field-sensor-hardware-discovery.v1', inspectedAt, sensorHardware: supportedFamiliesDetected.length ? 'SUPPORTED_HARDWARE_DISCOVERED_REQUIRES_ENROLLMENT' : 'NOT_PRESENT', supportedFamiliesDetected,
  sanitizedInventory: { usbDescriptorCount:usbEntries, bluetoothDescriptorCount:bluetoothEntries, identifiersRetained:0, serialNumbersRetained:0, deviceNamesRetained:0 },
  method: { tool:'macOS system_profiler', dataTypes:['SPUSBDataType','SPBluetoothDataType'], matching:'SUPPORTED_ENVIRONMENTAL_OR_THERMAL_FAMILY_ONLY' },
  qualification: supportedFamiliesDetected.length ? 'A supported family descriptor was discovered. It is not evidence until explicit registration, calibration, location, time, raw preservation, and quality qualification succeed.' : 'No supported environmental or thermal sensor family was discoverable. The production gateway remains ready; no physical observation is fabricated.'
};
await mkdir(path.dirname(outputPath), { recursive:true }); await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ ok:true, outputPath, sensorHardware:report.sensorHardware, supportedFamiliesDetected, sensitiveIdentifiersPrinted:false })}\n`);
