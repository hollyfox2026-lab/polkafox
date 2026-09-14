export async function compressPhoto(file: Blob): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1080 / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    throw new Error("Canvas недоступен.");
  }
  context.fillStyle = "#f3ebe1";
  context.fillRect(0, 0, width, height);
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.82);
}
