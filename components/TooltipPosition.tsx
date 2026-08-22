'use client';

import { useEffect } from 'react';

/**
 * Make Wowhead tooltips follow the cursor.
 *
 * By default the embed anchors the tooltip to the link's right edge and bottom-aligns
 * it to the link's top. That is fine for an inline link, but our character-page item
 * names are `block truncate` — the box spans the whole grid cell, so the tooltip lands
 * hundreds of pixels away from the pointer.
 *
 * Rather than reshaping every link to hug its text, reposition the tooltip itself.
 * The listener is added after the embed's own, so it wins on the same event, and it
 * does nothing at all while no tooltip is visible.
 */
const OFFSET = 18;
const EDGE = 8;

export function TooltipPosition() {
  useEffect(() => {
    function onMove(event: MouseEvent) {
      const tips = document.querySelectorAll<HTMLElement>('.wowhead-tooltip');

      for (const tip of tips) {
        // The embed parks its spare tooltip at -1000px; skip anything not on screen.
        if (tip.offsetWidth === 0 || tip.offsetHeight === 0) continue;
        if (getComputedStyle(tip).visibility === 'hidden') continue;

        const w = tip.offsetWidth;
        const h = tip.offsetHeight;

        let x = event.clientX + OFFSET;
        let y = event.clientY + OFFSET;

        // Flip left / clamp up rather than letting it run off screen.
        if (x + w > window.innerWidth - EDGE) x = Math.max(EDGE, event.clientX - w - OFFSET);
        if (y + h > window.innerHeight - EDGE) y = Math.max(EDGE, window.innerHeight - h - EDGE);

        // The tooltip is position:absolute on <body>, so it needs page coordinates.
        tip.style.left = `${x + window.scrollX}px`;
        tip.style.top = `${y + window.scrollY}px`;
      }
    }

    document.addEventListener('mousemove', onMove, { passive: true });
    return () => document.removeEventListener('mousemove', onMove);
  }, []);

  return null;
}
