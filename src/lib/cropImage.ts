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

export function fitImageDisplay(
  imgW: number,
  imgH: number,
  maxW: number,
  maxH: number
): { scale: number; width: number; height: number } {
  const scale = Math.min(maxW / imgW, maxH / imgH);
  return { scale, width: imgW * scale, height: imgH * scale };
}

export function maxSquareCropSize(dispW: number, dispH: number): number {
  return Math.min(dispW, dispH);
}

export function centerCropBox(dispW: number, dispH: number, size: number) {
  return {
    x: Math.max(0, (dispW - size) / 2),
    y: Math.max(0, (dispH - size) / 2),
  };
}

export function clampCropBox(
  x: number,
  y: number,
  size: number,
  dispW: number,
  dispH: number
) {
  return {
    x: Math.max(0, Math.min(x, dispW - size)),
    y: Math.max(0, Math.min(y, dispH - size)),
    size,
  };
}

/** Converte recorte na tela (px) para pixels da imagem original. */
export function displayCropToNatural(
  scale: number,
  cropX: number,
  cropY: number,
  cropSize: number
): CropRect {
  return {
    x: cropX / scale,
    y: cropY / scale,
    size: cropSize / scale,
  };
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
