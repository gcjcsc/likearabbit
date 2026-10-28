// Photo helpers: read the date a photo was taken, shrink it on the phone, and upload it with a thumbnail

export const photoUrl = (id, thumb = false) => `/api/photos/${id}${thumb ? "/thumb" : ""}`;

// The date in a JPEG's EXIF data (when the photo was taken), as YYYY-MM-DD, or "" if there isn't one
export const exifDate = async (file) => {
  try {
    const view = new DataView(await file.slice(0, 256 * 1024).arrayBuffer());
    if (view.getUint16(0) !== 0xffd8) return "";
    let offset = 2;
    while (offset + 10 < view.byteLength) {
      const marker = view.getUint16(offset);
      const length = view.getUint16(offset + 2);
      // APP1 segment starting "Exif"
      if (marker === 0xffe1 && view.getUint32(offset + 4) === 0x45786966) return tiffDate(view, offset + 10);
      if ((marker & 0xff00) !== 0xff00) return "";
      offset += 2 + length;
    }
  } catch {
    // Not a readable JPEG; the date is simply left for the person to fill in
  }
  return "";
};

const tiffDate = (view, start) => {
  const little = view.getUint16(start) === 0x4949;
  const u16 = (p) => view.getUint16(p, little);
  const u32 = (p) => view.getUint32(p, little);
  const findTag = (ifd, tag) => {
    for (let i = 0, n = u16(ifd); i < n; i++) if (u16(ifd + 2 + i * 12) === tag) return ifd + 2 + i * 12;
    return null;
  };
  const ifd0 = start + u32(start + 4);
  const exifPointer = findTag(ifd0, 0x8769);
  // DateTimeOriginal, else the plain DateTime
  const entry = (exifPointer && findTag(start + u32(exifPointer + 8), 0x9003)) || findTag(ifd0, 0x0132);
  if (!entry) return "";
  const at = start + u32(entry + 8);
  const text = String.fromCharCode(...Array.from({ length: 10 }, (_, i) => view.getUint8(at + i)));
  return /^\d{4}:\d{2}:\d{2}$/.test(text) && !text.startsWith("0000") ? text.replaceAll(":", "-") : "";
};

const toJpeg = (bitmap, maxSide, quality) => {
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = Object.assign(document.createElement("canvas"), {
    width: Math.round(bitmap.width * scale),
    height: Math.round(bitmap.height * scale),
  });
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => canvas.toBlob((blob) => resolve({ blob, width: canvas.width, height: canvas.height }), "image/jpeg", quality));
};

// A 1600 px copy (kept under the server's 1.8 MB limit) and a 400 px thumbnail, both upright
export const preparePhoto = async (file) => {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  let full = await toJpeg(bitmap, 1600, 0.82);
  if (full.blob.size > 1.7 * 1024 * 1024) full = await toJpeg(bitmap, 1280, 0.72);
  const thumb = await toJpeg(bitmap, 400, 0.72);
  return { full: full.blob, thumb: thumb.blob, width: full.width, height: full.height };
};

export const uploadPhoto = async (rabbitId, file, { takenOn = "", caption = "", kind = "photo" } = {}) => {
  const prepared = await preparePhoto(file);
  const form = new FormData();
  form.append("full", prepared.full, "photo.jpg");
  form.append("thumb", prepared.thumb, "thumb.jpg");
  form.append("taken_on", takenOn);
  form.append("caption", caption);
  form.append("kind", kind);
  form.append("width", prepared.width);
  form.append("height", prepared.height);
  const res = await fetch(`/api/rabbits/${rabbitId}/photos`, { method: "POST", body: form }).catch(() => {
    throw new Error("You're offline. Photos can't be added until you have a connection.");
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Upload failed (${res.status})`);
  return data;
};

// The main photo as a data URL, for drawing into the pedigree PDF
export const photoDataUrl = async (id) => {
  const blob = await (await fetch(photoUrl(id))).blob();
  const dataUrl = await new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(blob);
  });
  const bitmap = await createImageBitmap(blob);
  return { dataUrl, width: bitmap.width, height: bitmap.height };
};
