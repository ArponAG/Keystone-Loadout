'use client';

import { useEffect, useRef, useState } from 'react';

import type { Build } from '@/lib/domain/filters';
import { SECONDARY_LABEL, type SecondaryKey } from '@/lib/domain/stats';

type Order = Build['secondaryOrder'];

function move(order: readonly SecondaryKey[], from: number, to: number): Order {
  const next = [...order];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next as unknown as Order;
}

/**
 * Drag-to-rank list for the four secondaries.
 *
 * Pointer events rather than HTML5 drag-and-drop: the native API gives a ghost image
 * and no touch support, whereas this reorders the list live under the cursor, which is
 * what makes the ranking feel direct.
 *
 * Dragging mutates local state only. The URL — the real source of truth for the build —
 * is written once on drop, so a four-position drag is one navigation, not four.
 *
 * The arrow buttons are kept deliberately: drag is mouse-only, and this is the one
 * control on the page that carries real meaning.
 */
export function SecondaryRanker({
  order,
  onChange,
  disabled,
}: {
  order: Order;
  onChange: (next: Order) => void;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState<Order>(order);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const rowRefs = useRef<(HTMLLIElement | null)[]>([]);

  // Adopt external changes (arrow buttons, back/forward, a shared URL) unless a drag
  // is mid-flight, which would yank the list out from under the pointer.
  useEffect(() => {
    if (dragIndex === null) setDraft(order);
  }, [order, dragIndex]);

  function startDrag(index: number, event: React.PointerEvent<HTMLElement>) {
    if (disabled) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragIndex(index);
  }

  function onMove(event: React.PointerEvent) {
    if (dragIndex === null) return;

    // Swap as soon as the pointer enters another row's box — no drop indicator needed
    // because the list itself is already showing the result.
    for (let i = 0; i < draft.length; i += 1) {
      if (i === dragIndex) continue;
      const rect = rowRefs.current[i]?.getBoundingClientRect();
      if (!rect) continue;
      if (event.clientY >= rect.top && event.clientY <= rect.bottom) {
        setDraft((current) => move(current, dragIndex, i));
        setDragIndex(i);
        break;
      }
    }
  }

  function endDrag() {
    if (dragIndex === null) return;
    setDragIndex(null);
    if (draft.some((key, i) => key !== order[i])) onChange(draft);
  }

  function nudge(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= draft.length) return;
    onChange(move(draft, index, target));
  }

  return (
    <ol
      className="space-y-1 select-none"
      onPointerMove={onMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      {draft.map((key, index) => {
        const dragging = dragIndex === index;
        return (
          <li
            key={key}
            ref={(el) => {
              rowRefs.current[index] = el;
            }}
            className={`flex items-center gap-2 rounded-md border px-1.5 py-1 transition-colors ${
              dragging
                ? 'border-accent bg-raised shadow-lg'
                : 'border-transparent hover:border-line-strong hover:bg-raised/60'
            }`}
            style={{ touchAction: 'none' }}
          >
            <span
              onPointerDown={(e) => startDrag(index, e)}
              className={`px-0.5 text-ink-faint ${disabled ? '' : 'cursor-grab active:cursor-grabbing'}`}
              aria-hidden="true"
              title="Drag to reorder"
            >
              ⠿
            </span>

            <span className="tabular w-4 text-xs text-ink-faint">{index + 1}</span>

            <span
              onPointerDown={(e) => startDrag(index, e)}
              className={`min-w-[5.5rem] flex-1 text-sm text-ink ${disabled ? '' : 'cursor-grab active:cursor-grabbing'}`}
            >
              {SECONDARY_LABEL[key]}
            </span>

            <span className="flex gap-0.5">
              <Arrow
                label={`Move ${SECONDARY_LABEL[key]} up`}
                disabled={index === 0 || Boolean(disabled)}
                onClick={() => nudge(index, -1)}
              >
                ↑
              </Arrow>
              <Arrow
                label={`Move ${SECONDARY_LABEL[key]} down`}
                disabled={index === draft.length - 1 || Boolean(disabled)}
                onClick={() => nudge(index, 1)}
              >
                ↓
              </Arrow>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function Arrow({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="rounded-sm border border-line-strong bg-raised px-1.5 text-xs text-ink-soft transition-colors hover:text-accent disabled:cursor-not-allowed disabled:opacity-25 disabled:hover:text-ink-soft"
    >
      {children}
    </button>
  );
}
