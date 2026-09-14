export const MAP_LABELS = Object.freeze([
  { name: 'Braga', coordinate: [-8.43, 41.55], tier: 2 },
  { name: 'Porto', coordinate: [-8.61, 41.15], tier: 1 },
  { name: 'Bragança', coordinate: [-6.76, 41.81], tier: 2 },
  { name: 'Vila Real', coordinate: [-7.74, 41.3], tier: 2 },
  { name: 'Viseu', coordinate: [-7.91, 40.66], tier: 1 },
  { name: 'Aveiro', coordinate: [-8.65, 40.64], tier: 2 },
  { name: 'Guarda', coordinate: [-7.26, 40.54], tier: 2 },
  { name: 'Coimbra', coordinate: [-8.43, 40.21], tier: 1 },
  { name: 'Leiria', coordinate: [-8.81, 39.74], tier: 2 },
  { name: 'Castelo Branco', coordinate: [-7.49, 39.82], tier: 2 },
  { name: 'Santarém', coordinate: [-8.69, 39.24], tier: 2 },
  { name: 'Lisboa', coordinate: [-9.14, 38.72], tier: 1 },
  { name: 'Évora', coordinate: [-7.91, 38.57], tier: 1 },
  { name: 'Beja', coordinate: [-7.86, 38.02], tier: 2 },
  { name: 'Faro', coordinate: [-7.93, 37.02], tier: 1 }
]);

export const REFERENCE_ROADS = Object.freeze([
  { name: 'A1', coordinates: [[-9.14,38.72],[-8.69,39.24],[-8.43,40.21],[-8.65,40.64],[-8.61,41.15]] },
  { name: 'A2', coordinates: [[-9.14,38.72],[-8.44,38.2],[-8.13,37.65],[-7.93,37.02]] },
  { name: 'A6', coordinates: [[-9.14,38.72],[-8.69,38.88],[-7.91,38.57],[-7.25,38.88]] },
  { name: 'A23', coordinates: [[-8.69,39.24],[-8.13,39.47],[-7.49,39.82],[-7.26,40.54]] },
  { name: 'A24', coordinates: [[-7.74,41.3],[-7.91,40.66],[-7.83,40.2]] },
  { name: 'A25', coordinates: [[-8.65,40.64],[-7.91,40.66],[-7.26,40.54]] }
]);

export const REFERENCE_RIVERS = Object.freeze([
  { name: 'Douro', coordinates: [[-6.6,41.19],[-7.15,41.15],[-7.74,41.17],[-8.2,41.15],[-8.67,41.14]] },
  { name: 'Mondego', coordinates: [[-7.46,40.43],[-7.85,40.35],[-8.43,40.21],[-8.86,40.15]] },
  { name: 'Tejo', coordinates: [[-6.96,39.49],[-7.55,39.48],[-8.21,39.33],[-8.69,39.24],[-9.14,38.72]] },
  { name: 'Guadiana', coordinates: [[-7.0,39.0],[-7.15,38.55],[-7.25,38.0],[-7.42,37.52],[-7.4,37.18]] }
]);

export const REGION_LABELS = Object.freeze([
  { name: 'NORTH', coordinate: [-7.65, 41.47] },
  { name: 'CENTRE', coordinate: [-8.03, 40.18] },
  { name: 'LISBON & TAGUS', coordinate: [-8.72, 38.88] },
  { name: 'ALENTEJO', coordinate: [-7.75, 38.28] },
  { name: 'ALGARVE', coordinate: [-8.06, 37.18] }
]);

export function contourCoordinates(index) {
  const points = [];
  for (let step = 0; step <= 44; step += 1) {
    const lon = -9.65 + step / 44 * 3.55;
    const base = 37.05 + index * 0.22;
    const lat = base + Math.sin(step * 0.56 + index * 0.82) * 0.075 + Math.sin(step * 0.17) * 0.04;
    points.push([lon, lat]);
  }
  return points;
}
