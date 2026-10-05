// Crop picture: a small photo when we have one (public/crops/<slug>.webp, ~4 KB, cached by the
// browser), otherwise the emoji. Photos are listed in crop-photos.ts (generated with credits).
import { PHOTOS } from '@/lib/crop-photos';

export function CropIcon({ slug, icon, size = 40, className = 'crop-photo' }: { slug: string; icon: string; size?: number; className?: string }) {
  if (!PHOTOS[slug]) return <span className="crop-icon" aria-hidden="true">{icon}</span>;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={`/crops/${slug}.webp`} alt="" width={size} height={size} loading="lazy" decoding="async" className={className} />;
}
