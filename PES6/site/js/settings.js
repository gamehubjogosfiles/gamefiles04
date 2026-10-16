(function (PES6) {
// --- Settings (pes6.ini) ------------------------------------------
// Same file format and key names as the desktop pes6.ini; the C++ side
// (pes6_config.cpp) maps them onto the PSPRECOMP_* variables at start.
var CONFIG_PATH = '/game/config/pes6.ini';
var DEFAULT_WEB_INI =
  '; PES6Recomp web settings, kept in this browser\'s storage.\n' +
  '; Edit them from the Settings button; they apply when the game starts.\n\n' +
  '[render]\nbackend = webgl2\nscale = 2\nlinear_filter = 0\nframe_rate = 30\n\n' +
  '[audio]\nvolume = 100\n\n' +
  '[boot]\nskip_intro = 1\nlanguage = en\n\n' +
  '[game]\nstadium_camera = 1\n\n' +
  '[teams]\nfirst_tab = 13\n';
var settingsStatusEl = document.getElementById('settingsStatus');
var settingsIniEl = document.getElementById('settingsIni');
var gameStarted = false;

function readIni() {
  try { return window.Module.FS.readFile(CONFIG_PATH, { encoding: 'utf8' }); }
  catch (e) { return DEFAULT_WEB_INI; }
}
function iniKeyOf(line) {
  var text = line.trim();
  if (!text || text[0] === ';' || text[0] === '#' || text[0] === '[') return null;
  var eq = text.indexOf('=');
  return eq < 0 ? null : text.slice(0, eq).trim().toLowerCase();
}
function iniSectionOf(line) {
  var text = line.trim();
  if (text[0] !== '[') return null;
  var close = text.indexOf(']');
  return close < 0 ? '' : text.slice(1, close).trim().toLowerCase();
}
function getIniValue(text, section, key) {
  var current = '';
  var lines = text.split('\n');
  for (var i = 0; i < lines.length; i++) {
    var name = iniSectionOf(lines[i]);
    if (name !== null) { current = name; continue; }
    if (current === section && iniKeyOf(lines[i]) === key) {
      var value = lines[i].slice(lines[i].indexOf('=') + 1).replace(/[;#].*$/, '').trim();
      return value.replace(/^(["'])(.*)\1$/, '$2');
    }
  }
  return null;
}
// Mirrors save_config_value(): replaces the key in its section, or adds
// it at the end of the section (or a new section at the end).
function setIniValue(text, section, key, value) {
  var lines = text.replace(/\n$/, '').split('\n');
  var entry = key + ' = ' + value;
  var current = '', sectionEnd = -1, found = false;
  for (var i = 0; i < lines.length; i++) {
    var name = iniSectionOf(lines[i]);
    if (name !== null) { current = name; if (name === section) sectionEnd = i + 1; continue; }
    if (current === section) {
      if (lines[i].trim()) sectionEnd = i + 1;
      if (iniKeyOf(lines[i]) === key) { lines[i] = entry; found = true; break; }
    }
  }
  if (!found) {
    if (sectionEnd >= 0) lines.splice(sectionEnd, 0, entry);
    else { if (lines.length && lines[lines.length - 1].trim()) lines.push(''); lines.push('[' + section + ']', entry); }
  }
  return lines.join('\n') + '\n';
}
// Selects and text fields tagged data-section/data-key edit that key.
function settingsControls() {
  return Array.prototype.slice.call(document.querySelectorAll('.settings-panel [data-key]'));
}
// [audio] volume (0..100) is web-only and applies at any time, even before
// the game starts: the engine keeps it until the audio device exists.
var volumeRangeEl = document.getElementById('volumeRange');
var volumeValueEl = document.getElementById('volumeValue');
function iniVolume(text) {
  var value = parseInt(getIniValue(text, 'audio', 'volume'), 10);
  return isFinite(value) ? Math.min(100, Math.max(0, value)) : 100;
}
function applyVolume(percent) {
  volumeValueEl.textContent = percent + '%';
  if (typeof window.Module._pes6_set_master_volume === 'function')
    window.Module.ccall('pes6_set_master_volume', null, ['number'], [percent]);
}
function renderSettings(text) {
  settingsIniEl.value = text;
  settingsControls().forEach(function (control) {
    var value = getIniValue(text, control.dataset.section, control.dataset.key);
    if (control === volumeRangeEl) {
      control.value = iniVolume(text);
      volumeValueEl.textContent = control.value + '%';
      return;
    }
    if (control.tagName !== 'SELECT') { control.value = value || ''; return; }
    if (value === null) value = defaultOptionOf(control).value;
    var known = Array.prototype.some.call(control.options, function (o) { return o.value === value; });
    control.value = known ? value : defaultOptionOf(control).value;
  });
}
// The option marked `selected` in the markup, else the first one.
function defaultOptionOf(select) {
  for (var i = 0; i < select.options.length; i++)
    if (select.options[i].defaultSelected) return select.options[i];
  return select.options[0];
}
settingsControls().forEach(function (control) {
  if (control === volumeRangeEl) {
    // Dragging applies live; releasing the slider saves.
    control.oninput = function () {
      settingsIniEl.value = setIniValue(settingsIniEl.value, 'audio', 'volume', control.value);
      settingsStatusEl.textContent = '';
      applyVolume(parseInt(control.value, 10));
    };
    control.onchange = function () { saveSettings(true); };
    return;
  }
  control[control.tagName === 'SELECT' ? 'onchange' : 'oninput'] = function () {
    settingsIniEl.value = setIniValue(settingsIniEl.value, control.dataset.section,
                                      control.dataset.key, control.value.trim());
    settingsStatusEl.textContent = '';
    // Selects save (and apply, when live) on change; text fields wait for Guardar.
    if (control.tagName === 'SELECT')
      saveSettings(control.dataset.section === 'render' &&
                   LIVE_RENDER_KEYS.indexOf(control.dataset.key) >= 0);
  };
});
settingsIniEl.oninput = function () { renderSettings(settingsIniEl.value); };
// Disabled until the IndexedDB mount holding pes6.ini is loaded.
function setSettingsEnabled(enabled) {
  Array.prototype.forEach.call(
    document.querySelectorAll('.settings-panel select, .settings-panel input, .settings-panel textarea, .settings-panel button'),
    function (control) { control.disabled = !enabled; });
}
setSettingsEnabled(false);
// [render] scale only reaches the WebGL2 GE backend; the software build
// always presents the PSP's own 480x272 framebuffer.
function applyRendererLimits() {
  var scalable = window.Module.ccall('pes6_internal_scale_supported', 'number', [], []) !== 0;
  document.getElementById('scaleSelect').disabled = !scalable;
  document.getElementById('scaleNote').hidden = scalable;
  if (PES6.Runtime && PES6.Runtime.Renderer) PES6.Runtime.Renderer.updateControls(window.Module);
}
// [render] frame_rate, linear_filter and scale switch on a running game;
// everything else in pes6.ini is only read at start.
var LIVE_RENDER_KEYS = ['frame_rate', 'linear_filter', 'scale'];
// False on an engine built before these exports existed.
function applyLiveSettings(text) {
  if (typeof window.Module._pes6_set_internal_scale !== 'function') return false;
  window.Module.ccall('pes6_set_frame_rate_60', null, ['number'],
               [getIniValue(text, 'render', 'frame_rate') === '60' ? 1 : 0]);
  var filter = getIniValue(text, 'render', 'linear_filter');
  window.Module.ccall('pes6_set_linear_filter', null, ['number'], [filter && filter !== '0' ? 1 : 0]);
  window.Module.ccall('pes6_set_internal_scale', null, ['number'],
               [parseInt(getIniValue(text, 'render', 'scale') || '2', 10) || 2]);
  applyVolume(iniVolume(text));
  return true;
}
function saveSettings(appliedLive) {
  try {
    window.Module.FS.writeFile(CONFIG_PATH, settingsIniEl.value);
    window.Module.FS.syncfs(false, function (err) {
      if (err) { settingsStatusEl.textContent = 'No se pudo guardar: ' + err; return; }
      if (gameStarted && !applyLiveSettings(settingsIniEl.value)) {
        settingsStatusEl.textContent = 'Guardado. Este motor no aplica cambios en vivo: recargá la página.';
        return;
      }
      if (gameStarted && PES6.Runtime && PES6.Runtime.Renderer &&
          PES6.Runtime.Renderer.hasPendingChange(settingsIniEl.value)) {
        settingsStatusEl.textContent = 'Guardado. El cambio de renderer se aplica al reiniciar el juego.';
        return;
      }
      settingsStatusEl.textContent = !gameStarted || appliedLive ? 'Guardado y aplicado.'
        : 'Guardado. Lo que no es de video se aplica al reiniciar el juego.';
    });
  } catch (e) { settingsStatusEl.textContent = 'No se pudo guardar: ' + e; }
}
function applyLocalBootDefaults() {
  try { if (localStorage.getItem('pes6.localBootConfigured') === '1') return; } catch (e) {}
  var text = readIni();
  text = setIniValue(text, 'render', 'backend', 'webgl2');
  text = setIniValue(text, 'boot', 'skip_intro', '1');
  text = setIniValue(text, 'boot', 'language', 'en');
  try {
    settingsIniEl.value = text;
    window.Module.FS.writeFile(CONFIG_PATH, text);
    window.Module.FS.syncfs(false, function (err) {
      if (!err) { try { localStorage.setItem('pes6.localBootConfigured', '1'); } catch (e) {} }
    });
  } catch (e) { PES6.Core.pushLine('Could not apply local startup settings: ' + e, true); }
}
Array.prototype.forEach.call(document.querySelectorAll('.save-settings'), function (button) {
  button.onclick = function () { saveSettings(false); };
});

PES6.Settings = {
  readIni: readIni,
  getIniValue: getIniValue,
  iniVolume: iniVolume,
  applyVolume: applyVolume,
  render: renderSettings,
  setEnabled: setSettingsEnabled,
  applyRendererLimits: applyRendererLimits,
  save: saveSettings,
  applyLocalBootDefaults: applyLocalBootDefaults,
  saveRendererForRestart: function (backend, callback) {
    try {
      var text = setIniValue(readIni(), 'render', 'backend', backend);
      window.Module.FS.writeFile(CONFIG_PATH, text);
      window.Module.FS.syncfs(false, function (err) {
        if (err) settingsStatusEl.textContent = 'No se pudo guardar: ' + err;
        callback(err);
      });
    } catch (err) { settingsStatusEl.textContent = 'No se pudo guardar: ' + err; callback(err); }
  },
  getText: function () { return settingsIniEl.value; },
  isGameStarted: function () { return gameStarted; },
  setGameStarted: function (started) { gameStarted = !!started; }
};
})(window.PES6);
