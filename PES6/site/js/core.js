(function (PES6) {
var sources = (function () {
  var params = new URLSearchParams(window.location.search);
  var result = {
    engineScript: PES6.Config.engineScript,
    wasm: PES6.Config.wasm,
    data: PES6.Config.data,
    pak: PES6.Config.pak
  };
  var base = params.get('wasm_base');
  if (base) {
    if (!/\/$/.test(base)) base += '/';
    // The build writes both forms (tools/GzipWebFile.cmake); a deployed
    // site may keep only the .gz ones.
    result.wasm = base + 'PES6Recomp.wasm.gz';
    result.data = base + 'PES6Recomp.data.gz';
  }
  if (params.get('wasm')) result.wasm = params.get('wasm');
  if (params.get('data')) result.data = params.get('data');
  if (params.has('pak')) result.pak = params.get('pak') || '';
  return result;
})();

// Console: the stock Emscripten shell appends every line to a textarea
// (O(n^2) string copies + a relayout per line), which by itself freezes
// the page once the runtime prints a few thousand diagnostics. Keep a
// bounded ring and flush it to the DOM on a timer, and only while the log
// is on screen: every flush forces a layout (scrollHeight), which competes
// with the emulation for the main thread.
var LOG_MAX_LINES = 400;
var LOG_FLUSH_INTERVAL_MS = 250;
// Full text logHistory kept off-DOM for the Copy button; much larger than
// what is rendered since appending to an array is cheap.
var HISTORY_MAX_LINES = 20000;
// The history is trimmed in blocks: splicing the head of a 20000-entry array
// on every line shifts the whole array each time.
var HISTORY_TRIM_SLACK = 2000;
var logHistory = [];
var logEl = document.getElementById('log');
var logPanelEl = document.getElementById('panelLog');
var droppedEl = document.getElementById('dropped');
var lines = [], dropped = 0, flushScheduled = false;
function logVisible() {
  return !logEl.hidden && !logPanelEl.hidden;
}
function flushLog() {
  flushScheduled = false;
  if (!logVisible()) return;
  var frag = document.createDocumentFragment();
  for (var i = 0; i < lines.length; i++) {
    var el = document.createElement('span');
    if (lines[i].err) el.className = 'err';
    el.textContent = lines[i].text + '\n';
    frag.appendChild(el);
  }
  lines = [];
  logEl.appendChild(frag);
  while (logEl.childNodes.length > LOG_MAX_LINES) logEl.removeChild(logEl.firstChild);
  logEl.scrollTop = logEl.scrollHeight;
  if (dropped) droppedEl.textContent = dropped + ' lines dropped';
}
function pushLine(text, err) {
  // Never let a logging failure propagate into the wasm call that
  // printed: an exception there unwinds the emulation's main loop.
  try { pushLineUnsafe(text, err); } catch (e) { console.error(e); }
}
function pushLineUnsafe(text, err) {
  logHistory.push(text);
  if (logHistory.length > HISTORY_MAX_LINES + HISTORY_TRIM_SLACK)
    logHistory.splice(0, logHistory.length - HISTORY_MAX_LINES);
  if (lines.length >= LOG_MAX_LINES) { lines.shift(); dropped++; }
  lines.push({ text: text, err: err });
  if (!flushScheduled && logVisible()) { flushScheduled = true; setTimeout(flushLog, LOG_FLUSH_INTERVAL_MS); }
}
document.getElementById('showlog').onchange = function (e) {
  logEl.hidden = !e.target.checked;
  if (!logEl.hidden) flushLog();
};
document.getElementById('clearlog').onclick = function () { logEl.textContent = ''; lines = []; logHistory = []; };
function copyText(text, button, label) {
  function done(ok) {
    button.textContent = ok ? 'Copied' : 'Copy failed';
    setTimeout(function () { button.textContent = label; }, 1500);
  }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(function () { done(true); }, function () { done(false); });
    return;
  }
  var area = document.createElement('textarea');
  area.value = text;
  document.body.appendChild(area);
  area.select();
  var ok = false;
  try { ok = document.execCommand('copy'); } catch (e) {}
  document.body.removeChild(area);
  done(ok);
}
document.getElementById('copylog').onclick = function () {
  copyText(logHistory.join('\n'), this, 'Copy');
};
document.getElementById('copytail').onclick = function () {
  copyText(logHistory.slice(-300).join('\n'), this, 'Copy tail');
};

var statusEl = document.getElementById('status');
var progressEl = document.getElementById('progress');
var overlayEl = document.getElementById('overlay');
var startChoiceEl = document.getElementById('startChoice');
var canvasEl = document.getElementById('canvas');
canvasEl.addEventListener('webglcontextlost', function (e) {
  pushLine('WebGL context lost; reload the page.', true);
  e.preventDefault();
}, false);

function setStatus(text) {
  if (/^(Error|No se pudo|Navegador no compatible)/i.test(text)) {
    var fatalEl = document.getElementById('fatalError');
    if (fatalEl) { fatalEl.textContent = text; fatalEl.hidden = false; }
    overlayEl.classList.add('boot-error');
    overlayEl.hidden = false;
  }
  var m = text.match(/([^(]+)\((\d+(\.\d+)?)\/(\d+)\)/);
  if (m) {
    statusEl.textContent = m[1];
    progressEl.value = parseInt(m[2]); progressEl.max = parseInt(m[4]); progressEl.hidden = false;
  } else {
    statusEl.textContent = text;
    progressEl.hidden = true;
  }
}

PES6.Core = {
  sources: sources,
  pushLine: pushLine,
  copyText: copyText,
  flushLog: flushLog,
  setStatus: setStatus,
  elements: {
    overlay: overlayEl,
    startChoice: startChoiceEl,
    canvas: canvasEl
  }
};
})(window.PES6);
