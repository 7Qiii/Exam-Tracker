export async function compressImage(file, options = {}) {
  const maxSize = options.maxSize || 1600;
  const quality = options.quality || 0.82;
  const bitmap = await createImageBitmap(file);
  const ratio = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * ratio);
  const height = Math.round(bitmap.height * ratio);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(bitmap, 0, 0, width, height);

  const blob = await new Promise((resolve) => {
    canvas.toBlob(resolve, "image/webp", quality);
  });

  const safeName = file.name.replace(/\.[^.]+$/, "") || "mistake-image";
  return {
    file: new File([blob], `${safeName}.webp`, { type: "image/webp" }),
    width,
    height
  };
}
