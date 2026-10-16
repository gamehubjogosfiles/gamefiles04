(function (PES6) {
(function fpsMeter() {
  var el = document.getElementById('fps');
  var frames = 0, last = performance.now(), shown = -1, gameRunning = false;
  function show(count) {
    if (count !== shown) { el.textContent = count + ' fps'; shown = count; }
  }
  function tick(now) {
    if (gameRunning) return;
    frames++;
    if (now - last >= 1000) {
      show(frames);
      frames = 0; last = now;
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
  // The game's main loop already takes one turn per animation frame. Reading
  // its count once a second replaces this meter's own rAF callback, which
  // cost ~1% of the main thread on a netbook.
  window.addEventListener('pes6:game-started', function () {
    var module = PES6.Runtime.module;
    if (typeof module._pes6_web_turns !== 'function') return;
    gameRunning = true;
    var turns = module._pes6_web_turns();
    last = performance.now();
    setInterval(function () {
      var now = performance.now();
      var current = module._pes6_web_turns();
      show(Math.round((current - turns) * 1000 / (now - last)));
      turns = current; last = now;
    }, 1000);
  });
})();
  
(function () {
  // Sidebar tabs.
  var tabs = Array.prototype.slice.call(document.querySelectorAll('.tab'));
  tabs.forEach(function (tab) {
    tab.onclick = function () {
      tabs.forEach(function (other) {
        var active = other === tab;
        other.classList.toggle('active', active);
        document.getElementById(other.dataset.panel).hidden = !active;
      });
      // Let background UI polling follow the selected tab, not just page visibility.
      window.dispatchEvent(new CustomEvent('pes6:panelchange', { detail: { panel: tab.dataset.panel } }));
      if (tab.dataset.panel === 'panelLog') PES6.Core.flushLog();
      // The chat page loads the first time its tab opens.
      if (tab.dataset.panel === 'panelChat' && !chatFrameEl.src) chatFrameEl.src = PES6.Config.chat;
    };
  });
  var chatFrameEl = document.getElementById('chatFrame');
  if (!PES6.Config.chat) document.querySelector('[data-panel="panelChat"]').hidden = true;
})();
PES6.UI = {};
})(window.PES6);
