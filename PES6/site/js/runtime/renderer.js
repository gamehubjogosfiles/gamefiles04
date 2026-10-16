(function (PES6) {
var Runtime = PES6.Runtime = PES6.Runtime || {};
var startedReport = null;
var lastPrepared = null;
var pending = null;
var recoveryUsed = false;
var recoveryKey = 'pes6.renderer-fallback';
var names = ['Sin iniciar', 'Software', 'WebGL2', 'WebGPU'];
// "auto" (or no value) asks for WebGPU and lets prepare() fall back to WebGL2.
// "opengl" was the old default written by every saved pes6.ini, so it is read
// as "auto"; an explicit WebGL2 choice is saved as "webgl2".
function requested(text) {
  var value = PES6.Settings.getIniValue(text, 'render', 'backend');
  if (value === 'webgl2') return 2;
  if (value === 'software') return 1;
  if (value && value !== 'auto' && value !== 'webgpu' && value !== 'opengl' && PES6.Core)
    PES6.Core.pushLine('Renderer desconocido: ' + value + '. Se usará el automático.', true);
  return 3;
}
function capabilities(module) {
  if (typeof module._pes6_renderer_capabilities === 'function')
    return module.ccall('pes6_renderer_capabilities', 'number', [], []);
  return module.ccall('pes6_internal_scale_supported', 'number', [], []) ? 3 : 1;
}
function active(module) {
  if (startedReport) return startedReport.selected;
  if (typeof module._pes6_active_renderer === 'function')
    return module.ccall('pes6_active_renderer', 'number', [], []);
  return capabilities(module) & 2 ? 2 : 1;
}
function updateControls(module) {
  var select = document.getElementById('rendererSelect');
  if (!select) return;
  var supported = (capabilities(module) & 4) && !!(window.navigator && window.navigator.gpu);
  Array.prototype.forEach.call(select.options, function (option) {
    if (option.value === 'webgpu') option.disabled = !supported;
  });
  var note = document.getElementById('rendererNote');
  if (startedReport) {
    note.textContent = 'En uso: ' + names[startedReport.selected] +
      (startedReport.reason ? '. ' + startedReport.reason : '') +
      '. El cambio se aplica al reiniciar el juego.';
  } else {
    note.textContent = supported ? 'El cambio de renderer se aplica al reiniciar el juego.'
      : 'WebGPU no está disponible en este navegador o en esta versión del motor.';
  }
  var nativeSelect = document.querySelector && document.querySelector('[data-key="native_renderer_replace"]');
  if (nativeSelect) {
    nativeSelect.disabled = false;
    nativeSelect.title = '';
  }
}
function onStarted(report) {
  if (lastPrepared) {
    report.requested = lastPrepared.requested;
    report.reason = report.reason || lastPrepared.reason;
  }
  startedReport = report;
  updateControls(window.Module);
  PES6.Settings.applyRendererLimits();
}
function hasPendingChange(text) {
  return requested(text) !== (startedReport ? startedReport.requested : active(window.Module));
}
function prepare(module, text) {
  if (pending) return pending.promise;
  var desired = requested(text), selected = desired, reason = '';
  try {
    var saved = window.sessionStorage && window.sessionStorage.getItem(recoveryKey);
    if (saved) {
      window.sessionStorage.removeItem(recoveryKey);
      recoveryUsed = true;
      selected = 2;
      reason = JSON.parse(saved).reason || 'WebGPU no pudo iniciar.';
    }
  } catch (e) { reason = 'No se pudo leer la recuperación del renderer.'; }
  var caps = capabilities(module);
  var fallback = caps & 2 ? 2 : 1;
  if (!(caps & (1 << (selected - 1))) ||
      (selected === 3 && !(window.navigator && window.navigator.gpu))) {
    selected = fallback;
    reason = 'WebGPU no está disponible en este navegador o motor.';
  }
  if (typeof module._pes6_prepare_renderer !== 'function') {
    lastPrepared = { requested: desired, selected: fallback, reason: reason };
    return Promise.resolve(lastPrepared);
  }
  var resolve, reject;
  var promise = new Promise(function (yes, no) { resolve = yes; reject = no; });
  pending = { promise: promise, resolve: resolve, reject: reject, desired: desired,
    reason: reason, module: module, timer: null };
  pending.timer = setTimeout(function () {
    if (!pending) return;
    var timedOut = pending;
    pending = null;
    if (typeof module._pes6_cancel_renderer_preparation === 'function')
      module.ccall('pes6_cancel_renderer_preparation', null, [], []);
    lastPrepared = { requested: desired, selected: fallback, reason: 'WebGPU tardó demasiado en iniciar.' };
    timedOut.resolve(lastPrepared);
  }, 20000);
  try { module.ccall('pes6_prepare_renderer', null, ['number'], [selected]); }
  catch (e) { onPrepared({ selected: 0, reason: String(e) }); }
  return promise;
}
function onPrepared(report) {
  if (!pending) return;
  var waiting = pending;
  pending = null;
  clearTimeout(waiting.timer);
  if (!report.selected) { waiting.reject(Error(report.reason || 'No se pudo iniciar el renderer.')); return; }
  lastPrepared = { requested: waiting.desired, selected: report.selected,
    reason: waiting.reason || report.reason || '' };
  waiting.resolve(lastPrepared);
}
function retryWithWebGL2(reason) {
  if (recoveryUsed) return false;
  try {
    window.sessionStorage.setItem(recoveryKey, JSON.stringify({ reason: reason }));
    recoveryUsed = true;
    window.location.reload();
    return true;
  } catch (e) {
    PES6.Core.pushLine('No se pudo preparar la recuperación. Elegí WebGL2 y recargá la página.', true);
    return false;
  }
}
function onLost(report) {
  PES6.Core.pushLine('Renderer detenido: ' + report.reason, true);
  PES6.Core.setStatus('Renderer detenido. Reiniciá con WebGL2.');
  var button = document.getElementById('rendererRetry');
  if (button) {
    button.hidden = false;
    button.onclick = function () {
      if (!retryWithWebGL2(report.reason) && PES6.Settings.saveRendererForRestart)
        PES6.Settings.saveRendererForRestart('webgl2', function (err) {
          if (!err) window.location.reload();
        });
    };
  }
  if (report.startup) retryWithWebGL2(report.reason);
}
Runtime.Renderer = { requested: requested, capabilities: capabilities, active: active,
  updateControls: updateControls, onStarted: onStarted, hasPendingChange: hasPendingChange,
  prepare: prepare, onPrepared: onPrepared, onLost: onLost, retryWithWebGL2: retryWithWebGL2 };
})(window.PES6);
