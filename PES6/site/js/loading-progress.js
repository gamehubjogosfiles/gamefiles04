/* Minimal startup and first-menu progress overlay for PES6Web. */
(function () {
  'use strict';

  var MB = 1024 * 1024;
  var host = window.location.hostname.toLowerCase();
  var loopback = host === 'localhost' || host === '127.0.0.1' || host === '::1';
  var pakTotal = Math.max(0, Number(window.PES6_PAK_TOTAL_BYTES) || 0);
  var pakMetadataBytes = 0;
  var lastLoadedBytes = 0;
  var pakDownloadedBytes = 0;
  var failed = false;
  var engineStarted = false;
  var gameReady = false;
  var hideTimer = 0;
  var gamepadTimer = 0;
  var autoBootTimer = 0;
  var userInteracted = false;
  var autoInputDispatching = false;
  var TRANSITION_GRACE_MS = 6500;

  var hud = document.createElement('section');
  hud.id = 'loadingHud';
  hud.setAttribute('role', 'status');
  hud.setAttribute('aria-live', 'polite');
  var card = document.createElement('div');
  card.className = 'loading-card';
  var title = document.createElement('h1');
  title.id = 'loadingStage';
  title.textContent = loopback ? 'Loading' : 'Downloading';
  var progress = document.createElement('progress');
  progress.id = 'loadingBar';
  progress.removeAttribute('value');
  var amount = document.createElement('p');
  amount.id = 'loadingAmount';
  amount.textContent = '0.0 MB / —';
  card.appendChild(title);
  card.appendChild(progress);
  card.appendChild(amount);
  hud.appendChild(card);
  document.body.appendChild(hud);

  function mb(value) {
    return Math.max(0, Number(value) || 0) / MB;
  }

  function formatMB(value) {
    return mb(value).toFixed(1) + ' MB';
  }

  function reportGameHub(state, message) {
    if (state === 'loading' || !window.parent || window.parent === window) return;
    var text = String(message || '');
    try { window.parent.postMessage({ gamehub: 'game-status', state: state, message: text }, '*'); } catch (e) {}
  }

  function actionFor(url) {
    try {
      var target = new URL(url || '/', window.location.href);
      return loopback && target.origin === window.location.origin ? 'Loading' : 'Downloading';
    } catch (e) {
      return loopback ? 'Loading' : 'Downloading';
    }
  }

  function render(stage, loaded, total) {
    if (failed || gameReady) return;
    hud.hidden = false;
    hud.classList.remove('is-complete');
    title.textContent = /^downloading\b/i.test(String(stage || '')) ? 'Downloading' : 'Loading';
    var current = Math.max(0, Number(loaded) || 0);
    var max = Math.max(0, Number(total) || pakTotal);
    lastLoadedBytes = current;
    if (max > 0) {
      progress.max = max;
      progress.value = Math.min(current, max);
      amount.textContent = formatMB(current) + ' / ' + formatMB(max);
    } else {
      progress.max = 1;
      progress.removeAttribute('value');
      amount.textContent = formatMB(current) + ' / —';
    }
  }

  function setPakTotal(total) {
    pakTotal = Math.max(0, Number(total) || 0);
    window.PES6_PAK_TOTAL_BYTES = pakTotal;
  }

  function updateGameData(loaded, total) {
    if (gameReady || failed) return;
    if (Number(total) > 0) setPakTotal(total);
    var target = (window.PES6 && window.PES6.Core && window.PES6.Core.sources.pak) || '/assets/pes6.pak';
    pakDownloadedBytes = Math.max(pakDownloadedBytes, Math.max(0, Number(loaded) || 0));
    render(actionFor(target), pakDownloadedBytes, pakTotal);
  }

  function recordPakMetadata(bytes, total) {
    pakMetadataBytes += Math.max(0, Number(bytes) || 0);
    if (Number(total) > 0) setPakTotal(total);
    updateGameData(pakMetadataBytes, pakTotal);
  }

  function showError(message) {
    if (failed) return;
    failed = true;
    clearTimeout(hideTimer);
    clearTimeout(autoBootTimer);
    clearInterval(gamepadTimer);
    var text = String(message || 'Unknown error');
    reportGameHub('error', text);
    var guidance;
    if (/HTTP\s*404/i.test(text)) {
      guidance = 'PES 6 game data could not be read (HTTP 404).\n'
        + 'The public site streams data from repository chunks and does not need a preassembled PAK. Reload the page and verify that the chunk files are available.\n'
        + 'For the local ZIP, restore its PAK with: python3 bootstrap.py --pak /path/to/pes6.pak.\n'
        + 'Source and chunk files: https://github.com/Igu2012/pes6web';
    } else if (/webgpu|webgl|gpu|renderer|graphics|context|device|adapter|navegador no compatible/i.test(text)) {
      guidance = 'PES 6 could not initialize browser graphics (WebGPU/WebGL).\n'
        + 'Enable hardware acceleration, update your graphics drivers, and try a current Chrome, Edge, or Firefox browser.\n'
        + 'Test WebGL 2 at https://get.webgl.org/webgl2/\n'
        + 'More help: https://github.com/Igu2012/pes6web';
    } else {
      guidance = 'PES 6 could not start. Check that the local game data exists and that your browser supports WebGL 2.\n'
        + 'More help: https://github.com/Igu2012/pes6web';
    }
    progress.hidden = true;
    hud.hidden = true;
    try { window.alert(guidance); } catch (e) {}
  }

  function formatStatus() {
    if (failed || engineStarted || gameReady) return;
    var wasmLabel = document.getElementById('wasmLabel');
    var wasmProgress = document.getElementById('wasmProgress');
    var status = document.getElementById('status');
    var dependencyProgress = document.getElementById('progress');
    var core = window.PES6 && window.PES6.Core;
    var sources = core && core.sources ? core.sources : {};

    if (wasmProgress && !wasmProgress.hidden) {
      var wasmURL = sources.wasm || sources.engineScript || '/PES6Recomp.wasm.gz';
      render(actionFor(wasmURL), wasmProgress.value, wasmProgress.max);
      return;
    }

    var statusText = status ? status.textContent.trim() : '';
    var labelText = wasmLabel ? wasmLabel.textContent.trim() : '';
    var text = statusText || labelText;
    var values = text.match(/([\d,.]+)\s*MB(?:\s*\/\s*([\d,.]+)\s*MB)?/i);
    if (values) {
      var loaded = parseFloat(values[1].replace(',', '.')) * MB;
      var total = values[2] ? parseFloat(values[2].replace(',', '.')) * MB : 0;
      var dataPhase = /data|datos|juego/i.test(text);
      var source = dataPhase ? (sources.data || '/') : (sources.wasm || '/');
      render(actionFor(source), loaded, total);
      return;
    }

    if (dependencyProgress && !dependencyProgress.hidden) {
      render('Loading', 0, 0);
      return;
    }

    if (text) {
      var downloading = /download|descarg/i.test(text);
      var action = downloading && !loopback ? 'Downloading' : 'Loading';
      render(action, 0, 0);
    }
  }

  function finishAfterBootInput() {
    if (!engineStarted || gameReady || failed) return;
    clearTimeout(hideTimer);
    title.textContent = 'Loading';
    hideTimer = window.setTimeout(function () {
      if (failed || gameReady) return;
      gameReady = true;
      clearInterval(gamepadTimer);
      reportGameHub('ready', '');
      hud.classList.add('is-complete');
      window.setTimeout(function () { hud.hidden = true; }, 260);
    }, TRANSITION_GRACE_MS);
  }

  function notePlayerInput() {
    if (!engineStarted || gameReady || failed) return;
    userInteracted = true;
    clearTimeout(autoBootTimer);
    autoBootTimer = 0;
    finishAfterBootInput();
  }

  function sendInitialGameInput() {
    if (userInteracted || gameReady || failed) return;
    var target = document.getElementById('canvas') || window;
    var input = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true };
    autoInputDispatching = true;
    target.dispatchEvent(new KeyboardEvent('keydown', input));
    window.setTimeout(function () {
      target.dispatchEvent(new KeyboardEvent('keyup', input));
      autoInputDispatching = false;
    }, 100);
  }

  function onKeyDown(event) {
    if (!engineStarted || gameReady || event.repeat || event.ctrlKey || event.altKey || event.metaKey) return;
    if (/^(Shift|Control|Alt|Meta|Tab|F5|F11|F12)$/.test(event.key)) return;
    if (autoInputDispatching) finishAfterBootInput();
    else notePlayerInput();
  }

  function pollGamepad() {
    if (!engineStarted || gameReady || failed) {
      clearInterval(gamepadTimer);
      gamepadTimer = 0;
      return;
    }
    if (navigator.getGamepads) {
      var pads = navigator.getGamepads();
      for (var i = 0; i < pads.length; i++) {
        var pad = pads[i];
        if (!pad) continue;
        for (var j = 0; j < pad.buttons.length; j++) {
          if (pad.buttons[j] && pad.buttons[j].pressed) {
            notePlayerInput();
            return;
          }
        }
      }
    }
  }

  window.PES6_LOADING = {
    setPakTotal: setPakTotal,
    recordPakMetadata: recordPakMetadata,
    updateGameData: updateGameData,
    showError: showError
  };

  window.addEventListener('keydown', onKeyDown, true);
  window.addEventListener('pointerdown', function (event) {
    var canvas = document.getElementById('canvas');
    if (canvas && (event.target === canvas || canvas.contains(event.target))) notePlayerInput();
  }, true);

  window.addEventListener('pes6:game-started', function () {
    if (failed) return;
    engineStarted = true;
    render('Loading', lastLoadedBytes, pakTotal);
    if (!gamepadTimer) gamepadTimer = window.setInterval(pollGamepad, 100);
    autoBootTimer = window.setTimeout(function () {
      autoBootTimer = 0;
      sendInitialGameInput();
    }, 5000);
  });

  window.setInterval(formatStatus, 120);
  formatStatus();
})();
