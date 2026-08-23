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
    // Last known cursor position in CLIENT coordinates. Scrolling does not move the
    // cursor within the viewport, so these stay valid across a scroll — which is what
    // lets the scroll handler re-place the tooltip without a mouse event to read from.
    let clientX = -1;
    let clientY = -1;

    function place() {
      if (clientX < 0) return;

      const tips = document.querySelectorAll<HTMLElement>('.wowhead-tooltip');

      for (const tip of tips) {
        // The embed parks its spare tooltip at -1000px; skip anything not on screen.
        if (tip.offsetWidth === 0 || tip.offsetHeight === 0) continue;
        if (getComputedStyle(tip).visibility === 'hidden') continue;

        const w = tip.offsetWidth;
        const h = tip.offsetHeight;

        let x = clientX + OFFSET;
        let y = clientY + OFFSET;

        // Flip left / clamp up rather than letting it run off screen.
        if (x + w > window.innerWidth - EDGE) x = Math.max(EDGE, clientX - w - OFFSET);
        if (y + h > window.innerHeight - EDGE) y = Math.max(EDGE, window.innerHeight - h - EDGE);

        // The tooltip is position:absolute on <body>, so it needs page coordinates.
        tip.style.left = `${x + window.scrollX}px`;
        tip.style.top = `${y + window.scrollY}px`;
      }
    }

    function onMove(event: MouseEvent) {
      clientX = event.clientX;
      clientY = event.clientY;
      place();
    }

    /*
      Scrolling has to re-place the tooltip too, and this is not a nicety.

      With the cursor held still, a scroll slides a DIFFERENT item under it. The embed
      duly swaps in that item's tooltip — but no mousemove fires, so without this the
      tooltip keeps the page coordinates it was given before the scroll and strands
      itself mid-page, covering unrelated rows while describing an item the cursor is
      no longer near.

      rAF-coalesced because scroll fires far faster than the page can paint, and every
      call here reads offsetWidth/offsetHeight, which forces layout.
    */
    let frame = 0;
    function onScroll() {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        place();
      });
    }

    document.addEventListener('mousemove', onMove, { passive: true });
    window.addEventListener('scroll', onScroll, { passive: true });

    return () => {
      document.removeEventListener('mousemove', onMove);
      window.removeEventListener('scroll', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return null;
}
