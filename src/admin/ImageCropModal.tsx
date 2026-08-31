import { useEffect, useMemo, useRef, useState } from "react";
import {
  centerCropBox,
  clampCropBox,
  cropImageToFile,
  displayCropToNatural,
  fitImageDisplay,
  loadImageElement,
  maxSquareCropSize,
} from "../lib/cropImage";
import "./ImageCropModal.css";

const STAGE_MAX_W = 360;
const STAGE_MAX_H = 420;

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
  const [crop, setCrop] = useState({ x: 0, y: 0, size: 0 });
  const dragRef = useRef<{ x: number; y: number; cropX: number; cropY: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadImageElement(imageSrc).then((el) => {
      if (!cancelled) setImg(el);
    });
    return () => {
      cancelled = true;
    };
  }, [imageSrc]);

  const layout = useMemo(() => {
    if (!img) return null;
    const fit = fitImageDisplay(img.naturalWidth, img.naturalHeight, STAGE_MAX_W, STAGE_MAX_H);
    const maxCrop = maxSquareCropSize(fit.width, fit.height);
    const cropSize = Math.max(48, maxCrop / zoom);
    const centered = centerCropBox(fit.width, fit.height, cropSize);
    return { ...fit, maxCrop, cropSize, centered };
  }, [img, zoom]);

  useEffect(() => {
    if (!layout) return;
    setCrop((prev) => {
      const size = layout.cropSize;
      if (prev.size === 0) {
        return clampCropBox(
          layout.centered.x,
          layout.centered.y,
          size,
          layout.width,
          layout.height
        );
      }
      const cx = prev.x + prev.size / 2;
      const cy = prev.y + prev.size / 2;
      return clampCropBox(cx - size / 2, cy - size / 2, size, layout.width, layout.height);
    });
  }, [layout]);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || !layout) return;
      const next = clampCropBox(
        drag.cropX + (e.clientX - drag.x),
        drag.cropY + (e.clientY - drag.y),
        crop.size,
        layout.width,
        layout.height
      );
      setCrop(next);
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
  }, [layout, crop.size]);

  async function handleConfirm() {
    if (!img || !layout) return;
    const natural = displayCropToNatural(layout.scale, crop.x, crop.y, crop.size);
    const file = await cropImageToFile(img, natural, fileName);
    await onConfirm(file);
  }

  return (
    <div className="image-crop-backdrop" role="dialog" aria-modal="true" aria-label={title}>
      <div className="image-crop-modal">
        <div className="image-crop-head">
          <h3>{title}</h3>
          <p>
            A imagem inteira fica visível. Arraste o quadrado pontilhado para escolher o recorte 1:1.
          </p>
        </div>

        <div
          className="image-crop-stage"
          style={
            layout
              ? { width: layout.width, height: layout.height }
              : { width: STAGE_MAX_W, height: STAGE_MAX_H }
          }
        >
          {!img || !layout ? (
            <div className="image-crop-loading">Carregando…</div>
          ) : (
            <>
              <img
                src={imageSrc}
                alt=""
                draggable={false}
                className="image-crop-full"
                style={{ width: layout.width, height: layout.height }}
              />
              <div
                className="image-crop-box"
                style={{
                  width: crop.size,
                  height: crop.size,
                  transform: `translate(${crop.x}px, ${crop.y}px)`,
                }}
                onPointerDown={(e) => {
                  if (busy) return;
                  e.currentTarget.setPointerCapture(e.pointerId);
                  dragRef.current = {
                    x: e.clientX,
                    y: e.clientY,
                    cropX: crop.x,
                    cropY: crop.y,
                  };
                }}
              />
            </>
          )}
        </div>

        <label className="image-crop-zoom">
          <span>Zoom do recorte</span>
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
