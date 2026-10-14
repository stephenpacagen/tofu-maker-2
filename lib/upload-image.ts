// Hosts such as Vercel reject the whole multipart body over about 4.5MB with a
// non-JSON 413, before the route runs. A chunk can carry a style reference, a
// format reference, a product photo, and (on regenerate) the current ad plus an
// extra image, so each file has to stay well under that cap.
const MAX_UPLOAD_BYTES = 700 * 1024;
const MAX_EDGE = 1536;

const pending = new WeakMap<File, Promise<File>>();

/** Shrinks an image for upload. Already-small files are left untouched. */
export function fileForUpload(file: File): Promise<File> {
  const cached = pending.get(file);
  if (cached) return cached;
  const job = shrink(file).catch(() => file);
  pending.set(file, job);
  return job;
}

/** Drops a repeated field (the same reference used as both style and format) and shrinks the rest. */
export async function filesForUpload(items: { name: string; file: File }[]) {
  const seen = new Set<string>();
  const unique = items.filter((item) => {
    if (seen.has(item.name)) return false;
    seen.add(item.name);
    return true;
  });
  return Promise.all(
    unique.map(async (item) => ({ name: item.name, file: await fileForUpload(item.file) })),
  );
}

function jpegName(name: string) {
  const base = name.replace(/\.[^.]+$/, "") || "image";
  return `${base}.jpg`;
}

async function encodeJpeg(source: ImageBitmap, width: number, height: number, quality: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is unavailable");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(source, 0, 0, width, height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
  if (!blob) throw new Error("Could not encode image");
  return blob;
}

async function shrink(file: File): Promise<File> {
  if (file.size <= MAX_UPLOAD_BYTES || file.type === "image/svg+xml" || !file.type.startsWith("image/")) {
    return file;
  }
  const bitmap = await createImageBitmap(file);
  try {
    let width = bitmap.width;
    let height = bitmap.height;
    const edge = Math.max(width, height);
    if (edge > MAX_EDGE) {
      const scale = MAX_EDGE / edge;
      width = Math.max(1, Math.round(width * scale));
      height = Math.max(1, Math.round(height * scale));
    }

    let best: Blob | null = null;
    for (let attempt = 0; attempt < 4; attempt++) {
      for (const quality of [0.86, 0.72, 0.58]) {
        const blob = await encodeJpeg(bitmap, width, height, quality);
        if (!best || blob.size < best.size) best = blob;
        if (blob.size <= MAX_UPLOAD_BYTES) {
          return new File([blob], jpegName(file.name), { type: "image/jpeg" });
        }
      }
      width = Math.max(1, Math.round(width * 0.75));
      height = Math.max(1, Math.round(height * 0.75));
    }
    if (best && best.size < file.size) return new File([best], jpegName(file.name), { type: "image/jpeg" });
    return file;
  } finally {
    bitmap.close();
  }
}
