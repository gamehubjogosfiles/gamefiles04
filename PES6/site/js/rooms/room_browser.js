(function (PES6) {
// Room list of the Online tab. Rows come from the relay's room browser
// socket (js/rooms/room_link.js); joining or creating a room moves the game's
// relay socket there without reconnecting. Each row's arrow unfolds the
// players of that room with their pings. While the game is in a room the tab
// shows that room's players instead of the list; "Ver salas" switches back.
// A share link (?sala=<id>, plus &invite=<secret> for created rooms) joins
// that room by itself as soon as the game enters Inalámbrico; the invite is
// what opens a private room. Without a link, a room created before entering
// Inalámbrico is created then; otherwise the game joins the closest room with
// free players (or the first official one) and a toast names it.
var Link = PES6.Rooms.Link;
var REFRESH_SHOWN_MS = 6000;
var REFRESH_PLAYING_MS = 20000;
var REFRESH_PENDING_MS = 30000;
// Jitter prevents hundreds of browser tabs from polling the relay together.
var REFRESH_JITTER = 0.4;
var pollTimer = null;
var MIN_ROOM_CLIENTS = 2;
var MAX_ROOM_CLIENTS = 16;
var DEFAULT_ROOM_CLIENTS = 8;
var DEFAULT_ROOM_TITLE = 'Mi sala';
var FILTERS_STORAGE_KEY = 'pes6-room-filters-v2';
var STATES = { playing: 'jugando', searching: 'buscando rival', menu: 'en menús' };
var REASONS = {
  'no-game': 'Entrá a Inalámbrico en el juego primero.',
  'playing': 'No se puede cambiar de sala durante un partido.',
  'full': 'La sala está llena.',
  'missing': 'La sala ya no existe.',
  'private': 'La sala es privada: se entra con su link.',
  'wrong-password': 'La sala tiene clave: se entra con su link.',
  'bad-title': 'Poné un nombre de 1 a 40 caracteres.',
  'bad-max': 'Cantidad de jugadores inválida.',
  'bad-visibility': 'Visibilidad inválida.',
  'not-owner': 'Solo quien creó la sala puede cambiar su visibilidad.',
  'too-many-rooms': 'Hay demasiadas salas creadas. Probá más tarde.',
  'rate-limited': 'Esperá un momento antes de volver a intentar.',
  'busy': 'El servidor está ocupado, probá de nuevo.',
  'not-in-room': 'No estás en ninguna sala.'
};

var panelEl = document.getElementById('panelOnline');
var tabEl = document.querySelector('[data-panel="panelOnline"]');
var listEl = document.getElementById('roomsList');
var countEl = document.getElementById('roomsCount');
var statusEl = document.getElementById('roomsStatus');
var offlineEl = document.getElementById('roomsOffline');
var retryEl = document.getElementById('roomsRetry');
var browseEl = document.getElementById('roomsBrowse');
var joinEl = document.getElementById('roomsJoin');
var backEl = document.getElementById('roomsBack');
var showEmptyEl = document.getElementById('roomsShowEmpty');
var roomEl = document.getElementById('roomsRoom');
var roomTitleEl = document.getElementById('roomsRoomTitle');
var roomMetaEl = document.getElementById('roomsRoomMeta');
var membersEl = document.getElementById('roomsMembers');
var visibilityEl = document.getElementById('roomsVisibility');
var shareEl = document.getElementById('roomsShare');
var leaveEl = document.getElementById('roomsLeave');
var createFormEl = document.getElementById('roomsCreateForm');
var createTitleEl = document.getElementById('roomsCreateTitle');
var createMaxEl = document.getElementById('roomsCreateMax');
var createVisibilityEl = document.getElementById('roomsCreateVisibility');
var createEl = document.getElementById('roomsCreate');

var NO_GAME = { connected: false, room: '', state: '', invite: '', official: true, public: true,
                owner: false, members: [] };
var view = {
  rooms: [],
  game: NO_GAME,
  players: 0,
  rtt: null,
  selected: '',
  // Row whose players are unfolded, and the last member list of each room.
  expanded: '',
  members: {},
  notice: '',
  // Server-side compact snapshots are scoped to each room-browser socket.
  hasSnapshot: false,
  // List shown on purpose while the game is in a room ("Ver salas").
  browsing: false,
  // Room of the share link this page was opened with; null once used.
  pendingInvite: readInvite(),
  // room-create request waiting for the game to enter Inalámbrico.
  pendingCreate: null,
  // Room joined by itself on connect, until its room-result arrives.
  autoJoin: '',
  relayFailed: false
};

function readInvite() {
  var params = new URLSearchParams(window.location.search);
  var room = params.get('sala');
  return room ? { room: room, invite: params.get('invite') || '', sent: false } : null;
}

// Share link of the game's current room; '' when it has none to give.
// The test switch ?server= travels with it.
function inviteLink() {
  if (!view.game.room || (!view.game.official && !view.game.invite)) return '';
  var url = new URL(PES6.Config.roomShareBase);
  var params = new URLSearchParams(window.location.search);
  ['server', 'net_server'].forEach(function (key) {
    if (params.has(key)) url.searchParams.set(key, params.get(key));
  });
  url.searchParams.set('sala', view.game.room);
  if (view.game.invite) url.searchParams.set('invite', view.game.invite);
  return url.href;
}

function readFilters() {
  var filters = { empty: false };
  try {
    var saved = JSON.parse(localStorage.getItem(FILTERS_STORAGE_KEY) || '{}');
    if (typeof saved.empty === 'boolean') filters.empty = saved.empty;
  } catch (e) { /* storage disabled: defaults */ }
  return filters;
}
function saveFilters(filters) {
  try { localStorage.setItem(FILTERS_STORAGE_KEY, JSON.stringify(filters)); } catch (e) {}
}
var filters = readFilters();

function findRoom(id) {
  for (var i = 0; i < view.rooms.length; i++) if (view.rooms[i].id === id) return view.rooms[i];
  return null;
}

// Lowest ping first, then the fullest room.
function compareRooms(a, b) {
  var pingA = a.ping === null ? Infinity : a.ping;
  var pingB = b.ping === null ? Infinity : b.ping;
  if (pingA !== pingB) return pingA - pingB;
  if (a.players !== b.players) return b.players - a.players;
  return a.title.localeCompare(b.title);
}

function visibleRooms() {
  return view.rooms.filter(function (room) {
    return room.id === view.game.room || filters.empty || room.players > 0;
  }).sort(compareRooms);
}

// Room the game enters by itself: the closest open room with someone not in
// a match, else the first official room with space; null when none.
function autoRoom() {
  var open = view.rooms.filter(function (room) { return !room.locked && room.players < room.max; });
  var free = open.filter(function (room) { return room.players > room.playing; }).sort(compareRooms);
  if (free.length) return free[0];
  for (var i = 0; i < open.length; i++) if (open[i].official) return open[i];
  return null;
}

// REASONS key of why the game cannot change room now; '' when it can.
function moveBlocked() {
  if (!view.game.connected) return 'no-game';
  if (view.game.state === 'playing') return 'playing';
  return '';
}

function canMove() {
  return Link.isOpen() && !moveBlocked();
}

function shown() {
  return !panelEl.hidden && !document.hidden;
}

function showRoomView() {
  return !!view.game.room && !view.browsing;
}

function baseStatus() {
  if (!Link.isOpen()) {
    if (!Link.isStarted()) return 'Las salas aparecen cuando arranca el juego.';
    return Link.isRetrying() ? 'Sin conexión con el servidor de salas. Reintentando…'
      : 'Conectando con el servidor de salas…';
  }
  if (!view.game.connected) {
    return view.pendingCreate ? 'La sala se crea cuando entres a Inalámbrico.'
      : 'Entrá a Inalámbrico en el juego para unirte a una sala.';
  }
  if (view.game.state === 'playing') return 'Estás en un partido: no podés cambiar de sala.';
  var current = findRoom(view.game.room);
  if (!current) return 'Elegí una sala con poco ping o creá una.';
  return 'Estás en ' + current.title + '.';
}

function span(text, className) {
  var el = document.createElement('span');
  el.textContent = text;
  el.className = className;
  return el;
}

function pingText(ping) {
  return typeof ping === 'number' ? ping + ' ms' : '—';
}

// One player line: name, what the game is doing, relay ping.
function memberItem(member) {
  var item = document.createElement('li');
  if (member.you) item.className = 'you';
  item.appendChild(span(member.name + (member.you ? ' (vos)' : ''), 'rooms-member-name'));
  item.appendChild(span(STATES[member.state] || member.state, 'rooms-member-state'));
  item.appendChild(span(pingText(member.ping), 'rooms-member-ping'));
  return item;
}

function noteItem(text) {
  var item = document.createElement('li');
  item.className = 'rooms-member-note';
  item.textContent = text;
  return item;
}

function fillMembers(targetEl, members) {
  targetEl.textContent = '';
  if (!members) targetEl.appendChild(noteItem('Cargando jugadores…'));
  else if (!members.length) targetEl.appendChild(noteItem('No hay jugadores en la sala.'));
  else members.forEach(function (member) { targetEl.appendChild(memberItem(member)); });
}

function roomRow(room) {
  var expanded = room.id === view.expanded;
  var row = document.createElement('div');
  row.className = 'rooms-row' + (room.id === view.selected ? ' selected' : '') +
                  (room.id === view.game.room ? ' current' : '');
  row.setAttribute('role', 'option');
  row.setAttribute('aria-selected', room.id === view.selected ? 'true' : 'false');
  var arrow = document.createElement('button');
  arrow.type = 'button';
  arrow.className = 'rooms-expand';
  arrow.textContent = expanded ? '▾' : '▸';
  arrow.title = expanded ? 'Ocultar jugadores' : 'Ver jugadores y su ping';
  arrow.setAttribute('aria-expanded', expanded ? 'true' : 'false');
  arrow.onclick = function (event) {
    event.stopPropagation();
    toggleExpanded(room.id);
  };
  row.appendChild(arrow);
  row.appendChild(span(room.title, 'rooms-name'));
  row.appendChild(span(room.players + '/' + room.max, 'rooms-players'));
  row.appendChild(span(pingText(room.ping), 'rooms-ping'));
  row.onclick = function () { select(room.id); };
  row.ondblclick = function () { join(room.id); };
  return row;
}

function renderList() {
  var rooms = visibleRooms();
  if (!rooms.some(function (room) { return room.id === view.selected; }))
    view.selected = rooms.length ? rooms[0].id : '';
  var scrollTop = listEl.scrollTop;
  listEl.textContent = '';
  rooms.forEach(function (room) {
    listEl.appendChild(roomRow(room));
    if (room.id !== view.expanded) return;
    var detail = document.createElement('ul');
    detail.className = 'rooms-detail';
    fillMembers(detail, view.members[room.id]);
    listEl.appendChild(detail);
  });
  if (!rooms.length) {
    listEl.appendChild(span(view.rooms.length ? 'No hay salas con jugadores. Creá una o mostrá las vacías.'
      : 'Todavía no hay salas para mostrar.', 'rooms-empty'));
  }
  listEl.scrollTop = scrollTop;
}

function renderRoom() {
  var current = findRoom(view.game.room);
  roomTitleEl.textContent = current ? current.title : '';
  roomMetaEl.textContent = current ? current.players + '/' + current.max + ' jugadores' +
    (view.game.official ? '' : view.game.public ? ' · pública' : ' · privada') : '';
  fillMembers(membersEl, view.game.members);
  visibilityEl.hidden = !view.game.owner;
  visibilityEl.textContent = 'Visibilidad: ' + (view.game.public ? 'Pública' : 'Privada');
  shareEl.disabled = !inviteLink();
  leaveEl.disabled = !canMove();
}

function renderCount() {
  if (!shown()) return;
  if (view.relayFailed) {
    countEl.textContent = 'Sin conexión';
    return;
  }
  countEl.textContent = view.players + (view.players === 1 ? ' jugador' : ' jugadores') + ' online' +
    (view.rtt !== null ? ' · tu ping: ' + view.rtt + ' ms' : '');
}
function render() {
  // Apply network events to view immediately but avoid rebuilding hidden DOM.
  if (!shown()) return;
  browseEl.hidden = showRoomView();
  roomEl.hidden = !showRoomView();
  if (showRoomView()) renderRoom();
  else renderList();
  renderCount();
  backEl.hidden = !view.game.room;
  joinEl.disabled = !Link.isOpen() || !view.selected || view.selected === view.game.room;
  createEl.disabled = !Link.isOpen();
  offlineEl.hidden = !view.relayFailed;
  statusEl.hidden = view.relayFailed;
  statusEl.textContent = view.notice || baseStatus();
}

function select(id) {
  view.selected = id;
  view.notice = '';
  render();
  var selectedEl = listEl.querySelector('.rooms-row.selected');
  if (selectedEl) selectedEl.scrollIntoView({ block: 'nearest' });
}

function moveSelection(step) {
  var rooms = visibleRooms();
  var index = -1;
  for (var i = 0; i < rooms.length; i++) if (rooms[i].id === view.selected) index = i;
  var next = Math.max(0, Math.min(rooms.length - 1, index + step));
  if (rooms[next]) select(rooms[next].id);
}

function requestMembers(id) {
  if (id) Link.send({ type: 'room-members', room: id });
}

function toggleExpanded(id) {
  view.expanded = view.expanded === id ? '' : id;
  requestMembers(view.expanded);
  render();
}

// Compact replies avoid JSON, CPU and DOM updates when the listing is static.
// The backend also accepts the request on older versions and sends legacy data.
function poll() {
  if (!Link.isOpen()) return;
  Link.send({ type: 'room-list', delta: true, compact: true });
  if (shown() && !showRoomView()) requestMembers(view.expanded);
}

// Don't wake the browser once a second just to decide whether to poll. A
// single scheduled timer exists ONLY while Online is visible or an invitation
// is pending; game packets and room socket keep running independently.
function pollAllowed() {
  return Link.isOpen() && !document.hidden &&
    (shown() || !!view.pendingInvite || !!view.pendingCreate);
}
function nextInterval() {
  if (!shown()) return REFRESH_PENDING_MS;
  return view.game.state === 'playing' ? REFRESH_PLAYING_MS : REFRESH_SHOWN_MS;
}
function schedulePoll() {
  if (pollTimer !== null) clearTimeout(pollTimer);
  pollTimer = null;
  if (!pollAllowed()) return;
  var jitter = 1 - REFRESH_JITTER / 2 + Math.random() * REFRESH_JITTER;
  pollTimer = setTimeout(function () {
    pollTimer = null;
    if (!pollAllowed()) return;
    poll();
    schedulePoll();
  }, nextInterval() * jitter);
}
function refreshNow() {
  poll();
  schedulePoll();
}

function setBrowsing(browsing) {
  view.browsing = browsing;
  view.notice = '';
  render();
  if (browsing) refreshNow();
}

// Shows the Online tab, e.g. when the game enters Inalámbrico.
function openTab() {
  if (panelEl.hidden && tabEl) tabEl.click();
}

function join(id) {
  if (!findRoom(id) || !Link.isOpen() || id === view.game.room) return;
  var blocked = moveBlocked();
  if (blocked) {
    view.notice = REASONS[blocked];
    render();
    return;
  }
  Link.send({ type: 'room-join', room: id });
}

function fillMaxOptions() {
  for (var count = MIN_ROOM_CLIENTS; count <= MAX_ROOM_CLIENTS; count++) {
    var option = document.createElement('option');
    option.value = String(count);
    option.textContent = String(count);
    createMaxEl.appendChild(option);
  }
  createMaxEl.value = String(DEFAULT_ROOM_CLIENTS);
}

// Before Inalámbrico the request waits for the game and replaces a share
// link's pending join.
createFormEl.onsubmit = function (event) {
  event.preventDefault();
  if (!Link.isOpen()) return;
  var request = { type: 'room-create', title: createTitleEl.value.trim() || DEFAULT_ROOM_TITLE,
                  max: parseInt(createMaxEl.value, 10), public: createVisibilityEl.value !== 'private' };
  view.notice = '';
  if (moveBlocked() === 'playing') {
    view.notice = REASONS.playing;
  } else if (view.game.connected) {
    Link.send(request);
  } else {
    view.pendingCreate = request;
    view.pendingInvite = null;
  }
  render();
};
document.getElementById('roomsRefresh').onclick = refreshNow;
retryEl.onclick = function () {
  view.relayFailed = false;
  view.notice = '';
  Link.retryNow();
  render();
};
document.getElementById('roomsShowList').onclick = function () { setBrowsing(true); };
backEl.onclick = function () { setBrowsing(false); };
joinEl.onclick = function () { join(view.selected); };
leaveEl.onclick = function () { if (canMove()) Link.send({ type: 'room-leave' }); };
visibilityEl.onclick = function () {
  if (view.game.owner) Link.send({ type: 'room-visibility', public: !view.game.public });
};
shareEl.onclick = function () {
  var link = inviteLink();
  if (link) PES6.Core.copyText(link, shareEl, 'Compartir link');
};
showEmptyEl.checked = filters.empty;
showEmptyEl.onchange = function () {
  filters.empty = showEmptyEl.checked;
  saveFilters(filters);
  render();
};
function syncRoomPanel() {
  if (shown()) {
    Link.retryNow();
    refreshNow();
    render();
  } else {
    schedulePoll();
  }
}
window.addEventListener('pes6:panelchange', syncRoomPanel);
document.addEventListener('visibilitychange', syncRoomPanel);

// Joins the share link's room once the game can move.
function joinPendingInvite() {
  var pending = view.pendingInvite;
  if (!pending || pending.sent || !view.game.connected || view.game.state === 'playing') return false;
  if (view.game.room === pending.room) {
    view.pendingInvite = null;
    return false;
  }
  pending.sent = true;
  Link.send({ type: 'room-join', room: pending.room, invite: pending.invite });
  PES6.Savedata.toast('Entrando a la sala del link…');
  return true;
}

// Sends the room-create asked for before the game entered Inalámbrico.
function createPending() {
  var request = view.pendingCreate;
  if (!request || moveBlocked()) return false;
  view.pendingCreate = null;
  Link.send(request);
  return true;
}

// Entering Inalámbrico parks the game in its waiting room: join a room for it,
// or show the list when there is none to pick.
function autoJoin() {
  var room = autoRoom();
  if (room && Link.send({ type: 'room-join', room: room.id })) {
    view.autoJoin = room.id;
    return;
  }
  openTab();
  PES6.Savedata.toast('Elegí una sala en la pestaña Online');
}

// Legacy delta: absent ping entries mean the ping is not available.
function applyPings(pings) {
  view.rooms.forEach(function (room) {
    room.ping = typeof pings[room.id] === 'number' ? pings[room.id] : null;
  });
}
// Compact delta: only touch entries explicitly changed or removed.
function applyPingChanges(message) {
  var delta = message.pings_delta;
  var removed = message.pings_removed;
  if (!delta && !removed) return;
  view.rooms.forEach(function (room) {
    if (delta && Object.prototype.hasOwnProperty.call(delta, room.id))
      room.ping = typeof delta[room.id] === 'number' ? delta[room.id] : null;
    if (Array.isArray(removed) && removed.indexOf(room.id) !== -1) room.ping = null;
  });
}
Link.on('rooms', function (message) {
  if (message.unchanged === true) return; // No state changes or DOM work.
  var wasConnected = view.game.connected;
  var rowsChanged = Array.isArray(message.rooms) || !!message.pings ||
    !!message.pings_delta || !!message.pings_removed ||
    Object.prototype.hasOwnProperty.call(message, 'game');
  var wasPlaying = view.game.state === 'playing';
  if (Array.isArray(message.rooms)) {
    view.rooms = message.rooms;
    view.hasSnapshot = true;
  } else if (!view.hasSnapshot) {
    // After a reconnect, ignore deltas until the first full snapshot.
    return;
  }
  if (message.pings && typeof message.pings === 'object') applyPings(message.pings);
  applyPingChanges(message);
  if (Object.prototype.hasOwnProperty.call(message, 'game')) {
    view.game = message.game || NO_GAME;
    if (!Array.isArray(view.game.members)) view.game.members = [];
  }
  if (Object.prototype.hasOwnProperty.call(message, 'players')) view.players = message.players | 0;
  if (Object.prototype.hasOwnProperty.call(message, 'rtt'))
    view.rtt = typeof message.rtt === 'number' ? message.rtt : null;
  if (!view.game.room) view.browsing = false;
  if (view.expanded && !findRoom(view.expanded)) view.expanded = '';
  if (!createPending() && !joinPendingInvite() && !wasConnected && view.game.connected &&
      !view.game.room && view.game.state !== 'playing') {
    autoJoin();
  }
  if (wasPlaying !== (view.game.state === 'playing')) schedulePoll();
  // Player count / own RTT need only a text change, not hundreds of DOM rows.
  if (rowsChanged) render();
  else renderCount();
});
Link.on('room-members', function (message) {
  if (typeof message.room !== 'string') return;
  view.members[message.room] = Array.isArray(message.members) ? message.members : [];
  if (message.room === view.expanded) render();
});
Link.on('room-result', function (message) {
  var pending = view.pendingInvite;
  var fromLink = pending && pending.sent && message.action === 'join';
  if (fromLink) view.pendingInvite = null;
  var autoJoined = message.action === 'join' && !!view.autoJoin && message.room === view.autoJoin;
  if (message.action === 'join') view.autoJoin = '';
  if (message.ok) {
    refreshNow();
    view.browsing = false;
    if (message.action === 'create') {
      createTitleEl.value = '';
      view.notice = 'Sala creada. Usá "Compartir link" para invitar.';
    } else if (message.action === 'leave') {
      view.notice = 'Saliste de la sala.';
    } else if (message.action === 'visibility') {
      view.notice = '';
    } else {
      var room = findRoom(message.room);
      var title = room ? room.title : 'la sala';
      view.notice = '';
      PES6.Savedata.toast(autoJoined ? 'Conectado automáticamente a ' + title + ' · cambiala en Online'
                                     : 'Entraste a ' + title);
      PES6.Core.elements.canvas.focus();
    }
    render();
    return;
  }
  view.notice = REASONS[message.reason] || 'No se pudo completar la acción.';
  schedulePoll();
  if (fromLink || autoJoined) openTab();
  if (autoJoined) PES6.Savedata.toast('Elegí una sala en la pestaña Online');
  render();
});
Link.on('open', function () {
  view.relayFailed = false;
  // Initial snapshot is required even if the Online panel is closed, so
  // pair-based auto join and invitations work as soon as the game connects.
  refreshNow();
  if (view.pendingInvite && !view.game.connected)
    PES6.Savedata.toast('Entrá a Inalámbrico para unirte a la sala del link');
  render();
});
Link.on('close', function () {
  view.relayFailed = true;
  view.game = NO_GAME;
  view.rooms = [];
  view.hasSnapshot = false;
  view.selected = '';
  view.expanded = '';
  if (view.pendingInvite) view.pendingInvite.sent = false;
  view.players = 0;
  view.rtt = null;
  schedulePoll();
  render();
});

// Keys typed in the Online tab never reach SDL; releases still do, so a key
// held when the focus moved here is seen let go. SDL also keeps text input on
// and cancels keypress, which would stop typing in the room name.
function ownsKey(event) {
  return panelEl.contains(event.target);
}
window.addEventListener('keydown', function (event) {
  if (!ownsKey(event)) return;
  event.stopImmediatePropagation();
  if (event.target !== listEl || showRoomView()) return;
  if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
    event.preventDefault();
    moveSelection(event.key === 'ArrowUp' ? -1 : 1);
  } else if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
    event.preventDefault();
    if ((event.key === 'ArrowRight') !== (view.expanded === view.selected)) toggleExpanded(view.selected);
  } else if (event.key === 'Enter') {
    event.preventDefault();
    if (!event.repeat) join(view.selected);
  }
}, true);
window.addEventListener('keypress', function (event) {
  if (ownsKey(event)) event.stopImmediatePropagation();
}, true);

// The relay pushes a complete room snapshot when the paired game connects
// or disconnects. There is no background room-list polling during matches
// when the Online panel is closed.
fillMaxOptions();
render();
})(window.PES6);
