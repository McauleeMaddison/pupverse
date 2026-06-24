import { escapeHtml } from "../utils/format.js";

function getImageFallbacks(path) {
  if (!path) return [];
  const clean = path.startsWith("/") ? path : `/${path}`;
  const base = clean.replace(/\.(png|jpe?g|webp)$/i, "");

  return [clean, `${base}.png`, `${base}.jpg`, `${base}.jpeg`, `${base}.webp`]
    .filter((item, index, all) => all.indexOf(item) === index);
}

function fallbackCardSvg(label) {
  return "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 800">
      <defs>
        <linearGradient id="g" x2="1" y2="1">
          <stop stop-color="#071225"/>
          <stop offset=".5" stop-color="#25357a"/>
          <stop offset="1" stop-color="#07192b"/>
        </linearGradient>
      </defs>
      <rect width="600" height="800" rx="40" fill="url(#g)"/>
      <rect x="24" y="24" width="552" height="752" rx="32" fill="none" stroke="#67f4e7" stroke-width="4"/>
      <text x="300" y="390" fill="white" text-anchor="middle" font-size="50" font-family="Arial" font-weight="900">PUPVERSE</text>
      <text x="300" y="450" fill="#75eee3" text-anchor="middle" font-size="24" font-family="Arial">${escapeHtml(label)}</text>
    </svg>
  `);
}

export function renderCardImage(card, className = "") {
  const fallbacks = getImageFallbacks(card?.frontImage || card?.front_image);
  const label = escapeHtml(card?.name || "PupVerse card");

  return `<img class="${className}" src="${fallbacks[0] || ""}" alt="${label}" data-fallbacks='${JSON.stringify(fallbacks)}' data-fallback-index="0">`;
}

export function setupImageFallbacks() {
  document.querySelectorAll("img[data-fallbacks]").forEach((image) => {
    image.onerror = () => {
      const fallbacks = JSON.parse(image.dataset.fallbacks || "[]");
      const next = Number(image.dataset.fallbackIndex || 0) + 1;

      if (fallbacks[next]) {
        image.dataset.fallbackIndex = String(next);
        image.src = fallbacks[next];
        return;
      }

      image.onerror = null;
      image.src = fallbackCardSvg(image.alt);
    };
  });
}
