(function (PES6) {
// Savedata lives under /game/ms0 (see platform_filesystem.cpp); mounting an
// IDBFS there and pulling it down before the game starts is what makes
// saves survive a reload. Writes land in the mount immediately (same as
// MEMFS) and are pushed back to IndexedDB by sync_web_save_storage() in
// pes6_hle_savedata.cpp after every save.
// /game/config holds pes6.ini the same way (Settings panel below; the
// runtime reads it at start and rewrites it from Video Settings).
// Mounted as soon as the runtime is ready so settings can be edited
// before the game starts.
var storageReady = false;
function mountSaveStorage(done) {
  try {
    var FS = window.Module.FS, IDBFS = window.Module.IDBFS;
    FS.mkdirTree('/game/ms0');
    FS.mount(IDBFS, {}, '/game/ms0');
    FS.mkdirTree('/game/config');
    FS.mount(IDBFS, {}, '/game/config');
    FS.syncfs(true, function (err) {
      if (err) PES6.Core.pushLine('Save storage load failed: ' + err, true);
      done();
    });
  } catch (e) {
    PES6.Core.pushLine('Save storage unavailable, saves will not persist: ' + e, true);
    done();
  }
}

PES6.Storage = {
  isReady: function () { return storageReady; },
  setReady: function (ready) { storageReady = !!ready; },
  mount: mountSaveStorage
};
})(window.PES6);
