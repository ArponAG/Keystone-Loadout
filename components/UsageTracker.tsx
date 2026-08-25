'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

/**
 * Reports a page view to /api/track.
 *
 * Client-side rather than middleware because middleware runs on the Edge runtime, which
 * cannot open the SQLite database. `usePathname` covers client-side navigation too,
 * which a server-rendered hit counter would miss entirely once the app starts routing
 * without full page loads.
 */
export function UsageTracker() {
  const pathname = usePathname();
  const lastSent = useRef<string | null>(null);

  useEffect(() => {
    // React runs effects twice in development Strict Mode, and the deploy re-renders on
    // state changes; without this the same view is counted repeatedly.
    if (lastSent.current === pathname) return;
    lastSent.current = pathname;

    const screen = typeof window !== 'undefined' ? `${window.innerWidth}x${window.innerHeight}` : null;

    void fetch('/api/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: pathname, screen }),
      // The cookie is the identity, so it has to be sent even though this is same-origin
      // and would normally be included anyway - explicit beats implicit here.
      credentials: 'same-origin',
      keepalive: true,
    }).catch(() => {
      // Tracking must never surface to the reader. A failure means one missing row.
    });
  }, [pathname]);

  return null;
}
