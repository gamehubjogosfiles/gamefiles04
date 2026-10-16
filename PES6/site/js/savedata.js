(function (PES6) {
// --- Savedata slot picker ------------------------------------------
// PES6 saves cups/leagues through the PSP's list dialogs. The savedata HLE
// (pes6_hle_savedata.cpp) keeps such a dialog open and calls
// window.Module.onSavedataDialog; the game waits, as on the PSP, until
// pes6_savedata_dialog_choose answers with a slot index or -1 (cancel).
// PspUtilitySavedataMode values.
var SAVEDATA_LIST_LOAD = 4, SAVEDATA_LIST_SAVE = 5, SAVEDATA_LIST_DELETE = 6;
var SAVEDATA_TITLES = {};
SAVEDATA_TITLES[SAVEDATA_LIST_LOAD] = 'Cargar partida';
SAVEDATA_TITLES[SAVEDATA_LIST_SAVE] = 'Guardar partida';
SAVEDATA_TITLES[SAVEDATA_LIST_DELETE] = 'Borrar partida';
var savedataDialogEl = document.getElementById('savedataDialog');
var savedataListEl = document.getElementById('savedataList');
var savedataStatusEl = document.getElementById('savedataStatus');
var savedataConfirmEl = document.getElementById('savedataConfirm');
var savedata = { mode: 0, slots: [], selected: -1, confirming: false, open: false };

function savedataSelectable(slot) {
  return savedata.mode === SAVEDATA_LIST_SAVE || slot.used;
}
function openSavedataDialog() {
  var json = window.Module.ccall('pes6_savedata_dialog_json', 'string', [], []);
  if (!json) return;
  var state = JSON.parse(json);
  savedata.mode = state.mode;
  savedata.slots = state.slots;
  savedata.confirming = false;
  savedata.selected = -1;
  if (state.slots[state.focus] && savedataSelectable(state.slots[state.focus])) {
    savedata.selected = state.focus;
  } else {
    for (var i = 0; i < state.slots.length && savedata.selected < 0; i++)
      if (savedataSelectable(state.slots[i])) savedata.selected = i;
  }
  document.getElementById('savedataTitle').textContent = SAVEDATA_TITLES[state.mode] || 'Partidas';
  savedata.open = true;
  savedataDialogEl.hidden = false;
  renderSavedataSlots();
  startSavedataGamepadPoll();
}
function renderSavedataSlots() {
  savedataListEl.textContent = '';
  savedata.slots.forEach(function (slot, index) {
    var button = document.createElement('button');
    button.className = 'slot' + (index === savedata.selected ? ' selected' : '');
    button.disabled = !savedataSelectable(slot);
    var name = document.createElement('span');
    name.textContent = 'Slot ' + (index + 1);
    var when = document.createElement('span');
    when.className = 'when';
    when.textContent = slot.used ? new Date(slot.time).toLocaleString() : 'Vacío';
    button.appendChild(name);
    button.appendChild(when);
    button.onclick = function () {
      if (savedata.selected === index) { confirmSavedata(); return; }
      selectSavedataSlot(index);
    };
    savedataListEl.appendChild(button);
  });
  savedataConfirmEl.disabled = savedata.selected < 0;
  if (!savedata.confirming) {
    savedataStatusEl.textContent = savedata.slots.some(savedataSelectable) ? ''
      : 'No hay partidas guardadas.';
  }
  var selectedEl = savedataListEl.children[savedata.selected];
  if (selectedEl) selectedEl.scrollIntoView({ block: 'nearest' });
}
function selectSavedataSlot(index) {
  savedata.selected = index;
  savedata.confirming = false;
  renderSavedataSlots();
}
function moveSavedataSelection(step) {
  for (var index = savedata.selected + step; index >= 0 && index < savedata.slots.length; index += step) {
    if (savedataSelectable(savedata.slots[index])) { selectSavedataSlot(index); return; }
  }
}
// Overwriting or deleting a used slot asks once more, as the PSP does.
function confirmSavedata() {
  if (savedata.selected < 0) return;
  var slot = savedata.slots[savedata.selected];
  var destructive = savedata.mode === SAVEDATA_LIST_DELETE ||
                    (savedata.mode === SAVEDATA_LIST_SAVE && slot.used);
  if (destructive && !savedata.confirming) {
    savedata.confirming = true;
    savedataStatusEl.textContent = savedata.mode === SAVEDATA_LIST_DELETE
      ? '¿Borrar este slot? Aceptá de nuevo para confirmar.'
      : '¿Sobrescribir este slot? Aceptá de nuevo para confirmar.';
    return;
  }
  closeSavedataDialog(savedata.selected);
}
function closeSavedataDialog(index) {
  if (!savedata.open) return;
  savedata.open = false;
  savedataDialogEl.hidden = true;
  window.Module.ccall('pes6_savedata_dialog_choose', null, ['number'], [index]);
  PES6.Core.elements.canvas.focus();
}
savedataConfirmEl.onclick = confirmSavedata;
document.getElementById('savedataCancel').onclick = function () { closeSavedataDialog(-1); };

// Key presses reach the picker before SDL sees them, so the game gets no
// stray input. Releases still go through: the key that chose "Guardar" in
// the game is held when the picker opens, and SDL has to see it let go.
var SAVEDATA_KEYS = { ArrowUp: -1, ArrowDown: 1, Enter: 'ok', ' ': 'ok', Escape: 'cancel', Backspace: 'cancel' };
window.addEventListener('keydown', function (event) {
  if (!savedata.open || !(event.key in SAVEDATA_KEYS)) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  var action = SAVEDATA_KEYS[event.key];
  // Auto-repeat only scrolls; it never accepts or cancels.
  if (event.repeat && typeof action !== 'number') return;
  if (action === 'ok') confirmSavedata();
  else if (action === 'cancel') closeSavedataDialog(-1);
  else moveSavedataSelection(action);
}, true);

// Gamepads in the layout SDL gives them (padLayout: the calibration when
// there is one, else the standard mapping): D-pad or left stick, Cross
// accepts, Circle cancels. Buttons held when the picker opens (the press
// that chose "Guardar" in the game) count only after they are released.
function savedataGamepadActions() {
  var held = { up: false, down: false, ok: false, cancel: false };
  var pads = navigator.getGamepads ? navigator.getGamepads() : [];
  for (var i = 0; i < pads.length; i++) {
    var pad = pads[i];
    if (!pad) continue;
    var layout = PES6.Controls.Gamepads.padLayout(pad);
    var stick = PES6.Controls.Gamepads.padAxisValue(pad, layout.lefty);
    held.up = held.up || PES6.Controls.Gamepads.padSourcePressed(pad, layout.dpup) || stick < -PES6.Controls.Gamepads.axisThreshold;
    held.down = held.down || PES6.Controls.Gamepads.padSourcePressed(pad, layout.dpdown) || stick > PES6.Controls.Gamepads.axisThreshold;
    held.ok = held.ok || PES6.Controls.Gamepads.padSourcePressed(pad, layout.a);
    held.cancel = held.cancel || PES6.Controls.Gamepads.padSourcePressed(pad, layout.b);
  }
  return held;
}
function startSavedataGamepadPoll() {
  var previous = savedataGamepadActions();
  function poll() {
    if (!savedata.open) return;
    var held = savedataGamepadActions();
    if (held.up && !previous.up) moveSavedataSelection(-1);
    if (held.down && !previous.down) moveSavedataSelection(1);
    if (held.ok && !previous.ok) confirmSavedata();
    if (held.cancel && !previous.cancel) closeSavedataDialog(-1);
    previous = held;
    requestAnimationFrame(poll);
  }
  requestAnimationFrame(poll);
}

// Notice over the game for saves, deletes and picked loads. Silent for a
// cancel and for the automatic load at boot.
var toastEl = document.getElementById('toast');
var toastTimer = 0;
function showToast(text, error) {
  toastEl.textContent = text;
  toastEl.className = 'toast' + (error ? ' error' : '');
  toastEl.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { toastEl.hidden = true; }, 2500);
}
function showSavedataResult(mode, result) {
  var CANCELLED = 1;
  if (result === CANCELLED) return;
  var ok = result === 0;
  if (mode === 1 || mode === 3 || mode === SAVEDATA_LIST_SAVE) {
    showToast(ok ? 'Partida guardada' : 'No se pudo guardar la partida', !ok);
  } else if (mode === 7 || mode === SAVEDATA_LIST_DELETE) {
    showToast(ok ? 'Partida borrada' : 'No se pudo borrar la partida', !ok);
  } else if (mode === SAVEDATA_LIST_LOAD) {
    showToast(ok ? 'Partida cargada' : 'No se pudo cargar la partida', !ok);
  } else {
    return;
  }
  if (ok && PES6.Storage.isReady()) PES6.Saves.render();
}

PES6.Savedata = {
  openDialog: openSavedataDialog,
  showResult: showSavedataResult,
  toast: showToast
};
})(window.PES6);
