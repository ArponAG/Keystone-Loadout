'use client';

import { useEffect, useRef, useState } from 'react';

import { SECONDARY_LABEL, type SecondaryKey } from '@/lib/domain/stats';

/**
 * Drag-to-rank chips for the four secondaries, laid out along the controls row.
 *
 * Separate from `SecondaryRanker` on purpose. That one is a vertical list with per-row
 * arrow buttons, sized for the /gear sidebar; this is a horizontal strip that has to sit
 * inline beside "Per slot" and "Source" without dominating them. Sharing one component
 * would mean an axis flag threaded through layout, hit-testing and the arrow controls,
 * for two places that genuinely look different. The drag logic is ~25 lines either way.
 *
 * Pointer events rather than HTML5 drag-and-drop: the native API gives a ghost image and
 * no touch support, whereas this reorders live under the cursor.
 *
 * Dragging is mouse-only, so clicking a chip promotes it to first. That keeps the
 * control usable from the keyboard — chips are real buttons — and gives the common case
 * ("I mostly care about Haste") a single click rather than a drag.
 */
export function SecondaryOrderChips({
  order,
  share,
  onChange,
  disabled,
}: {
  order: SecondaryKey[];
  /** Percentage of the character's own secondary rating, when it is known. */
  share?: Record<SecondaryKey, number> | null;
  onChange: (next: SecondaryKey[]) => void;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState<SecondaryKey[]>(order);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const chipRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const movedRef = useRef(false);

  // Adopt external changes — a new character, or a reset — unless a drag is mid-flight,
  // which would yank the strip out from under the pointer.
  useEffect(() => {
    if (dragIndex === null) setDraft(order);
  }, [order, dragIndex]);

  function startDrag(index: number, event: React.PointerEvent<HTMLButtonElement>) {
    if (disabled) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragIndex(index);
    movedRef.current = false;
  }

  function onMove(event: React.PointerEvent) {
    if (dragIndex === null) return;

    // Swap as soon as the pointer crosses into another chip's box. No drop indicator is
    // needed because the strip is already showing the result.
    for (let i = 0; i < draft.length; i += 1) {
      if (i === dragIndex) continue;
      const rect = chipRefs.current[i]?.getBoundingClientRect();
      if (!rect) continue;
      if (event.clientX >= rect.left && event.clientX <= rect.right) {
        setDraft((current) => {
          const next = [...current];
          const [moved] = next.splice(dragIndex, 1);
          next.splice(i, 0, moved);
          return next;
        });
        setDragIndex(i);
        movedRef.current = true;
        break;
      }
    }
  }

  function endDrag() {
    if (dragIndex === null) return;
    setDragIndex(null);
    // One update per drop, not one per swap: each change re-queries the server.
    if (draft.some((key, i) => key !== order[i])) onChange(draft);
  }

  function promote(index: number) {
    // Suppressed after a drag, or the pointerup that ends a drag would also fire click
    // and yank the chip the reader just placed straight to the front.
    if (disabled || movedRef.current) return;
    if (index === 0) return;
    const next = [...draft];
    const [moved] = next.splice(index, 1);
    next.unshift(moved);
    onChange(next);
  }

  return (
    <span
      className="flex flex-wrap gap-1"
      onPointerMove={onMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      {draft.map((key, index) => {
        const dragging = dragIndex === index;
        return (
          <button
            key={key}
            type="button"
            ref={(el) => {
              chipRefs.current[index] = el;
            }}
            onPointerDown={(e) => startDrag(index, e)}
            onClick={() => promote(index)}
            disabled={disabled}
            title={
              index === 0
                ? `${SECONDARY_LABEL[key]} is ranked first. Drag to rearrange.`
                : `Click to rank ${SECONDARY_LABEL[key]} first, or drag to rearrange.`
            }
            style={{ touchAction: 'none' }}
            className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors select-none ${
              disabled ? '' : 'cursor-grab active:cursor-grabbing'
            } ${dragging ? 'bg-raised text-ink shadow-lg' : ''} ${
              !dragging && index === 0
                ? 'bg-accent-muted/45 text-accent'
                : !dragging
                  ? 'bg-raised text-ink-soft hover:text-ink'
                  : ''
            }`}
          >
            <span aria-hidden="true" className="text-ink-faint">
              ⠿
            </span>
            {SECONDARY_LABEL[key]}
            {share ? <span className="tabular opacity-70">{share[key]}%</span> : null}
          </button>
        );
      })}
    </span>
  );
}
