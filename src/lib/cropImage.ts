export async function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Não foi possível carregar a imagem"));
    img.crossOrigin = "anonymous";
    img.src = src;
  });
}

export async function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  try {
    return await loadImageElement(url);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export type CropRect = { x: number; y: number; size: number };

/** Calcula recorte 1:1 em pixels da imagem original. */
export function computeSquareCrop(
  imgW: number,
  imgH: number,
  viewSize: number,
  zoom: number,
  panX: number,
  panY: number
): CropRect {
  const baseScale = viewSize / Math.min(imgW, imgH);
  const scale = baseScale * zoom;
  const dispW = imgW * scale;
  const dispH = imgH * scale;
  const imgLeft = (viewSize - dispW) / 2 + panX;
  const imgTop = (viewSize - dispH) / 2 + panY;

  let cropX = (0 - imgLeft) / scale;
  let cropY = (0 - imgTop) / scale;
  let cropSize = viewSize / scale;

  cropSize = Math.min(cropSize, imgW, imgH);
  cropX = Math.max(0, Math.min(cropX, imgW - cropSize));
  cropY = Math.max(0, Math.min(cropY, imgH - cropSize));

  return { x: cropX, y: cropY, size: cropSize };
}

export async function cropImageToFile(
  image: HTMLImageElement,
  crop: CropRect,
  fileName: string,
  outputSize = 1080
): Promise<File> {
  const canvas = document.createElement("canvas");
  canvas.width = outputSize;
  canvas.height = outputSize;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas indisponível");

  ctx.drawImage(image, crop.x, crop.y, crop.size, crop.size, 0, 0, outputSize, outputSize);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Falha ao gerar imagem"))),
      "image/jpeg",
      0.92
    );
  });

  const safeName = fileName.replace(/\.\w+$/, "") || "catalog-photo";
  return new File([blob], `${safeName}.jpg`, { type: "image/jpeg" });
}
