export function requireObject(value, label = 'body') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${label}_must_be_object`);
  return value;
}

export function requireText(value, label, { max = 240 } = {}) {
  const text = String(value ?? '').trim();
  if (!text) throw new TypeError(`${label}_is_required`);
  if (text.length > max) throw new TypeError(`${label}_too_long`);
  if(text.includes('\u0000'))throw Object.assign(new TypeError(`${label}_contains_database_invalid_text`),{statusCode:400});
  return text;
}

export function requireCoordinate(value) {
  if (!Array.isArray(value) || value.length < 2) throw new TypeError('coordinate_is_required');
  const coordinate = value.slice(0, 2).map(Number);
  if (!coordinate.every(Number.isFinite)) throw new TypeError('coordinate_is_invalid');
  const [lon, lat] = coordinate;
  if (lon < -10.8 || lon > -5 || lat < 35.5 || lat > 43.5) throw new TypeError('coordinate_outside_portugal_context');
  return coordinate;
}
