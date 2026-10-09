"use client";

import { useCallback, useRef, useState } from "react";
import { imageSrc } from "@/lib/images";

type Props = {
  title: string;
  imageUrl: string | null;
  iiifBaseUrl: string | null;
  backgroundColor: string | null;
  matted?: boolean;
};

const MIN_ZOOM = 1;
const MAX_ZOOM = 6;

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

/**
 * Image stage with click-to-zoom and drag-to-pan.
 *
 * When the source exposes a IIIF endpoint we swap in a larger derivative once
 * the viewer is zoomed, so brushstroke-level detail is available without
 * paying for a huge download on first paint.
 */
export const ArtworkViewer = ({
  title,
  imageUrl,
  iiifBaseUrl,
  backgroundColor,
  matted = false,
}: Props) => {
  const [zoom, setZoom] = useState(MIN_ZOOM);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragState = useRef<{ x: number; y: number } | null>(null);
  const didDrag = useRef(false);

  const zoomed = zoom > MIN_ZOOM;

  const reset = useCallback(() => {
    setZoom(MIN_ZOOM);
    setOffset({ x: 0, y: 0 });
  }, []);

  const toggleZoom = useCallback(() => {
    // A pan gesture ends with a click; ignore it so dragging never un-zooms.
    if (didDrag.current) {
      didDrag.current = false;
      return;
    }

    setZoom((current) => {
      if (current > MIN_ZOOM) {
        setOffset({ x: 0, y: 0 });
        return MIN_ZOOM;
      }
      return 2.5;
    });
  }, []);

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!zoomed) return;
    didDrag.current = false;
    dragState.current = { x: event.clientX - offset.x, y: event.clientY - offset.y };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const start = dragState.current;
    if (!start) return;
    const next = { x: event.clientX - start.x, y: event.clientY - start.y };
    if (Math.abs(next.x - offset.x) > 3 || Math.abs(next.y - offset.y) > 3) {
      didDrag.current = true;
    }
    setOffset(next);
  };

  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    dragState.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const onWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    setZoom((current) => clamp(current - event.deltaY * 0.01, MIN_ZOOM, MAX_ZOOM));
  };

  const source =
    zoomed && iiifBaseUrl
      ? imageSrc(`${iiifBaseUrl}/full/3000,/0/default.jpg`)
      : imageSrc(imageUrl);

  if (!source) {
    return (
      <div className="flex aspect-[4/3] items-center justify-center rounded-xl border border-border bg-surface text-sm text-muted">
        No image available for this work.
      </div>
    );
  }

  return (
    <div className="artwork-viewer">
      <div className={matted ? "artwork-mount" : undefined}>
        <div
          role="presentation"
          onWheel={onWheel}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          className={`artwork-viewer-stage relative overflow-hidden ${
            matted ? "border border-black/35" : "rounded-xl border border-border"
          } ${zoomed ? "cursor-grab active:cursor-grabbing" : "cursor-zoom-in"}`}
          style={{ backgroundColor: backgroundColor ?? "var(--surface)" }}
        >
          <button
            type="button"
            onClick={toggleZoom}
            aria-label={zoomed ? `Zoom out of ${title}` : `Zoom into ${title}`}
            className="block w-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={source}
              alt={title}
              draggable={false}
              className={`w-full select-none object-contain transition-transform duration-200 ${
                matted ? "max-h-[72vh]" : "max-h-[78vh]"
              }`}
              style={{
                transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`,
              }}
            />
          </button>

        </div>
      </div>

      <div className="mt-3 flex items-center gap-4 text-xs text-muted">
        <span>{zoomed ? "Drag to pan" : "Click the image to zoom"}</span>
        {zoomed && (
          <button
            type="button"
            onClick={reset}
            className="text-accent transition hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Reset view
          </button>
        )}
      </div>
    </div>
  );
};
