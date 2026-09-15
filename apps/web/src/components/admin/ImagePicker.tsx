'use client';

import { useRef, useState } from 'react';
import Icon from '@/components/Icon';
import { adminApi } from '@/lib/api';
import { resolveImage } from '@/lib/images';
import { Spinner } from '@/components/ui';

/**
 * Pick a photo from the device, upload it and hand back the stored path.
 * The API re-encodes and resizes, so whoever is adding a menu item can just
 * choose the photo straight off their phone without thinking about size.
 */
export default function ImagePicker({ value, onChange, onError }: {
  value: string | null;
  onChange: (url: string | null) => void;
  onError?: (message: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const preview = resolveImage(value);

  const send = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      onError?.('Please choose a photo.');
      return;
    }
    setBusy(true);
    setNote(null);
    try {
      const { image } = await adminApi.uploadImage(file);
      onChange(image.url);
      const saved = Math.max(0, 100 - Math.round((image.storedBytes / image.originalBytes) * 100));
      setNote(
        `Resized to ${image.width}px wide · ${(image.storedBytes / 1024).toFixed(0)}KB`
        + (saved > 0 ? ` (${saved}% smaller)` : ''),
      );
    } catch (err) {
      onError?.(err instanceof Error ? err.message : 'That photo could not be uploaded');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const clear = async () => {
    const previous = value;
    onChange(null);
    setNote(null);
    // Best effort; saving the item also clears orphans server-side.
    if (previous?.startsWith('/uploads/')) await adminApi.deleteImage(previous).catch(() => {});
  };

  return (
    <div>
      <span className="label">Photo</span>

      <input ref={inputRef} type="file" accept="image/*" className="sr-only" onChange={(e) => send(e.target.files?.[0])} />

      {preview ? (
        <div className="flex items-center gap-3 rounded-2xl bg-ink-50 p-3 ring-1 ring-ink-200">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="" className="h-20 w-20 shrink-0 rounded-xl object-cover" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-ink-800">Photo added</p>
            {note && <p className="mt-0.5 text-xs text-ink-500">{note}</p>}
            <div className="mt-2 flex gap-2">
              <button type="button" onClick={() => inputRef.current?.click()} disabled={busy} className="btn-secondary btn-sm">
                Replace
              </button>
              <button type="button" onClick={clear} disabled={busy} className="btn-ghost btn-sm text-brand-600">
                Remove
              </button>
            </div>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); send(e.dataTransfer.files?.[0]); }}
          disabled={busy}
          className={`flex w-full flex-col items-center justify-center gap-2 rounded-2xl border border-dashed px-4 py-7 transition ${
            dragging ? 'border-brand-400 bg-brand-50' : 'border-ink-300 bg-white hover:bg-ink-50'
          }`}
        >
          {busy ? (
            <>
              <Spinner className="h-5 w-5" />
              <span className="text-sm font-medium text-ink-600">Uploading…</span>
            </>
          ) : (
            <>
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-ink-100 text-ink-500">
                <Icon name="plate" className="h-5 w-5" />
              </span>
              <span className="text-sm font-semibold text-ink-700">Choose a photo</span>
              <span className="text-xs text-ink-400">Drag one here, or take one on your phone</span>
            </>
          )}
        </button>
      )}

      <p className="mt-2 text-xs text-ink-400">
        JPEG, PNG, WebP or HEIC up to 8MB. We resize and compress it for you.
      </p>
    </div>
  );
}
