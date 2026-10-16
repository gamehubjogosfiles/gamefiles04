(function (PES6) {
// Connection diagnostics are UI-only. Never stop the game network/ICE here.
// When Online is visible update quickly; while playing on another panel,
// keep the always-visible ping banner fresh at a much lower rate.
var LINK_REFRESH_MS = 2000;
var LINK_BACKGROUND_MS = 15000;
var linkEl = document.getElementById('netLinkStatus');
var gameLinkEl = document.getElementById('netGameLink');
var gamePingEl = document.getElementById('netGamePing');
var gameNoticeEl = document.getElementById('netGameNotice');
var panelEl = document.getElementById('panelOnline');
var refreshTimer = null;
var inFlight = false;
var requestedAgain = false;
var generation = 0;

function onlineVisible() {
  return !document.hidden && !panelEl.hidden;
}
function refreshInterval() {
  if (document.hidden) return 0;
  if (onlineVisible()) return LINK_REFRESH_MS;
  // Header status is outside the Online panel. Update it occasionally during
  // gameplay, but don't poll before the game starts.
  return PES6.Runtime && PES6.Runtime.Player && PES6.Runtime.Player.isStarted()
    ? LINK_BACKGROUND_MS : 0;
}

function describeRoute(link) {
  if (link.local === 'relay' || link.remote === 'relay') return 'directo vía TURN';
  if (link.local === 'host' && link.remote === 'host') return 'directo (red local)';
  return 'directo P2P';
}
function describePeer(link, index) {
  var text = 'Rival ' + (index + 1) + ': ';
  if (!link.open) return text + 'por relay (' + link.state + ')' +
    (link.recoveryAttempts > 0 ? ', recuperando P2P (intento ' + link.recoveryAttempts + '/3)' : '');
  var queued = typeof link.bufferedBytes === 'number' && link.bufferedBytes >= 65536
    ? ', cola ' + Math.round(link.bufferedBytes / 1024) + ' KB' : '';
  return text + describeRoute(link) + (link.rttMs !== null ? ', ping ' + link.rttMs + ' ms' : '') + queued;
}
function renderGameLink(report) {
  var started = PES6.Runtime && PES6.Runtime.Player && PES6.Runtime.Player.isStarted();
  var peers = report && report.signaling && Array.isArray(report.peers)
    ? report.peers.filter(function (peer) { return peer.active === true; }) : [];
  gameLinkEl.hidden = !started || peers.length !== 1;
  gamePingEl.textContent = '';
  gameNoticeEl.textContent = '';
  if (gameLinkEl.hidden) return;
  gamePingEl.textContent = peers.map(function (peer, index) {
    var route = !peer.open ? 'Relay' :
      (peer.local === 'relay' || peer.remote === 'relay' ? 'TURN' : 'P2P');
    var ping = peer.open && typeof peer.rttMs === 'number' && Number.isFinite(peer.rttMs) && peer.rttMs >= 0
      ? Math.round(peer.rttMs) + ' ms' : '—';
    return (peers.length > 1 ? 'Rival ' + (index + 1) + ': ' : '') + route + ' · PING: ' + ping;
  }).join(' | ');
  var direct = peers.some(function (peer) {
    return peer.open && peer.local !== 'relay' && peer.remote !== 'relay';
  });
  gameNoticeEl.textContent = direct
    ? 'P2P: conexión entre jugadores; su conexión influye en la fluidez.'
    : 'Conexión mediante un servidor intermediario.';
}
function renderLink(report) {
  renderGameLink(report);
  // Don't update hidden Online DOM: the banner above the game is separate.
  if (!onlineVisible()) return;
  if (!report || !report.mode) {
    linkEl.textContent = '';
    return;
  }
  var text = 'Enlace (' + report.mode + '): ';
  if (report.mode === 'off') text += 'WebRTC desactivado, todo va por el relay.';
  else if (!report.signaling) text += 'esperando al relay.';
  else if (!report.peers.length) text += 'sin rivales en la sala.';
  else text += report.peers.map(describePeer).join('; ') + '.';
  linkEl.textContent = text;
}
function schedule() {
  if (refreshTimer !== null) clearTimeout(refreshTimer);
  refreshTimer = null;
  var interval = refreshInterval();
  if (interval) refreshTimer = setTimeout(refreshLink, interval);
}
function refreshLink() {
  if (!refreshInterval()) return;
  if (inFlight) { requestedAgain = true; return; }
  var module = window.Module;
  if (!module || typeof module.pes6RtcLinkReport !== 'function') {
    if (onlineVisible()) linkEl.textContent = '';
    renderGameLink(null);
    schedule();
    return;
  }
  inFlight = true;
  var current = generation;
  // Use one in-flight stats request; an old reply must not update a hidden
  // tab or overwrite the fresh data after a tab/visibility transition.
  Promise.resolve().then(function () {
    // The user may close Online before this microtask executes.
    if (generation !== current || !refreshInterval()) return null;
    return module.pes6RtcLinkReport();
  }).then(function (report) {
    if (generation === current && refreshInterval()) renderLink(report);
  }).catch(function () {
    if (generation !== current || !refreshInterval()) return;
    if (onlineVisible()) linkEl.textContent = '';
    renderGameLink(null);
  }).then(function () {
    inFlight = false;
    if (requestedAgain && refreshInterval()) {
      requestedAgain = false;
      refreshLink();
    } else {
      requestedAgain = false;
      schedule();
    }
  });
}
function syncRefresh() {
  generation++;
  if (refreshTimer !== null) clearTimeout(refreshTimer);
  refreshTimer = null;
  requestedAgain = false;
  if (refreshInterval()) refreshLink();
}
window.addEventListener('pes6:panelchange', syncRefresh);
window.addEventListener('pes6:game-started', syncRefresh);
document.addEventListener('visibilitychange', syncRefresh);
// Initial panel is General, so no unnecessary WebRTC stats request at boot.
schedule();
})(window.PES6);
