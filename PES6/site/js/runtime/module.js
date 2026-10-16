(function (PES6) {
var Runtime = PES6.Runtime = PES6.Runtime || {};

var Module = {
  canvas: PES6.Core.elements.canvas,
  noInitialRun: true,

  print: function () {
    PES6.Core.pushLine(Array.prototype.join.call(arguments, ' '), false);
  },

  printErr: function () {
    var text = Array.prototype.join.call(arguments, ' ');
    PES6.Core.pushLine(text, true);
    console.error(text);
  },

  setStatus: PES6.Core.setStatus,
  locateFile: PES6.Data.engineUrl,
  instantiateWasm: Runtime.Loader.instantiateEngine,
  getPreloadedPackage: Runtime.Loader.takeDataPackage,
  totalDependencies: 0,

  monitorRunDependencies: function (left) {
    this.totalDependencies = Math.max(this.totalDependencies, left);
    PES6.Core.setStatus(left
      ? 'Preparando... (' + (this.totalDependencies - left) + '/' + this.totalDependencies + ')'
      : 'Iniciando...');
  },

  onRuntimeInitialized: function () {
    PES6.RangeCache.bindEngine(Module);
    PES6.Core.setStatus('Cargando partidas guardadas...');
    PES6.Storage.mount(function () {
      PES6.Storage.setReady(true);
      if (window.PES6_AUTO_START) {
        PES6.Settings.applyLocalBootDefaults();
        Runtime.Player.start('off');
      }
      else Runtime.Player.showStartChoice();
      PES6.Settings.render(PES6.Settings.readIni());
      PES6.Settings.applyVolume(PES6.Settings.iniVolume(PES6.Settings.getText()));
      PES6.Settings.setEnabled(true);
      PES6.Saves.render();
      PES6.Settings.applyRendererLimits();
    });
    // With General > Descargas on, the whole pak downloads in the background
    // once the engine is in.
    PES6.Data.prefetchPakMetadata().then(PES6.PakDownload.offer);
  },

  // Called from C++ (report_captured_binding in pes6_presenter_input.cpp).
  onBindingCaptured: PES6.Controls.Bindings.handleCaptured,
  // Called from C++ (pes6_hle_savedata.cpp).
  onSavedataDialog: PES6.Savedata.openDialog,
  onSavedataResult: PES6.Savedata.showResult,
  onRendererPrepared: Runtime.Renderer.onPrepared,
  onRendererStarted: Runtime.Renderer.onStarted,
  onRendererLost: Runtime.Renderer.onLost,
  // Called from pes6_range_fetch.js while game data downloads.
  onRangeFetchActivity: Runtime.Downloads.onActivity,
  onRangeFetchError: Runtime.Downloads.onFetchError
};

// Emscripten's generated PES6Recomp.js expects this exact global.
window.Module = Module;
Runtime.module = Module;
})(window.PES6);
