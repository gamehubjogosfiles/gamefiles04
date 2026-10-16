(function (PES6) {
// Player name typed in the game's on-screen keyboard (lobby.ovl OSK). The
// engine asks through PES6.Rooms.PlayerName.ask (pes6_hle_utility.cpp). The
// page keeps the last name and gives it to the relay as this page's nick
// ("room-nick"), so room member lists show it instead of "Jugador <id>".
// The game keeps the name in its save and may not ask again, hence storage.
var Link = PES6.Rooms.Link;
var STORAGE_KEY = 'pes6-player-name';
// The game's own default; left out of the room list.
var DEFAULT_NAME = 'PLAYER';
// pes6_relay config.MAX_NICK.
var MAX_NICK = 20;

function clean(text) {
  return String(text).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim()
    .slice(0, MAX_NICK);
}

function read() {
  try { return clean(localStorage.getItem(STORAGE_KEY) || ''); } catch (e) { return ''; }
}

function save(text) {
  try { localStorage.setItem(STORAGE_KEY, text); } catch (e) {}
}

var name = read();

function sendNick() {
  if (name && name !== DEFAULT_NAME) Link.send({ type: 'room-nick', nick: name });
}

// Returns what the player typed (the game gets it unchanged) or null.
function ask() {
  var text = window.prompt('PES6 - Player name', name || DEFAULT_NAME);
  if (text === null) return null;
  var chosen = clean(text);
  if (chosen && chosen !== name) {
    name = chosen;
    save(name);
    sendNick();
  }
  return text;
}

// A reconnected browser socket starts without a nick.
Link.on('open', sendNick);

PES6.Rooms.PlayerName = {
  ask: ask
};
})(window.PES6);
