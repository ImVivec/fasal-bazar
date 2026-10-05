import type { MetadataRoute } from 'next';

// Private, login-only app: keep it out of search engines.
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: '*', disallow: '/' } };
}
