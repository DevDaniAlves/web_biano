import { useEffect, useRef, useState } from "react";
import {
  computeSquareCrop,
  cropImageToFile,
  loadImageElement,
} from "../lib/cropImage";
import "./ImageCropModal.css";

const VIEW_SIZE = 320;

export function ImageCropModal({
  imageSrc,
  fileName,
  title = "Ajustar recorte 1:1",
  busy,
  onConfirm,
  onCancel,
}: {
  imageSrc: string;
  fileName: string;
  title?: string;
  busy?: boolean;
  onConfirm: (file: File) => void | Promise<void>;
  onCancel: () => void;
}) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadImageElement(imageSrc).then((el) => {
      if (!cancelled) setImg(el);
    });
    return () => {
      cancelled = true;
    };
  }, [imageSrc]);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      setPan({
        x: drag.panX + (e.clientX - drag.x),
        y: drag.panY + (e.clientY - drag.y),
      });
    };
    const onUp = () => {
      dragRef.current = null;
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, []);

  const baseScale = img ? VIEW_SIZE / Math.min(img.naturalWidth, img.naturalHeight) : 1;
  const scale = baseScale * zoom;
  const dispW = img ? img.naturalWidth * scale : 0;
  const dispH = img ? img.naturalHeight * scale : 0;
  const imgLeft = (VIEW_SIZE - dispW) / 2 + pan.x;
  const imgTop = (VIEW_SIZE - dispH) / 2 + pan.y;

  async function handleConfirm() {
    if (!img) return;
    const crop = computeSquareCrop(
      img.naturalWidth,
      img.naturalHeight,
      VIEW_SIZE,
      zoom,
      pan.x,
      pan.y
    );
    const file = await cropImageToFile(img, crop, fileName);
    await onConfirm(file);
  }

  return (
    <div className="image-crop-backdrop" role="dialog" aria-modal="true" aria-label={title}>
      <div className="image-crop-modal">
        <div className="image-crop-head">
          <h3>{title}</h3>
          <p>Arraste para posicionar e use o zoom. O quadrado central será a foto do catálogo.</p>
        </div>

        <div
          className="image-crop-viewport"
          style={{ width: VIEW_SIZE, height: VIEW_SIZE }}
          onPointerDown={(e) => {
            if (!img || busy) return;
            e.currentTarget.setPointerCapture(e.pointerId);
            dragRef.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
          }}
        >
          {!img ? (
            <div className="image-crop-loading">Carregando…</div>
          ) : (
            <img
              src={imageSrc}
              alt=""
              draggable={false}
              style={{
                width: img.naturalWidth,
                height: img.naturalHeight,
                transform: `translate(${imgLeft}px, ${imgTop}px) scale(${scale})`,
                transformOrigin: "top left",
              }}
            />
          )}
          <div className="image-crop-frame" aria-hidden />
        </div>

        <label className="image-crop-zoom">
          <span>Zoom</span>
          <input
            type="range"
            min={1}
            max={3}
            step={0.01}
            value={zoom}
            disabled={!img || busy}
            onChange={(e) => setZoom(Number(e.target.value))}
          />
        </label>

        <div className="image-crop-actions">
          <button type="button" className="ghost" disabled={busy} onClick={onCancel}>
            Cancelar
          </button>
          <button type="button" disabled={!img || busy} onClick={() => void handleConfirm()}>
            {busy ? "Salvando…" : "Usar recorte"}
          </button>
        </div>
      </div>
    </div>
  );
}
