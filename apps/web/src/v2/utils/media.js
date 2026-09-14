function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('evidence_file_read_failed'));
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.readAsDataURL(file);
  });
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('evidence_image_decode_failed'));
    image.src = url;
  });
}

function canvasData(canvas, quality) {
  return canvas.toDataURL('image/jpeg', quality);
}

function estimateBytes(dataUrl) {
  const encoded = String(dataUrl).split(',')[1] ?? '';
  return Math.ceil(encoded.length * 0.75);
}

export async function prepareEvidenceImage(file, { maxSide = 1280, maxBytes = 680_000 } = {}) {
  if (!(file instanceof File) || !file.size) throw new Error('evidence_photo_required');
  if (!String(file.type).startsWith('image/')) throw new Error('evidence_photo_must_be_image');
  const source = await readAsDataUrl(file);
  const image = await loadImage(source);
  const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);

  let quality = 0.82; let dataUrl = canvasData(canvas, quality);
  while (estimateBytes(dataUrl) > maxBytes && quality > 0.48) {
    quality -= 0.08;
    dataUrl = canvasData(canvas, quality);
  }
  const size = estimateBytes(dataUrl);
  if (size > maxBytes) throw new Error('evidence_photo_too_large_after_compression');
  return { id: `evidence:${crypto.randomUUID()}`, type: 'image', name: file.name || 'evidence.jpg', url: dataUrl, size };
}
