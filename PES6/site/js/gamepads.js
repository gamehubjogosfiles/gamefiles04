(function (PES6) {
// --- Browser pads: tester and calibration -------------------------
// SDL lays every browser pad out as the "standard" Gamepad mapping. Pads
// whose Gamepad.mapping is not "standard" (generic USB pads, D-input
// mode, some browsers' PlayStation and Switch support) report buttons
// and axes in their own order, so the page calibrates them and hands SDL
// a mapping for that pad (pes6_add_controller_mapping). Calibrations are
// keyed by Gamepad.id: pads of one model share it, as they share SDL's GUID.
var CONTROLLER_MAPPINGS_STORAGE_KEY = 'pes6-controller-mappings-v1';
// SDL's built-in Emscripten mapping; handing it back undoes a calibration.
var STANDARD_MAPPING_BODY = 'a:b0,b:b1,back:b8,dpdown:b13,dpleft:b14,dpright:b15,dpup:b12,' +
  'guide:b16,leftshoulder:b4,leftstick:b10,lefttrigger:b6,leftx:a0,lefty:a1,rightshoulder:b5,' +
  'rightstick:b11,righttrigger:b7,rightx:a2,righty:a3,start:b9,x:b2,y:b3,';
// SDL mapping targets in the order the calibration asks for them. Axis
// steps ask for the positive direction; an axis the pad reports the
// other way round is recorded inverted.
var CALIBRATION_STEPS = [
  { target: 'a', prompt: 'Presioná Cruz (✕)' },
  { target: 'b', prompt: 'Presioná Círculo (○)' },
  { target: 'x', prompt: 'Presioná Cuadrado (□)' },
  { target: 'y', prompt: 'Presioná Triángulo (△)' },
  { target: 'dpup', prompt: 'Presioná D-Pad arriba' },
  { target: 'dpdown', prompt: 'Presioná D-Pad abajo' },
  { target: 'dpleft', prompt: 'Presioná D-Pad izquierda' },
  { target: 'dpright', prompt: 'Presioná D-Pad derecha' },
  { target: 'leftshoulder', prompt: 'Presioná L' },
  { target: 'rightshoulder', prompt: 'Presioná R' },
  { target: 'lefttrigger', prompt: 'Presioná L2' },
  { target: 'righttrigger', prompt: 'Presioná R2' },
  { target: 'back', prompt: 'Presioná Select' },
  { target: 'start', prompt: 'Presioná Start' },
  { target: 'leftx', prompt: 'Mové el stick izquierdo hacia la derecha', axis: true },
  { target: 'lefty', prompt: 'Mové el stick izquierdo hacia abajo', axis: true }
];
var PAD_AXIS_THRESHOLD = 0.5;
// A hat reported as a single axis (Chrome, D-input pads) rests beyond 1.
var PAD_HAT_REST = 1.05;

function readControllerMappings() {
  try {
    var mappings = JSON.parse(localStorage.getItem(CONTROLLER_MAPPINGS_STORAGE_KEY) || '{}');
    return mappings && typeof mappings === 'object' ? mappings : {};
  } catch (e) { return {}; }
}
var controllerMappings = readControllerMappings();
function saveControllerMappings() {
  try {
    localStorage.setItem(CONTROLLER_MAPPINGS_STORAGE_KEY, JSON.stringify(controllerMappings));
  } catch (e) { /* private mode or storage disabled: calibrations just won't persist */ }
}
// Runs once the presenter exists. SDL keeps a mapping for a pad that
// connects later.
function applySavedControllerMappings() {
  Object.keys(controllerMappings).forEach(function (id) {
    var line = controllerMappings[id] && controllerMappings[id].line;
    if (!line) return;
    if (!window.Module.ccall('pes6_restore_controller_mapping', 'number', ['string'], [line]))
      PES6.Core.pushLine('Could not restore the controller calibration of ' + id, true);
  });
}

// SDL mapping sources: "b3" button, "a2" full axis, "+a1"/"-a6" half
// axis, a trailing "~" inverts the axis.
function parsePadSource(source) {
  var match = /^([+-]?)([ab])(\d+)(~?)$/.exec(source || '');
  if (!match) return null;
  return { half: match[1], axis: match[2] === 'a', index: parseInt(match[3], 10), inverted: match[4] === '~' };
}
function padSourcePressed(pad, source) {
  var parsed = parsePadSource(source);
  if (!parsed) return false;
  if (!parsed.axis) return !!(pad.buttons[parsed.index] && pad.buttons[parsed.index].pressed);
  var value = pad.axes[parsed.index] || 0;
  if (parsed.inverted) value = -value;
  return parsed.half === '-' ? value < -PAD_AXIS_THRESHOLD : value > PAD_AXIS_THRESHOLD;
}
// Signed value of a full-axis source; 0 for any other source.
function padAxisValue(pad, source) {
  var parsed = parsePadSource(source);
  if (!parsed || !parsed.axis || parsed.half) return 0;
  var value = pad.axes[parsed.index] || 0;
  return parsed.inverted ? -value : value;
}
function parseMappingBody(body) {
  var layout = {};
  body.split(',').forEach(function (field) {
    var colon = field.indexOf(':');
    if (colon > 0) layout[field.slice(0, colon)] = field.slice(colon + 1);
  });
  return layout;
}
var STANDARD_LAYOUT = parseMappingBody(STANDARD_MAPPING_BODY);
// The layout SDL uses for this pad: its calibration, else the standard one.
function padLayout(pad) {
  var saved = controllerMappings[pad.id];
  return saved && saved.body ? parseMappingBody(saved.body) : STANDARD_LAYOUT;
}

var padListEl = document.getElementById('padList');
var padWizardEl = document.getElementById('padWizard');
var padWizardStepEl = document.getElementById('padWizardStep');
var padWizardNoteEl = document.getElementById('padWizardNote');
var padTesterRunning = false;
var padListSignature = null;
var calibration = null;

function connectedPads() {
  var pads = navigator.getGamepads ? navigator.getGamepads() : [];
  var list = [];
  for (var i = 0; i < pads.length; i++) if (pads[i]) list.push(pads[i]);
  return list;
}
function padStatusText(pad) {
  var counts = pad.buttons.length + ' botones · ' + pad.axes.length + ' ejes';
  if (controllerMappings[pad.id]) return 'Calibrado · ' + counts;
  if (pad.mapping === 'standard') return 'Distribución estándar · ' + counts;
  return 'Distribución no estándar: calibralo · ' + counts;
}
function renderPadList(pads) {
  padListEl.textContent = '';
  if (!pads.length) {
    var empty = document.createElement('div');
    empty.className = 'padEmpty';
    empty.textContent = 'Ningún mando visible. El navegador muestra un mando recién cuando ' +
      'presionás uno de sus botones con la página en foco.' +
      (window.isSecureContext ? '' : ' Esta página no se sirve por https: el navegador puede bloquear los mandos.');
    padListEl.appendChild(empty);
    return;
  }
  pads.forEach(function (pad) {
    var calibrated = !!controllerMappings[pad.id];
    var row = document.createElement('div');
    row.className = 'padRow';
    var name = document.createElement('div');
    name.className = 'padName';
    name.textContent = 'Mando ' + (pad.index + 1) + ': ' + pad.id;
    var meta = document.createElement('div');
    meta.className = 'padMeta' + (pad.mapping !== 'standard' && !calibrated ? ' warn' : '');
    meta.textContent = padStatusText(pad);
    var live = document.createElement('div');
    live.className = 'padLive';
    live.dataset.pad = pad.index;
    var actions = document.createElement('div');
    actions.className = 'row';
    var calibrate = document.createElement('button');
    calibrate.className = 'btn small';
    calibrate.textContent = 'Calibrar';
    calibrate.onclick = function () { startCalibration(pad.index); };
    actions.appendChild(calibrate);
    if (calibrated) {
      var remove = document.createElement('button');
      remove.className = 'btn small';
      remove.textContent = 'Quitar calibración';
      remove.onclick = function () { removeCalibration(pad.id); };
      actions.appendChild(remove);
    }
    row.appendChild(name);
    row.appendChild(meta);
    row.appendChild(live);
    row.appendChild(actions);
    padListEl.appendChild(row);
  });
}
// Pressed buttons and moved axes, named as SDL mapping sources.
function padLiveText(pad) {
  var parts = [];
  pad.buttons.forEach(function (button, index) { if (button.pressed) parts.push('b' + index); });
  pad.axes.forEach(function (value, index) {
    if (Math.abs(value) > 0.2) parts.push('a' + index + '=' + value.toFixed(2));
  });
  return parts.length ? parts.join('  ') : '(sin entradas)';
}

// Polls while the Controls modal is open; the browser has no input
// events for pads.
function startPadTester() {
  padListSignature = null;
  if (padTesterRunning) return;
  padTesterRunning = true;
  requestAnimationFrame(padTesterFrame);
}
function padTesterFrame() {
  if (PES6.Controls.Bindings.isModalHidden()) {
    padTesterRunning = false;
    cancelCalibration();
    return;
  }
  var pads = connectedPads();
  var signature = pads.map(function (pad) { return pad.index + ':' + pad.id; }).join('|');
  if (signature !== padListSignature) {
    padListSignature = signature;
    renderPadList(pads);
  }
  pads.forEach(function (pad) {
    var live = padListEl.querySelector('.padLive[data-pad="' + pad.index + '"]');
    if (live) live.textContent = padLiveText(pad);
  });
  if (calibration) stepCalibration(pads);
  requestAnimationFrame(padTesterFrame);
}

// Axis rest values are taken when the calibration starts, so triggers
// resting at -1 and hats resting beyond 1 are told apart from a press.
function startCalibration(index) {
  PES6.Controls.Bindings.cancelCapture();
  var pad = connectedPads().filter(function (candidate) { return candidate.index === index; })[0];
  if (!pad) return;
  calibration = {
    index: index, id: pad.id, step: 0, fields: [],
    rest: Array.prototype.slice.call(pad.axes), waitRelease: true
  };
  padWizardEl.hidden = false;
  showCalibrationStep('');
}
function showCalibrationStep(note) {
  padWizardStepEl.textContent = (calibration.step + 1) + '/' + CALIBRATION_STEPS.length + ': ' +
    CALIBRATION_STEPS[calibration.step].prompt;
  padWizardNoteEl.textContent = note;
}
function cancelCalibration() {
  calibration = null;
  padWizardEl.hidden = true;
}
function advanceCalibration(source) {
  if (source) calibration.fields.push(CALIBRATION_STEPS[calibration.step].target + ':' + source);
  calibration.step++;
  calibration.waitRelease = true;
  if (calibration.step < CALIBRATION_STEPS.length) showCalibrationStep('');
  else finishCalibration();
}
function padIsIdle(pad, rest) {
  for (var i = 0; i < pad.buttons.length; i++) if (pad.buttons[i].pressed) return false;
  for (var j = 0; j < pad.axes.length; j++)
    if (Math.abs(pad.axes[j] - (rest[j] || 0)) > PAD_AXIS_THRESHOLD) return false;
  return true;
}
// What the pad moved away from rest for this step: { source } for a
// mappable input, { hat } for a hat axis SDL cannot map, null for nothing.
function calibrationInput(pad, step) {
  for (var i = 0; i < pad.buttons.length; i++) {
    if (pad.buttons[i].pressed) return step.axis ? null : { source: 'b' + i };
  }
  for (var j = 0; j < pad.axes.length; j++) {
    var rest = calibration.rest[j] || 0;
    var delta = pad.axes[j] - rest;
    if (Math.abs(delta) <= PAD_AXIS_THRESHOLD) continue;
    if (Math.abs(rest) > PAD_HAT_REST) return { hat: j };
    if (step.axis) return { source: 'a' + j + (delta > 0 ? '' : '~') };
    // A trigger resting at one end uses its whole travel.
    if (rest < -PAD_AXIS_THRESHOLD) return { source: 'a' + j };
    if (rest > PAD_AXIS_THRESHOLD) return { source: 'a' + j + '~' };
    return { source: (delta > 0 ? '+a' : '-a') + j };
  }
  return null;
}
function stepCalibration(pads) {
  var pad = pads.filter(function (candidate) { return candidate.index === calibration.index; })[0];
  if (!pad || pad.id !== calibration.id) {
    cancelCalibration();
    PES6.Controls.Bindings.setStatus('Calibración cancelada: se desconectó el mando.');
    return;
  }
  // Each step waits for the previous input to be let go.
  if (calibration.waitRelease) {
    if (padIsIdle(pad, calibration.rest)) calibration.waitRelease = false;
    return;
  }
  var input = calibrationInput(pad, CALIBRATION_STEPS[calibration.step]);
  if (!input) return;
  if (input.source) {
    advanceCalibration(input.source);
    return;
  }
  calibration.waitRelease = true;
  padWizardNoteEl.textContent = 'Este mando informa el D-Pad como un hat en el eje ' + input.hat +
    ', que el navegador no permite mapear. Tocá Saltar y usá el stick.';
}
function finishCalibration() {
  var id = calibration.id;
  var body = calibration.fields.length ? calibration.fields.join(',') + ',' : '';
  cancelCalibration();
  if (!body) {
    PES6.Controls.Bindings.setStatus('Calibración vacía: no se cambió nada.');
    return;
  }
  var line = window.Module.ccall('pes6_add_controller_mapping', 'string', ['string', 'string'], [id, body]);
  if (!line) {
    PES6.Controls.Bindings.setStatus('El juego no encontró este mando. Volvé a conectarlo y probá de nuevo.');
    return;
  }
  controllerMappings[id] = { line: line, body: body };
  saveControllerMappings();
  padListSignature = null;
  PES6.Controls.Bindings.renderPlayer();
  PES6.Controls.Bindings.setStatus('Mando calibrado. Si antes reasignaste sus botones, usá "Restablecer este jugador".');
}
function removeCalibration(id) {
  cancelCalibration();
  if (!window.Module.ccall('pes6_add_controller_mapping', 'string', ['string', 'string'], [id, STANDARD_MAPPING_BODY])) {
    PES6.Controls.Bindings.setStatus('No se pudo quitar la calibración. Conectá el mando y probá de nuevo.');
    return;
  }
  delete controllerMappings[id];
  saveControllerMappings();
  padListSignature = null;
  PES6.Controls.Bindings.renderPlayer();
  PES6.Controls.Bindings.setStatus('Calibración quitada.');
}
document.getElementById('padWizardSkip').onclick = function () {
  if (calibration) advanceCalibration('');
};
document.getElementById('padWizardCancel').onclick = function () {
  cancelCalibration();
  PES6.Controls.Bindings.setStatus('Calibración cancelada.');
};

// Connection notices over the game. A pad SDL would lay out wrongly
// points at the calibration.
window.addEventListener('gamepadconnected', function (event) {
  var pad = event.gamepad;
  if (pad.mapping !== 'standard' && !controllerMappings[pad.id]) {
    PES6.Savedata.toast('Mando no estándar: calibralo en Controles', true);
  } else {
    PES6.Savedata.toast('Mando ' + (pad.index + 1) + ' conectado');
  }
});
window.addEventListener('gamepaddisconnected', function (event) {
  PES6.Savedata.toast('Mando ' + (event.gamepad.index + 1) + ' desconectado', true);
});

PES6.Controls = PES6.Controls || {};
PES6.Controls.Gamepads = {
  axisThreshold: PAD_AXIS_THRESHOLD,
  applySavedMappings: applySavedControllerMappings,
  startTester: startPadTester,
  cancelCalibration: cancelCalibration,
  padSourcePressed: padSourcePressed,
  padAxisValue: padAxisValue,
  padLayout: padLayout
};
})(window.PES6);
