(function (PES6) {
// --- On-screen touch pad -------------------------------------------
// A PSP pad drawn over the game. Every finger is tracked on its own, so
// the stick and the buttons work at once; a finger sliding off a button
// onto another presses the new one. The combined state goes to the engine
// (pes6_set_touch_input) only when it changes, and there it is layered over
// player 1's pad instead of replacing it.

// psprecomp::psp::PspButton masks (psp/include/psprecomp/psp/psp_input.hpp).
var BUTTON_MASKS = {
  Select: 0x00000001, Start: 0x00000008,
  Up: 0x00000010, Right: 0x00000020, Down: 0x00000040, Left: 0x00000080,
  L: 0x00000100, R: 0x00000200,
  Triangle: 0x00001000, Circle: 0x00002000, Cross: 0x00004000, Square: 0x00008000,
  L2: 0x10000000, R2: 0x20000000
};
var STICK_CENTER = 128;
// Fraction of the stick radius that reads as centered.
var STICK_DEAD_ZONE = 0.15;
// Fraction of the d-pad half size that presses nothing.
var DPAD_DEAD_ZONE = 0.25;
// tan(22.5 deg): each direction covers a 135 degree cone, so the four
// corners press both of their neighbours.
var DPAD_DIAGONAL_RATIO = 0.4142;
// Holding a latchable button this long keeps it pressed after release;
// the next tap on it releases it.
var LATCH_HOLD_MS = 1000;
var LATCHABLE_MASK = BUTTON_MASKS.R;
// auto (default) shows the pad on touch screens; General > Controles
// táctiles can force it on or off (kept in localStorage).
var STORAGE_KEY = 'pes6.touchControls';

var padEl = document.getElementById('touchPad');
var stickEl = padEl.querySelector('[data-stick]');
var knobEl = padEl.querySelector('.touch-stick-knob');
var buttonEls = Array.prototype.slice.call(padEl.querySelectorAll('[data-button]'));
var toggleEl = document.getElementById('touchControls');

var gameStarted = false;
// A touch screen is the primary pointer, or a finger touched the page.
// A gamepad connecting clears it, so auto hides the pad for pad players.
var touchSeen = window.matchMedia('(pointer: coarse)').matches;
// pointerId -> button mask held by that finger (0 over a gap).
var buttonPointers = {};
var stickPointer = null;
var stick = { lx: STICK_CENTER, ly: STICK_CENTER };
var sent = { buttons: 0, lx: STICK_CENTER, ly: STICK_CENTER };
// Latchable buttons kept pressed with no finger on them.
var latched = 0;
var latchTimer = null;
var latchPointer = null;
// pointerId -> true for fingers whose tap released a latch; they press no
// latchable button until lifted.
var unlatchPointers = {};

function storedMode() {
  try { return localStorage.getItem(STORAGE_KEY) || 'auto'; } catch (e) { return 'auto'; }
}

function isVisible() {
  var mode = toggleEl.value;
  return gameStarted && (mode === 'on' || (mode === 'auto' && touchSeen));
}

function heldButtons() {
  var mask = latched;
  for (var id in buttonPointers) mask |= buttonPointers[id];
  return mask;
}

function send() {
  var buttons = heldButtons();
  buttonEls.forEach(function (el) {
    var buttonMask = BUTTON_MASKS[el.dataset.button];
    el.classList.toggle('pressed', (buttons & buttonMask) !== 0);
    el.classList.toggle('latched', (latched & buttonMask) !== 0);
  });
  if (buttons === sent.buttons && stick.lx === sent.lx && stick.ly === sent.ly) return;
  sent = { buttons: buttons, lx: stick.lx, ly: stick.ly };
  if (!gameStarted || typeof window.Module._pes6_set_touch_input !== 'function') return;
  window.Module.ccall('pes6_set_touch_input', null, ['number', 'number', 'number'],
                      [buttons >>> 0, stick.lx, stick.ly]);
}

// Offset of (x, y) from the center of rect, in half sizes (-1..1 at the edges).
function offsetFromCenter(rect, x, y) {
  return {
    x: (x - rect.left - rect.width / 2) / (rect.width / 2),
    y: (y - rect.top - rect.height / 2) / (rect.height / 2)
  };
}

function dpadMask(el, x, y) {
  var offset = offsetFromCenter(el.getBoundingClientRect(), x, y);
  var ax = Math.abs(offset.x), ay = Math.abs(offset.y);
  if (ax * ax + ay * ay < DPAD_DEAD_ZONE * DPAD_DEAD_ZONE) return 0;
  var mask = 0;
  if (ax > ay * DPAD_DIAGONAL_RATIO) mask |= offset.x < 0 ? BUTTON_MASKS.Left : BUTTON_MASKS.Right;
  if (ay > ax * DPAD_DIAGONAL_RATIO) mask |= offset.y < 0 ? BUTTON_MASKS.Up : BUTTON_MASKS.Down;
  return mask;
}

// Button mask under a finger: a button, a d-pad direction, or 0.
function maskAt(x, y) {
  var hit = document.elementFromPoint(x, y);
  var el = hit && padEl.contains(hit) ? hit.closest('[data-button], [data-dpad]') : null;
  if (!el) return 0;
  return el.hasAttribute('data-dpad') ? dpadMask(el, x, y) : BUTTON_MASKS[el.dataset.button];
}

// PSP stick axis (0..255, 128 centered) from a -1..1 offset past the dead zone.
function stickAxis(value) {
  return Math.max(0, Math.min(255, Math.round(STICK_CENTER + value * 127)));
}

function moveStick(x, y) {
  var rect = stickEl.getBoundingClientRect();
  var offset = offsetFromCenter(rect, x, y);
  var length = Math.sqrt(offset.x * offset.x + offset.y * offset.y);
  if (length > 1) { offset.x /= length; offset.y /= length; length = 1; }
  knobEl.style.transform = 'translate(' + (offset.x * rect.width / 2) + 'px,' +
                           (offset.y * rect.height / 2) + 'px)';
  if (length < STICK_DEAD_ZONE) {
    stick = { lx: STICK_CENTER, ly: STICK_CENTER };
    return;
  }
  var scale = (length - STICK_DEAD_ZONE) / (1 - STICK_DEAD_ZONE) / length;
  stick = { lx: stickAxis(offset.x * scale), ly: stickAxis(offset.y * scale) };
}

function centerStick() {
  stickPointer = null;
  knobEl.style.transform = '';
  stick = { lx: STICK_CENTER, ly: STICK_CENTER };
}

function cancelLatchTimer() {
  clearTimeout(latchTimer);
  latchTimer = null;
  latchPointer = null;
}

// A finger landing on a latchable button: releases it when latched, else
// starts the hold timer that latches it.
function pressLatchable(pointerId, mask) {
  if (!(mask & LATCHABLE_MASK)) return mask;
  if (latched & mask & LATCHABLE_MASK) {
    latched &= ~(mask & LATCHABLE_MASK);
    unlatchPointers[pointerId] = true;
    return mask & ~LATCHABLE_MASK;
  }
  cancelLatchTimer();
  latchPointer = pointerId;
  latchTimer = setTimeout(function () {
    latched |= mask & LATCHABLE_MASK;
    latchTimer = null;
    latchPointer = null;
    send();
  }, LATCH_HOLD_MS);
  return mask;
}

// Button mask for a finger already down; sliding off the latchable button
// cancels its hold timer.
function movedMask(pointerId, x, y) {
  var mask = maskAt(x, y);
  if (pointerId in unlatchPointers) mask &= ~LATCHABLE_MASK;
  if (pointerId === latchPointer && !(mask & LATCHABLE_MASK)) cancelLatchTimer();
  return mask;
}

function releaseAll() {
  buttonPointers = {};
  latched = 0;
  unlatchPointers = {};
  cancelLatchTimer();
  centerStick();
  send();
}

function onPointerDown(event) {
  event.preventDefault();
  event.target.setPointerCapture(event.pointerId);
  if (stickPointer === null && stickEl.contains(event.target)) {
    stickPointer = event.pointerId;
    moveStick(event.clientX, event.clientY);
  } else {
    buttonPointers[event.pointerId] =
        pressLatchable(event.pointerId, maskAt(event.clientX, event.clientY));
  }
  send();
}

function onPointerMove(event) {
  if (event.pointerId === stickPointer) moveStick(event.clientX, event.clientY);
  else if (event.pointerId in buttonPointers)
    buttonPointers[event.pointerId] = movedMask(event.pointerId, event.clientX, event.clientY);
  else return;
  send();
}

function onPointerUp(event) {
  if (event.pointerId === stickPointer) {
    centerStick();
  } else {
    delete buttonPointers[event.pointerId];
    delete unlatchPointers[event.pointerId];
    if (event.pointerId === latchPointer) cancelLatchTimer();
  }
  send();
}

function refresh() {
  var visible = isVisible();
  if (padEl.hidden === !visible) return;
  padEl.hidden = !visible;
  if (!visible) releaseAll();
}

padEl.addEventListener('pointerdown', onPointerDown);
padEl.addEventListener('pointermove', onPointerMove);
padEl.addEventListener('pointerup', onPointerUp);
padEl.addEventListener('pointercancel', onPointerUp);
// Keeps taps on the pad from turning into clicks, double-tap zoom or the
// stage's double-click fullscreen toggle.
padEl.addEventListener('touchstart', function (event) { event.preventDefault(); }, { passive: false });
padEl.addEventListener('contextmenu', function (event) { event.preventDefault(); });

window.addEventListener('pointerdown', function (event) {
  if (event.pointerType !== 'touch' || touchSeen) return;
  touchSeen = true;
  refresh();
}, true);
window.addEventListener('gamepadconnected', function () {
  touchSeen = false;
  refresh();
});
window.addEventListener('blur', releaseAll);
document.addEventListener('visibilitychange', function () {
  if (document.hidden) releaseAll();
});

toggleEl.value = storedMode();
toggleEl.onchange = function () {
  try { localStorage.setItem(STORAGE_KEY, toggleEl.value); } catch (e) {}
  refresh();
};

PES6.Controls = PES6.Controls || {};
PES6.Controls.Touch = {
  // Called once the engine runs; the pad stays hidden before that.
  start: function () {
    gameStarted = true;
    refresh();
  }
};
})(window.PES6);
