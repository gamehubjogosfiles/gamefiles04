(function (PES6) {
// Relay address as typed in ?server=, Settings or config. A bare host
// ("localhost", "192.168.0.10:7860") becomes a relay URL: ws:// for this
// machine, wss:// otherwise, port 8765 and path /pes6 when missing.
var DEFAULT_PORT = '8765';
var DEFAULT_PATH = '/pes6';

function isLocalHost(host) {
  return host === 'localhost' || /^127\./.test(host);
}

function normalize(text) {
  var server = (text || '').trim();
  if (!server || server.toLowerCase() === 'off' || server.indexOf('://') >= 0) return server;
  var slash = server.indexOf('/');
  var authority = slash >= 0 ? server.slice(0, slash) : server;
  var path = slash >= 0 ? server.slice(slash) : DEFAULT_PATH;
  var host = authority.replace(/:\d+$/, '');
  if (host === authority) authority += ':' + DEFAULT_PORT;
  return (isLocalHost(host) ? 'ws://' : 'wss://') + authority + path;
}

// ?net_server= / ?server= first, then Settings (pes6.ini [net] server), then config.
function configured(settingsValue) {
  var params = new URLSearchParams(window.location.search);
  return normalize(params.get('net_server') || params.get('server') ||
                   settingsValue || PES6.Config.netServer);
}

PES6.NetServer = {
  configured: configured
};
})(window.PES6);
