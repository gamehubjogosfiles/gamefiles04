(function (PES6) {
var Runtime = PES6.Runtime = PES6.Runtime || {};

// Notice over the game while it reads game data (pes6_range_fetch.js), from
// the network or the browser cache. The game reads in bursts of short
// requests with gaps between them, so the notice follows the burst rather
// than each request: it appears once reads have been going for
// SHOW_DELAY_MS and hides only after HIDE_DELAY_MS without any.
var SHOW_DELAY_MS = 250;
var HIDE_DELAY_MS = 1500;
// On by default; General > Descargas can turn it off (kept in localStorage).
var STORAGE_KEY = 'pes6.showLoadingNotice';

var noticeEl = document.getElementById('netStatus');
var toggleEl = document.getElementById('showLoadingNotice');
var retrying = 0;
var receivedAtStart = 0;
var bytesReceived = 0;
var deliveredAtStart = 0;
var bytesDelivered = 0;
var burstActive = false;
var burstStart = 0;
var currentActive = 0;
var showTimer = 0;
var hideTimer = 0;
// A download error stays on screen: the game cannot continue without it.
var failed = false;
var warningShown = false;

function formatMB(bytes) {
  return (bytes / 1048576).toFixed(1) + ' MB';
}

function isEnabled() {
  try { return localStorage.getItem(STORAGE_KEY) !== '0'; } catch (e) { return true; }
}

// Megabytes of the current burst: downloaded ones while any came from the
// network, else the ones read from the browser cache.
function render() {
  var downloaded = bytesReceived - receivedAtStart;
  var loaded = bytesDelivered - deliveredAtStart;
  var text;
  if (retrying) {
    text = 'Conexión lenta, reintentando...';
    if (downloaded > 0) text += ' ' + formatMB(downloaded) + ' descargados';
  } else if (downloaded > 0) {
    text = 'Descargando datos del juego... ' + formatMB(downloaded);
  } else {
    text = 'Cargando datos del juego... ' + formatMB(loaded);
  }
  noticeEl.textContent = text;
  noticeEl.classList.toggle('warn', retrying > 0);
  if (window.PES6_LOADING) window.PES6_LOADING.updateGameData(
    Math.max(bytesReceived, bytesDelivered), window.PES6_PAK_TOTAL_BYTES || 0);
}

function show() {
  showTimer = 0;
  noticeEl.hidden = false;
  render();
}

// A burst that pauses right at SHOW_DELAY_MS shows on its next read instead,
// so a single short read never flashes the notice.
function onShowDelay() {
  showTimer = 0;
  if (currentActive > 0) show();
}

function endBurst() {
  hideTimer = 0;
  clearTimeout(showTimer);
  showTimer = 0;
  burstActive = false;
  noticeEl.hidden = true;
}

// Called from pes6_range_fetch.js as Module.onRangeFetchActivity.
function onActivity(activeCount, retryingCount, totalBytes, networkCount, deliveredBytes) {
  currentActive = activeCount;
  retrying = retryingCount;
  bytesReceived = Math.max(bytesReceived, Number(totalBytes) || 0);
  bytesDelivered = Math.max(bytesDelivered, Number(deliveredBytes) || 0);
  if (window.PES6_LOADING) window.PES6_LOADING.updateGameData(
    Math.max(bytesReceived, bytesDelivered), window.PES6_PAK_TOTAL_BYTES || 0);
  PES6.PakDownload.setGameBusy(networkCount > 0 || retryingCount > 0);
  if (failed || warningShown || !isEnabled()) return;

  if (activeCount === 0) {
    if (burstActive && !hideTimer) hideTimer = setTimeout(endBurst, HIDE_DELAY_MS);
    return;
  }
  clearTimeout(hideTimer);
  hideTimer = 0;
  if (!burstActive) {
    burstActive = true;
    burstStart = Date.now();
    receivedAtStart = totalBytes;
    deliveredAtStart = bytesDelivered;
  }
  if (!noticeEl.hidden) {
    render();
  } else if (retrying || Date.now() - burstStart >= SHOW_DELAY_MS) {
    clearTimeout(showTimer);
    show();
  } else if (!showTimer) {
    showTimer = setTimeout(onShowDelay, SHOW_DELAY_MS - (Date.now() - burstStart));
  }
}

function onNetworkProgress(totalBytes) {
  bytesReceived = Math.max(bytesReceived, Number(totalBytes) || 0);
  if (failed || warningShown || !isEnabled() || currentActive === 0 || noticeEl.hidden) return;
  render();
}

// Retries of the pak metadata (js/data.js), before the game reads anything.
function showWarning(text) {
  if (failed) return;
  warningShown = true;
  noticeEl.textContent = text;
  noticeEl.classList.add('warn');
  noticeEl.hidden = false;
}

function clearWarning() {
  if (failed || !warningShown) return;
  warningShown = false;
  noticeEl.classList.remove('warn');
  noticeEl.hidden = true;
}

// Shown even with the loading notice turned off, and never hidden.
function showError(text) {
  if (window.PES6_LOADING) window.PES6_LOADING.showError(text);
  failed = true;
  warningShown = false;
  clearTimeout(showTimer);
  clearTimeout(hideTimer);
  showTimer = 0;
  hideTimer = 0;
  noticeEl.textContent = text;
  noticeEl.classList.remove('warn');
  noticeEl.classList.add('error');
  noticeEl.hidden = false;
}

// Called from pes6_range_fetch.js as Module.onRangeFetchError once a range
// is reported failed. A transient failure is requested again by the engine
// on its next read, so only a permanent one is shown.
function onFetchError(status, transient) {
  if (transient) return;
  showError('No se pudieron descargar datos del juego (HTTP ' + status + '). Recargá la página.');
}

toggleEl.value = isEnabled() ? '1' : '0';
toggleEl.onchange = function () {
  var enabled = toggleEl.value === '1';
  try { localStorage.setItem(STORAGE_KEY, enabled ? '1' : '0'); } catch (e) {}
  if (!enabled && !failed) endBurst();
};

Runtime.Downloads = {
  onActivity: onActivity,
  onNetworkProgress: onNetworkProgress,
  onFetchError: onFetchError,
  showWarning: showWarning,
  clearWarning: clearWarning,
  showError: showError
};
})(window.PES6);
