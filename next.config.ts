import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  poweredByHeader: false,
  experimental: {
    // Turbopack's production scope hoisting merges small modules into shared factories. We hit a
    // rare client-navigation crash ("(0, i.inr) is not a function" → "This page couldn't load")
    // when two route chunks carrying the same merged factory loaded at once (Next 16.3.8).
    // Turning it off costs a few KB of JS and removes that class of bug.
    turbopackScopeHoisting: false,
  },
};

export default nextConfig;
