(function (PES6) {
var Runtime = PES6.Runtime = PES6.Runtime || {};
var module = Runtime.module;
var started = false;
var initialized = false;

var stageEl = document.getElementById('stage');
var nowPlayingEl = document.getElementById('nowPlaying');
var startChoiceButtons = Array.prototype.slice.call(document.querySelectorAll('#startChoice [data-commentary]'));

// Start screen choice (data-commentary): 'off', '' for the retail Spanish
// speech, or a voice mod id packed as s_sound_<voice>.afs. The last one is
// focused (and used by a key press) on the next visit. Without commentary
// the speech data is never fetched.
var COMMENTARY_KEY = 'pes6.commentary';

function choiceButton(choice) {
  return startChoiceButtons.filter(function (button) {
    return button.dataset.commentary === choice;
  })[0] || null;
}

function rememberedCommentary() {
  var stored = null;
  try { stored = localStorage.getItem(COMMENTARY_KEY); } catch (e) {}
  // '1'/'0' are the values stored by the two-button start screen.
  var choice = stored === '0' ? 'off' : stored === null || stored === '1' ? '' : stored;
  return choiceButton(choice) ? choice : '';
}

function storedCommentary(choice) {
  return choice === 'off' ? '0' : choice === '' ? '1' : choice;
}

function showStartChoice() {
  PES6.Ads.load();
  PES6.Core.elements.overlay.classList.add('ready');
  PES6.Core.elements.startChoice.hidden = false;
  (choiceButton(rememberedCommentary()) || startChoiceButtons[0]).focus({ preventScroll: true });
}

function setNowPlaying(text) {
  nowPlayingEl.textContent = text;
}

// Matches AudioSink::kSampleRate (platform_audio_sink.hpp). The AudioWorklet
// output (pes6_audio_worklet.js) plays through Module.SDL2.audioContext and
// falls back to SDL without it. SDL2 reuses the context too; at the guest
// rate it skips SDL_ResampleAudio on the main thread and the browser
// resamples to the device on its audio thread instead.
var GUEST_AUDIO_RATE = 44100;

function createGuestRateAudioContext() {
  var Context = window.AudioContext || window.webkitAudioContext;
  if (!Context) return;
  var SDL2 = module.SDL2 = module.SDL2 || {};
  if (SDL2.audioContext) return;
  try { SDL2.audioContext = new Context({ sampleRate: GUEST_AUDIO_RATE }); }
  catch (e) { return; } // Without sampleRate support SDL creates its own context.
  // SDL only arms its resume listeners for a context it created itself.
  ['keydown', 'mousedown', 'touchstart'].forEach(function (name) {
    document.addEventListener(name, function () {
      if (SDL2.audioContext.state === 'suspended') SDL2.audioContext.resume();
    }, { once: true });
  });
}

function startRuntime(choice) {
  if (started || !PES6.Storage.isReady()) return;
  if (typeof choice !== 'string') choice = rememberedCommentary();
  var withCommentary = choice !== 'off';

  started = true;
  try { localStorage.setItem(COMMENTARY_KEY, storedCommentary(choice)); } catch (e) {}
  // Still inside the click/key gesture, so the context starts running.
  createGuestRateAudioContext();
  PES6.Settings.setGameStarted(true);
  PES6.Core.elements.overlay.classList.remove('ready');
  PES6.Core.elements.startChoice.hidden = true;

  PES6.Data.loadPakMetadata(function (pak) {
    // Before callMain: open_commentary_data() skips the speech data when off.
    // An engine built before this export keeps its default (on).
    if (typeof module._pes6_set_commentary_enabled === 'function') {
      module.ccall('pes6_set_commentary_enabled', null, ['number'], [withCommentary ? 1 : 0]);
    }
    // Same moment: open_commentary_data() opens s_sound_<voice>.afs. An engine
    // built before this export plays the retail speech, so preload that one.
    var voice = withCommentary && choice !== '' && typeof module._pes6_set_commentary_voice === 'function'
      ? choice : '';
    if (voice) module.ccall('pes6_set_commentary_voice', null, ['string'], [voice]);
    var preload = withCommentary && pak ? PES6.CommentaryPreload.load(pak, voice) : Promise.resolve();
    preload.then(function () {
      Runtime.Debug.apply(module);
      return Runtime.Renderer.prepare(module, PES6.Settings.readIni());
    }).then(function () {
      PES6.Core.elements.overlay.hidden = true;
      PES6.Core.elements.canvas.focus();
      module.callMain();
      Runtime.Background.sync();

      PES6.Controls.Gamepads.applySavedMappings();
      PES6.Controls.Bindings.applySaved();
      PES6.Controls.Touch.start();

      PES6.Controls.Bindings.setReady();
      setNowPlaying('\u25B6 Pro Evolution Soccer 6 (PSP)');
      window.dispatchEvent(new Event('pes6:game-started'));
    }).catch(function (error) {
      PES6.Core.pushLine('No se pudo iniciar el juego: ' + error.message, true);
      PES6.Core.setStatus('No se pudo iniciar: ' + error.message + ' Podés reintentar o jugar sin relatos.');
      PES6.Settings.setGameStarted(false);
      // Show the status line with the error again, above the start buttons.
      PES6.Core.elements.overlay.classList.remove('ready');
      PES6.Core.elements.overlay.hidden = false;
      PES6.Core.elements.startChoice.hidden = false;
      started = false;
    });
  });
}

function fullscreenElement() {
  return document.fullscreenElement || document.webkitFullscreenElement || null;
}

// iPhone Safari has no Element.requestFullscreen, so the stage is stretched
// over the viewport with CSS instead (.player.pseudo-fullscreen).
function togglePseudoFullscreen() {
  var on = !stageEl.classList.contains('pseudo-fullscreen');
  stageEl.classList.toggle('pseudo-fullscreen', on);
  document.documentElement.classList.toggle('pseudo-fullscreen-lock', on);
  if (on) PES6.Core.elements.canvas.focus();
}

function toggleFullscreen() {
  try {
    if (fullscreenElement()) {
      (document.exitFullscreen || document.webkitExitFullscreen).call(document);
      return;
    }

    var request = stageEl.requestFullscreen || stageEl.webkitRequestFullscreen;
    if (!request) {
      togglePseudoFullscreen();
      return;
    }
    var pending = request.call(stageEl, { navigationUI: 'hide' });
    if (pending && pending.catch) {
      pending.catch(function (e) {
        PES6.Core.pushLine('Fullscreen refused: ' + e, true);
      });
    }
  } catch (e) {
    PES6.Core.pushLine('Fullscreen unavailable: ' + e, true);
  }
}

function onFullscreenChange() {
  if (fullscreenElement()) PES6.Core.elements.canvas.focus();
}

function init() {
  if (initialized) return;
  initialized = true;

  // Browsers keep AudioContext suspended until a user gesture. Starting on
  // the first click/key lets SDL resume audio before the first game frame.
  startChoiceButtons.forEach(function (button) {
    button.addEventListener('click', function () { startRuntime(button.dataset.commentary); });
  });
  window.addEventListener('keydown', function (event) {
    // A focused button starts through its own click (Enter/Space).
    if (/^(INPUT|SELECT|TEXTAREA|BUTTON)$/.test(event.target.tagName)) return;
    if (PES6.Core.elements.startChoice.hidden === false && PES6.Controls.Bindings.isModalHidden()) {
      startRuntime(rememberedCommentary());
    }
  });

  document.getElementById('fullscreen').onclick = toggleFullscreen;
  stageEl.addEventListener('dblclick', function () {
    if (PES6.Settings.isGameStarted()) toggleFullscreen();
  });
  document.addEventListener('fullscreenchange', onFullscreenChange);
  document.addEventListener('webkitfullscreenchange', onFullscreenChange);
}

Runtime.Player = {
  init: init,
  start: startRuntime,
  showStartChoice: showStartChoice,
  toggleFullscreen: toggleFullscreen,
  setNowPlaying: setNowPlaying,
  isStarted: function () { return started; }
};
})(window.PES6);
