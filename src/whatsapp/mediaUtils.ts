/** Limite WhatsApp Cloud API para vídeo (~16 MB). */
export const MAX_VIDEO_BYTES = 16 * 1024 * 1024;

const EXT_MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heif",
  mp4: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
  m4v: "video/mp4",
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  ogg: "audio/ogg",
  wav: "audio/wav",
  pdf: "application/pdf",
};

export type MediaKind = "image" | "audio" | "video" | "document";

export function mediaKindOf(file: File): MediaKind {
  const type = (file.type || guessMimeFromName(file.name)).toLowerCase();
  if (type.startsWith("image/")) return "image";
  if (type.startsWith("audio/")) return "audio";
  if (type.startsWith("video/")) return "video";
  return "document";
}

export function guessMimeFromName(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return EXT_MIME[ext] ?? "";
}

/** Corrige MIME vazio (comum em galeria mobile). */
export function normalizeMediaFile(file: File): File {
  if (file.type) return file;
  const mime = guessMimeFromName(file.name);
  if (!mime) return file;
  return new File([file], file.name, { type: mime, lastModified: file.lastModified });
}

export function mediaKindLabel(kind: MediaKind): string {
  if (kind === "image") return "imagem";
  if (kind === "video") return "vídeo";
  if (kind === "audio") return "áudio";
  return "arquivo";
}

export function validateMediaFile(file: File): string | null {
  const kind = mediaKindOf(file);
  if (kind === "video" && file.size > MAX_VIDEO_BYTES) {
    const mb = (file.size / (1024 * 1024)).toFixed(1);
    return `Vídeo muito grande (${mb} MB). O máximo é 16 MB — grave um trecho mais curto ou escolha outro arquivo.`;
  }
  return null;
}

export function pickVideoRecorderMime(): string {
  const candidates = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
    "video/mp4",
  ];
  if (typeof MediaRecorder === "undefined") return "";
  return candidates.find((m) => MediaRecorder.isTypeSupported(m)) ?? "";
}

export function extensionForMime(mime: string): string {
  if (mime.includes("mp4")) return "mp4";
  if (mime.includes("webm")) return "webm";
  if (mime.includes("quicktime")) return "mov";
  return "webm";
}
