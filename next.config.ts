import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // better-sqlite3 is a native module; it must not be bundled.
  serverExternalPackages: ['better-sqlite3'],

  // Default position covers the footer attribution, which must stay legible.
  devIndicators: { position: 'bottom-right' },
};

export default nextConfig;
