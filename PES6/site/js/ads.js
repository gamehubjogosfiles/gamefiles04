(function (PES6) {
// AdSense loads once the engine has compiled (the start choice is shown), so
// its scripts do not compete with the engine download and compile on the
// main thread. A page that never gets there (failed download, very slow
// device) still loads it FALLBACK_MS after the page load.
var SCRIPT_URL = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=';
var FALLBACK_MS = 30000;
var loaded = false;

function load() {
  if (loaded || !PES6.Config.adsClient) return;
  loaded = true;
  var script = document.createElement('script');
  script.async = true;
  script.crossOrigin = 'anonymous';
  script.src = SCRIPT_URL + encodeURIComponent(PES6.Config.adsClient);
  document.head.appendChild(script);
}

window.addEventListener('load', function () { setTimeout(load, FALLBACK_MS); });

PES6.Ads = {
  load: load
};
})(window.PES6);
