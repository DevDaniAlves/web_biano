import { useCallback, useEffect, useRef, useState } from "react";
import { ImageCropModal } from "./ImageCropModal";
import "./CatalogPhotoPicker.css";
import "./ImageCropModal.css";

export type PendingPhoto = {
  id: string;
  file: File;
  previewUrl: string;
};

export function pendingPhotosToFiles(photos: PendingPhoto[]): File[] {
  return photos.map((p) => p.file);
}

export function revokePendingPhotos(photos: PendingPhoto[]) {
  for (const p of photos) URL.revokeObjectURL(p.previewUrl);
}

type CarouselItem = {
  id: string;
  src: string;
};

type CropState = {
  src: string;
  fileName: string;
  mode: "add" | "replace-pending" | "replace-saved";
  pendingId?: string;
  savedImageId?: string;
  revokeOnClose?: boolean;
};

function PhotoCarousel({
  items,
  idx,
  onIdxChange,
  compact,
  label,
  onCrop,
  cropDisabled,
}: {
  items: CarouselItem[];
  idx: number;
  onIdxChange: (i: number) => void;
  compact?: boolean;
  label?: string;
  onCrop?: () => void;
  cropDisabled?: boolean;
}) {
  if (!items.length) return null;
  const safeIdx = Math.min(idx, items.length - 1);
  const current = items[safeIdx];

  return (
    <div className={`catalog-photo-carousel${compact ? " compact" : ""}`}>
      <div className="catalog-photo-carousel-stage">
        <img src={current.src} alt={label ?? `Foto ${safeIdx + 1}`} />
        {items.length > 1 && (
          <>
            <button
              type="button"
              className="catalog-photo-carousel-nav prev"
              aria-label="Foto anterior"
              onClick={() => onIdxChange((safeIdx - 1 + items.length) % items.length)}
            >
              ‹
            </button>
            <button
              type="button"
              className="catalog-photo-carousel-nav next"
              aria-label="Próxima foto"
              onClick={() => onIdxChange((safeIdx + 1) % items.length)}
            >
              ›
            </button>
            <span className="catalog-photo-carousel-badge">
              {safeIdx + 1}/{items.length}
            </span>
          </>
        )}
      </div>
      {onCrop && (
        <button
          type="button"
          className="catalog-photo-crop-btn"
          disabled={cropDisabled}
          onClick={onCrop}
        >
          Recortar 1:1
        </button>
      )}
      {items.length > 1 && (
        <div className="catalog-photo-dots">
          {items.map((item, i) => (
            <button
              key={item.id}
              type="button"
              className={i === safeIdx ? "on" : ""}
              aria-label={`Foto ${i + 1}`}
              onClick={() => onIdxChange(i)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function PhotoStrip({
  items,
  activeIdx,
  onSelect,
  onMoveLeft,
  onMoveRight,
  onRemove,
  disabled,
}: {
  items: CarouselItem[];
  activeIdx: number;
  onSelect: (i: number) => void;
  onMoveLeft: (i: number) => void;
  onMoveRight: (i: number) => void;
  onRemove: (i: number) => void;
  disabled?: boolean;
}) {
  if (!items.length) return null;

  return (
    <div className="catalog-photo-strip">
      {items.map((item, i) => (
        <div
          key={item.id}
          className={`catalog-photo-strip-item${i === activeIdx ? " active" : ""}`}
        >
          <button type="button" className="catalog-photo-strip-thumb" onClick={() => onSelect(i)}>
            <img src={item.src} alt="" />
            <span className="catalog-photo-strip-num">{i + 1}</span>
          </button>
          <div className="catalog-photo-strip-controls">
            <button
              type="button"
              disabled={disabled || i === 0}
              aria-label="Mover para esquerda"
              onClick={() => onMoveLeft(i)}
            >
              ←
            </button>
            <button
              type="button"
              disabled={disabled || i === items.length - 1}
              aria-label="Mover para direita"
              onClick={() => onMoveRight(i)}
            >
              →
            </button>
            <button
              type="button"
              className="del"
              disabled={disabled}
              aria-label="Remover foto"
              onClick={() => onRemove(i)}
            >
              ×
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function AddPhotoButtons({
  disabled,
  maxReached,
  onPick,
}: {
  disabled?: boolean;
  maxReached?: boolean;
  onPick: (file: File) => void;
}) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  const pick = (file: File | undefined) => {
    if (!file || disabled || maxReached) return;
    onPick(file);
  };

  return (
    <div className="catalog-photo-actions">
      <label className={`catalog-photo-btn camera${disabled || maxReached ? " disabled" : ""}`}>
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          disabled={disabled || maxReached}
          onChange={(e) => {
            pick(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <span className="catalog-photo-btn-icon" aria-hidden>
          📷
        </span>
        Tirar foto
      </label>
      <label className={`catalog-photo-btn gallery${disabled || maxReached ? " disabled" : ""}`}>
        <input
          ref={galleryRef}
          type="file"
          accept="image/*"
          disabled={disabled || maxReached}
          onChange={(e) => {
            pick(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <span className="catalog-photo-btn-icon" aria-hidden>
          🖼
        </span>
        Galeria
      </label>
      {maxReached && <span className="catalog-photo-limit">Limite de fotos atingido</span>}
    </div>
  );
}

function moveItem<T>(list: T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length || from === to) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/** Seletor de fotos locais (antes de criar o produto). */
export function CatalogPhotoPicker({
  photos,
  onChange,
  disabled,
  maxPhotos = 12,
}: {
  photos: PendingPhoto[];
  onChange: (photos: PendingPhoto[]) => void;
  disabled?: boolean;
  maxPhotos?: number;
}) {
  const [idx, setIdx] = useState(0);
  const [crop, setCrop] = useState<CropState | null>(null);
  const [cropBusy, setCropBusy] = useState(false);

  useEffect(() => {
    if (idx >= photos.length && photos.length > 0) setIdx(photos.length - 1);
  }, [photos.length, idx]);

  const closeCrop = useCallback(() => {
    setCrop((current) => {
      if (current?.revokeOnClose) URL.revokeObjectURL(current.src);
      return null;
    });
  }, []);

  const addCroppedFile = useCallback(
    (file: File) => {
      if (photos.length >= maxPhotos) return;
      const pending: PendingPhoto = {
        id: crypto.randomUUID(),
        file,
        previewUrl: URL.createObjectURL(file),
      };
      onChange([...photos, pending]);
      setIdx(photos.length);
    },
    [photos, onChange, maxPhotos]
  );

  const replacePendingFile = useCallback(
    (pendingId: string, file: File) => {
      const i = photos.findIndex((p) => p.id === pendingId);
      if (i < 0) return;
      const old = photos[i];
      URL.revokeObjectURL(old.previewUrl);
      const next = [...photos];
      next[i] = {
        id: old.id,
        file,
        previewUrl: URL.createObjectURL(file),
      };
      onChange(next);
      setIdx(i);
    },
    [photos, onChange]
  );

  const removeAt = (i: number) => {
    const removed = photos[i];
    if (removed) URL.revokeObjectURL(removed.previewUrl);
    const next = photos.filter((_, j) => j !== i);
    onChange(next);
    setIdx((cur) => Math.min(cur, Math.max(0, next.length - 1)));
  };

  const items: CarouselItem[] = photos.map((p) => ({ id: p.id, src: p.previewUrl }));
  const current = photos[idx];

  return (
    <div className="catalog-photo-picker">
      <div className="catalog-photo-picker-head">
        <strong>Fotos</strong>
        <span className="catalog-photo-picker-hint">
          Formato quadrado 1:1 — ajuste o recorte após tirar ou escolher da galeria
        </span>
      </div>
      {items.length > 0 && (
        <PhotoCarousel
          items={items}
          idx={idx}
          onIdxChange={setIdx}
          label="Pré-visualização"
          cropDisabled={disabled || cropBusy}
          onCrop={
            current
              ? () =>
                  setCrop({
                    src: current.previewUrl,
                    fileName: current.file.name,
                    mode: "replace-pending",
                    pendingId: current.id,
                  })
              : undefined
          }
        />
      )}
      <AddPhotoButtons
        disabled={disabled || cropBusy}
        maxReached={photos.length >= maxPhotos}
        onPick={(file) =>
          setCrop({
            src: URL.createObjectURL(file),
            fileName: file.name,
            mode: "add",
            revokeOnClose: true,
          })
        }
      />
      <PhotoStrip
        items={items}
        activeIdx={idx}
        onSelect={setIdx}
        disabled={disabled || cropBusy}
        onMoveLeft={(i) => {
          const next = moveItem(photos, i, i - 1);
          onChange(next);
          setIdx(Math.max(0, i - 1));
        }}
        onMoveRight={(i) => {
          const next = moveItem(photos, i, i + 1);
          onChange(next);
          setIdx(Math.min(next.length - 1, i + 1));
        }}
        onRemove={removeAt}
      />

      {crop && (
        <ImageCropModal
          imageSrc={crop.src}
          fileName={crop.fileName}
          busy={cropBusy}
          onCancel={closeCrop}
          onConfirm={async (file) => {
            setCropBusy(true);
            try {
              if (crop.mode === "add") addCroppedFile(file);
              else if (crop.mode === "replace-pending" && crop.pendingId) {
                replacePendingFile(crop.pendingId, file);
              }
              closeCrop();
            } finally {
              setCropBusy(false);
            }
          }}
        />
      )}
    </div>
  );
}

export type ProductImageRow = { id: string; imageUrl: string; sortOrder: number };

/** Fotos de produto já salvas — upload, remoção e reordenação. */
export function CatalogProductPhotos({
  productId,
  images,
  mediaSrc,
  disabled,
  uploading,
  onUpload,
  onDelete,
  onReorder,
  onReplace,
}: {
  productId: string;
  images: ProductImageRow[];
  mediaSrc: (url: string) => string;
  disabled?: boolean;
  uploading?: boolean;
  onUpload: (productId: string, file: File) => Promise<void>;
  onDelete: (productId: string, imageId: string) => Promise<void>;
  onReorder: (productId: string, imageIds: string[]) => Promise<void>;
  onReplace: (productId: string, imageId: string, file: File) => Promise<void>;
}) {
  const [idx, setIdx] = useState(0);
  const [busy, setBusy] = useState(false);
  const [crop, setCrop] = useState<CropState | null>(null);
  const sorted = [...images].sort((a, b) => a.sortOrder - b.sortOrder);

  useEffect(() => {
    if (idx >= sorted.length && sorted.length > 0) setIdx(sorted.length - 1);
  }, [sorted.length, idx]);

  const items: CarouselItem[] = sorted.map((img) => ({
    id: img.id,
    src: mediaSrc(img.imageUrl),
  }));

  const current = sorted[idx];

  const reorder = async (from: number, to: number) => {
    if (to < 0 || to >= sorted.length || from === to || busy) return;
    const next = moveItem(sorted, from, to);
    setBusy(true);
    try {
      await onReorder(productId, next.map((i) => i.id));
      setIdx(to);
    } finally {
      setBusy(false);
    }
  };

  const closeCrop = () => {
    setCrop((currentCrop) => {
      if (currentCrop?.revokeOnClose) URL.revokeObjectURL(currentCrop.src);
      return null;
    });
  };

  const removeAt = async (i: number) => {
    const img = sorted[i];
    if (!img || busy) return;
    setBusy(true);
    try {
      await onDelete(productId, img.id);
      setIdx((cur) => Math.min(cur, Math.max(0, sorted.length - 2)));
    } finally {
      setBusy(false);
    }
  };

  const isDisabled = disabled || busy || uploading;

  return (
    <div className="catalog-photo-picker compact-mode">
      {items.length > 0 && (
        <PhotoCarousel
          items={items}
          idx={idx}
          onIdxChange={setIdx}
          compact
          cropDisabled={isDisabled}
          onCrop={
            current
              ? () =>
                  setCrop({
                    src: mediaSrc(current.imageUrl),
                    fileName: `catalog-${current.id}.jpg`,
                    mode: "replace-saved",
                    savedImageId: current.id,
                  })
              : undefined
          }
        />
      )}
      <AddPhotoButtons
        disabled={isDisabled}
        maxReached={sorted.length >= 12}
        onPick={(file) =>
          setCrop({
            src: URL.createObjectURL(file),
            fileName: file.name,
            mode: "add",
            revokeOnClose: true,
          })
        }
      />
      {(uploading || busy) && <span className="catalog-photo-uploading">Enviando…</span>}
      <PhotoStrip
        items={items}
        activeIdx={idx}
        onSelect={setIdx}
        disabled={isDisabled}
        onMoveLeft={(i) => void reorder(i, i - 1)}
        onMoveRight={(i) => void reorder(i, i + 1)}
        onRemove={(i) => void removeAt(i)}
      />

      {crop && (
        <ImageCropModal
          imageSrc={crop.src}
          fileName={crop.fileName}
          busy={busy || uploading}
          onCancel={closeCrop}
          onConfirm={async (file) => {
            setBusy(true);
            try {
              if (crop.mode === "add") {
                await onUpload(productId, file);
                setIdx(sorted.length);
              } else if (crop.mode === "replace-saved" && crop.savedImageId) {
                await onReplace(productId, crop.savedImageId, file);
              }
              closeCrop();
            } finally {
              setBusy(false);
            }
          }}
        />
      )}
    </div>
  );
}
