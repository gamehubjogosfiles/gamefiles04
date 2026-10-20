(function (PES6) {
// Room browser socket: /pes6/rooms?pair=<token> on the relay of
// PRIVATE SERVER NINE/newsalas. The game's own relay socket gets
// the same pair token in its URL, so the relay knows which game socket to
// move when this page creates or joins a room. The token lives for the page.
// Retries back off up to RECONNECT_MAX_MS with jitter: a full or restarting
// relay would otherwise get every open page at the same 3 s beat.
var RECONNECT_MS = 3000;
var RECONNECT_MAX_MS = 60000;
// A handshake the proxy never answers leaves the socket connecting with no
// close event, so the list would wait forever; give up and retry instead.
var CONNECT_TIMEOUT_MS = 10000;
var BROWSER_PATH = '/pes6/rooms';
var PAIR_BYTES = 18;

var pair = makePair();
var browserUrl = '';
var configuredServer = '';
var socket = null;
var listeners = {};
// Only the first close of a failure streak is logged; retries are quiet.
var closeLogged = false;
var reconnectMs = RECONNECT_MS;
var reconnectTimer = 0;

function makePair() {
  var bytes = new Uint8Array(PAIR_BYTES);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode.apply(null, bytes))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Relay URL with the pair token; '' when the server is not a URL.
function withPair(server, path) {
  try {
    var url = new URL(server);
    if (path) url.pathname = path;
    url.searchParams.delete('room');
    url.searchParams.set('pair', pair);
    return url.href;
  } catch (e) {
    return '';
  }
}

// What pes6_set_adhoc_server gets; the engine appends &room=.
function gameServerUrl(server) {
  return withPair(server, null) || server;
}

function emit(type, message) {
  (listeners[type] || []).forEach(function (listener) {
    try { listener(message); } catch (e) { console.error(e); }
  });
}

function open() {
  if (!browserUrl || socket) return;
  clearTimeout(reconnectTimer);
  reconnectTimer = 0;
  var current = socket = new WebSocket(browserUrl);
  var connectTimer = setTimeout(function () {
    if (current.readyState === WebSocket.CONNECTING) current.close();
  }, CONNECT_TIMEOUT_MS);
  socket.onopen = function () {
    clearTimeout(connectTimer);
    closeLogged = false;
    reconnectMs = RECONNECT_MS;
    emit('open', null);
  };
  socket.onmessage = function (event) {
    if (typeof event.data !== 'string') return;
    var message;
    try { message = JSON.parse(event.data); } catch (e) { return; }
    if (message && typeof message.type === 'string') emit(message.type, message);
  };
  socket.onclose = function (event) {
    clearTimeout(connectTimer);
    if (!closeLogged) {
      PES6.Core.pushLine('Room browser closed (code ' + event.code + '), retrying in ' +
                         RECONNECT_MS / 1000 + '-' + RECONNECT_MAX_MS / 1000 + ' s', false);
      closeLogged = true;
    }
    socket = null;
    reconnectTimer = setTimeout(open, reconnectMs * (0.5 + Math.random() * 0.5));
    reconnectMs = Math.min(reconnectMs * 2, RECONNECT_MAX_MS);
    emit('close', null);
  };
}

// Skips the backoff wait, e.g. when the player opens the Online tab.
function retryNow() {
  if (!browserUrl && configuredServer) configure(configuredServer);
  if (browserUrl && (!socket || reconnectTimer)) open();
}

// True between a close and the next retry: the relay refused or dropped it.
function isRetrying() {
  return !!reconnectTimer;
}

// False until the game starts and hands over its relay address.
function isStarted() {
  return !!browserUrl;
}

function configure(server) {
  var url = withPair(server, BROWSER_PATH);
  if (!url) return;
  configuredServer = server;
  browserUrl = url;
}

function connect(server) {
  if (server) configure(server);
  if (!browserUrl) return;
  if (!socket) PES6.Core.pushLine('Room browser: ' + browserUrl.replace(/pair=[^&]+/, 'pair=***'), false);
  open();
}

function isOpen() {
  return !!socket && socket.readyState === WebSocket.OPEN;
}

function send(message) {
  if (!isOpen()) return false;
  socket.send(JSON.stringify(message));
  return true;
}

function on(type, listener) {
  (listeners[type] = listeners[type] || []).push(listener);
}

PES6.Rooms = PES6.Rooms || {};
PES6.Rooms.WAIT_ROOM = 'wait';
PES6.Rooms.Link = {
  connect: connect,
  configure: configure,
  gameServerUrl: gameServerUrl,
  isOpen: isOpen,
  isRetrying: isRetrying,
  isStarted: isStarted,
  retryNow: retryNow,
  send: send,
  on: on
};
})(window.PES6);
