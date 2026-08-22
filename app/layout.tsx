import type { Metadata } from 'next';
import Script from 'next/script';

import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader } from '@/components/SiteHeader';

import './globals.css';

export const metadata: Metadata = {
  title: 'Keystone Loadout',
  description: 'Personal WoW Retail companion — gear fit, loot tables, character lookup, news.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col">
        <SiteHeader />
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">{children}</main>
        <SiteFooter />

        {/*
          Wowhead's tooltip embed. This is the one third-party script in the app, and
          it is a deliberate exception to "no client-side third-party calls" — that rule
          exists to protect the Blizzard secret and avoid hammering APIs, neither of
          which applies here.

          It earns its place because it renders the REAL in-game tooltip, including
          bonus IDs, gems, enchants and upgrade level — data our database does not model
          at all. A homegrown tooltip would show base stats and be quietly wrong for
          every upgraded item on the character page.

          Config is set before the script so links are not rewritten: we keep our own
          quality colouring and icons, and take only the tooltip behaviour.
        */}
        <Script id="wowhead-tooltip-config" strategy="beforeInteractive">
          {`const whTooltips = { colorLinks: false, iconizeLinks: false, renameLinks: false, hide: { droppedBy: false } };`}
        </Script>
        <Script src="https://wow.zamimg.com/js/tooltips.js" strategy="afterInteractive" />
      </body>
    </html>
  );
}
