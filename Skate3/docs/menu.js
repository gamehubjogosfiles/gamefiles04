import { mapPhoto, mapPreview, mapTitle } from './map-art.js';

const screen = document.getElementById('menu-screen');
const slide = document.getElementById('map-slide');
const dots = document.getElementById('map-dots');
const position = document.getElementById('map-position');
const start = document.getElementById('start-game');
const status = document.getElementById('menu-status');
const previous = document.getElementById('previous-map');
const next = document.getElementById('next-map');
let maps = [];
let active = 0;

const hasSelectedMap = () => {
  const params = new URLSearchParams(location.search);
  return ['map', 'smap', 'mapurl', 'local'].some((key) => params.has(key));
};

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
}

function render() {
  if (!maps.length) return;
  const map = maps[active];
  const title = mapTitle(map.name);
  const photo = mapPhoto(map.name);
  document.documentElement.style.setProperty('--scene-image', photo ? `url("${photo.src}")` : 'none');
  const mb = (map.size / 1e6).toFixed(1);
  slide.innerHTML = `
    <div class="preview-frame">
      ${mapPreview(map.name)}
    </div>
    <div class="park-details">
      <div class="park-overline">PARK ${String(active + 1).padStart(2, '0')} <span>/ ${String(maps.length).padStart(2, '0')}</span></div>
      <h2>${escapeHTML(title)}</h2>
      <p class="park-size">${mb} MB <span>download</span></p>
    </div>`;
  position.textContent = `${String(active + 1).padStart(2, '0')} / ${String(maps.length).padStart(2, '0')}`;
  previous.disabled = maps.length < 2;
  next.disabled = maps.length < 2;
  dots.replaceChildren(...maps.map((item, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `map-dot${index === active ? ' active' : ''}`;
    button.setAttribute('aria-label', `Show ${mapTitle(item.name)}`);
    button.setAttribute('aria-current', index === active ? 'true' : 'false');
    button.addEventListener('click', () => choose(index));
    return button;
  }));
}

function choose(index) {
  if (!maps.length) return;
  active = (index + maps.length) % maps.length;
  slide.classList.remove('arriving');
  render();
  requestAnimationFrame(() => slide.classList.add('arriving'));
}

function reportCatalogError(error) {
  const url = 'https://github.com/Igu2012/skate3web';
  const message = `The park list could not be loaded. Check your connection and reload the page.\n\nDetails: ${String(error?.message || error)}\n\nProject: ${url}\n\nOpen the project page now?`;
  if (window.confirm(message)) {
    const tab = window.open(url, '_blank');
    if (tab) tab.opener = null;
    if (!tab) location.assign(url);
  }
}

previous.addEventListener('click', () => choose(active - 1));
next.addEventListener('click', () => choose(active + 1));
start.addEventListener('click', () => {
  if (!maps.length) return;
  const map = maps[active];
  if (typeof globalThis.skateSelectMap === 'function') {
    globalThis.skateSelectMap(map.name);
    return;
  }
  const url = new URL(location.href);
  for (const key of ['map', 'smap', 'mapurl', 'local']) url.searchParams.delete(key);
  url.searchParams.set('map', map.name);
  location.assign(url.toString());
});
addEventListener('keydown', (event) => {
  if (screen.hidden || event.altKey || event.ctrlKey || event.metaKey) return;
  if (event.key === 'ArrowLeft') { event.preventDefault(); choose(active - 1); }
  else if (event.key === 'ArrowRight') { event.preventDefault(); choose(active + 1); }
  else if (event.key === 'Enter' && !start.disabled) { event.preventDefault(); start.click(); }
});

async function initializeMenu() {
  if (hasSelectedMap()) { screen.hidden = true; return; }
  screen.hidden = false;
  try {
    const response = await fetch('./pack.json', { cache: 'no-cache' });
    if (!response.ok) throw new Error(`pack.json: HTTP ${response.status}`);
    const pack = await response.json();
    maps = pack.maps ?? [];
    if (!maps.length) throw new Error('The park catalog is empty.');
    active = Math.max(0, maps.findIndex((map) => map.name === pack.default));
    status.hidden = true;
    start.disabled = false;
    render();
  } catch (error) {
    status.hidden = true;
    start.disabled = true;
    reportCatalogError(error);
  }
}

initializeMenu();
