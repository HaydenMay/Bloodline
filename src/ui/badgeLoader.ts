import type { Coat, Silks } from '../render/palette.js';
import { getBadgeDataUri } from '../render/shieldBadge.js';

export function createBadgeElement(
  coat: string | Coat,
  silks: Silks,
  badgeCache: Map<string, string>,
  horseId: string,
  cssClass: string,
  altText: string = 'Badge',
): HTMLDivElement {
  const wrapper = document.createElement('div');
  wrapper.className = cssClass.replace('-badge', '-badge-wrap');

  if (badgeCache.has(horseId)) {
    const img = document.createElement('img');
    img.alt = altText;
    img.className = cssClass;
    img.src = badgeCache.get(horseId)!;
    wrapper.appendChild(img);
  } else {
    void getBadgeDataUri({ coat, silks }).then((uri) => {
      if (uri) {
        badgeCache.set(horseId, uri);
        const img = wrapper.querySelector('img') as HTMLImageElement;
        if (img) img.src = uri;
      }
    }).catch((err) => {
      console.error(`Failed to load badge for horse ${horseId}:`, err);
    });

    const img = document.createElement('img');
    img.alt = altText;
    img.className = cssClass;
    wrapper.appendChild(img);
  }

  return wrapper;
}
