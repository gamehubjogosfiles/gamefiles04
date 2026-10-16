(function (PES6) {
// News stays hidden on page load. Keep the dismissal handlers for manual use.
var STORAGE_KEY = 'pes6.newsSeen';

var newsEl = document.getElementById('news');
var version = newsEl.dataset.version;

function close(remember) {
  if (remember) {
    try { localStorage.setItem(STORAGE_KEY, version); } catch (e) {}
  }
  newsEl.hidden = true;
}

function isOpen() {
  return !newsEl.hidden;
}

document.getElementById('newsHide').onclick = function () { close(true); };
document.getElementById('newsClose').onclick = function () { close(false); };
newsEl.addEventListener('click', function (event) {
  if (event.target === newsEl) close(false);
});
// Capture phase on window: keys pressed while the popout is open must not
// reach the "press a key to start" handler in runtime/player.js.
window.addEventListener('keydown', function (event) {
  if (!isOpen()) return;
  event.stopPropagation();
  if (event.key === 'Escape') close(false);
}, true);

newsEl.hidden = true;
})(window.PES6);
