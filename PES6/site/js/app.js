(function (PES6) {
// Nothing is downloaded on a browser that cannot run the engine.
if (!PES6.Compat.report(PES6.Compat.check())) {
  PES6.Ads.load();
  return;
}

// The pak index downloads while the engine does.
PES6.Data.prefetchPakMetadata();

// Emscripten reads window.Module, created by runtime/module.js.
PES6.Runtime.Loader.loadEngineScript();
})(window.PES6);
