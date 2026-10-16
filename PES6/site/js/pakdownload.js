(function (PES6) {
// Downloads the whole pes6.pak in the background into the same Cache API
// entries pes6_range_fetch.js reads, so the game never waits on the network
// for data once it is complete. Nothing changes on the C++ side: a block the
// game asks for is simply found in the cache.
//
// The entry layout must match the engine exactly or the game re-downloads:
// - cache id: "pak|<url>|<size>|<tail offset>" (WebPakSource in
//   host/platform/web/pes6_web_pak_source.cpp),
// - one entry per kRangeBlockBytes block, aligned to it, the last one short
//   (same file),
// - entry URL: PES6RANGE.key in web/pes6_range_fetch.js.
var BLOCK_BYTES = 256 * 1024;
// Blocks fetched per HTTP request, and requests in flight at a time.
var REQUEST_BLOCKS = 16;
var CONCURRENT_REQUESTS = 2;
var STALL_MS = 20000;
var MAX_RETRY_DELAY_MS = 30000;
// Extra room left free beyond the missing bytes before starting.
var QUOTA_SLACK_BYTES = 32 * 1024 * 1024;

// Off by default: the page remembers the General > Descargas choice here.
var STORAGE_KEY = 'pes6.downloadFullPak';

var noticeEl = document.getElementById('pakStatus');
var toggleEl = document.getElementById('downloadFullPak');
// The pak announced by the page once the engine is loaded, and the running
// download (null when idle). A stopped job finishes its current request and
// then does nothing more, so a new one may start right away.
var pakInfo = null;
var job = null;
// Keep stopped jobs until all their workers settle: foreground startup must
// also drain a download that the user just switched off.
var backgroundJobs = [];
var preloadJob = null;
var gameBusy = false;
var waiters = [];

function formatMB(bytes) {
  return Math.round(bytes / 1048576) + ' MB';
}

function entryKey(id, begin, size) {
  return 'https://pes6-range.invalid/' + encodeURIComponent(id) + '/' + begin + '-' + size;
}

function isEnabled() {
  try { return localStorage.getItem(STORAGE_KEY) === '1'; } catch (e) { return false; }
}

function render(current) {
  if (current.onProgress) {
    current.onProgress(current.done, current.needed);
    return;
  }
  var percent = current.needed ? Math.floor(current.done * 100 / current.needed) : 100;
  noticeEl.textContent = 'Descargando juego completo: ' + percent + '% (' +
    formatMB(current.done) + ' / ' + formatMB(current.needed) + ')';
  noticeEl.hidden = false;
}

function finish(message) {
  noticeEl.textContent = message;
  noticeEl.hidden = false;
  setTimeout(function () { noticeEl.hidden = true; }, 4000);
}

// Resolves once the game has no range requests on the network, so its own
// reads always go first.
function whenGameIdle() {
  if (!gameBusy) return Promise.resolve();
  return new Promise(function (resolve) { waiters.push(resolve); });
}

// Called by js/runtime/downloads.js with the game's network activity.
function setGameBusy(busy) {
  gameBusy = busy;
  if (busy) return;
  var ready = waiters;
  waiters = [];
  ready.forEach(function (resolve) { resolve(); });
}

function wait(ms) {
  return new Promise(function (resolve) { setTimeout(resolve, ms); });
}

// One Range request with an inactivity timeout; resolves to the body bytes.
function fetchRange(url, begin, size) {
  var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  var timer = 0;
  function arm() {
    if (!controller) return;
    clearTimeout(timer);
    timer = setTimeout(function () { controller.abort(); }, STALL_MS);
  }
  arm();
  return fetch(url, {
    headers: { Range: 'bytes=' + begin + '-' + (begin + size - 1) },
    signal: controller ? controller.signal : undefined
  }).then(function (response) {
    if (response.status !== 206) {
      if (response.body) response.body.cancel().catch(function () {});
      var error = new Error('HTTP ' + response.status);
      error.status = response.status;
      throw error;
    }
    var reader = response.body.getReader(), bytes = new Uint8Array(size), offset = 0;
    function pump() {
      return reader.read().then(function (chunk) {
        if (chunk.done) {
          if (offset !== size) throw new Error('short response (' + offset + ' of ' + size + ' bytes)');
          return bytes;
        }
        arm();
        if (offset + chunk.value.length > size) throw new Error('response larger than requested');
        bytes.set(chunk.value, offset);
        offset += chunk.value.length;
        return pump();
      });
    }
    return pump();
  }).then(function (bytes) {
    clearTimeout(timer);
    return bytes;
  }, function (error) {
    clearTimeout(timer);
    throw error;
  });
}

// Downloads one run of consecutive missing blocks and stores it block by
// block. Failures wait and try again: the download never gives up while it
// is enabled, and never shows the retries.
function downloadRun(current, run, attempt) {
  return whenGameIdle().then(function () {
    if (current.stopped) return null;
    return fetchRange(current.url, run.begin, run.size);
  }).then(function (bytes) {
    if (!bytes || (current.stopped && !current.keepCompleted)) return;
    var puts = [];
    for (var offset = 0; offset < bytes.length; offset += BLOCK_BYTES) {
      var part = bytes.slice(offset, Math.min(offset + BLOCK_BYTES, bytes.length));
      puts.push(current.cache.put(entryKey(current.id, run.begin + offset, part.length), new Response(part)));
    }
    return Promise.all(puts).then(function () {
      current.done += run.size;
      if (!current.stopped) render(current);
    });
  }, function (error) {
    if (current.stopped) return;
    if (error && error.name === 'QuotaExceededError') throw error;
    if (current.foreground && (attempt >= 5 || (error.status >= 400 && error.status < 500 &&
        [408, 425, 429].indexOf(error.status) < 0))) throw error;
    var delay = Math.min(1000 * Math.pow(2, attempt), MAX_RETRY_DELAY_MS);
    PES6.Core.pushLine('[pak-download] bytes ' + run.begin + '+' + run.size + ': ' + error +
                       ', retrying in ' + delay + ' ms', false);
    return wait(delay).then(function () { return downloadRun(current, run, attempt + 1); });
  });
}

// Groups the blocks not yet cached into runs of up to REQUEST_BLOCKS.
function missingRuns(current, cachedKeys) {
  var runs = [];
  var run = null;
  (current.ranges || [[0, current.dataEnd]]).forEach(function (range) {
    run = null;
    for (var begin = range[0]; begin < range[0] + range[1]; begin += BLOCK_BYTES) {
      var size = Math.min(BLOCK_BYTES, current.total - begin);
      if (cachedKeys.has(entryKey(current.id, begin, size))) {
        current.done += size;
        run = null;
        continue;
      }
      if (run && run.size < REQUEST_BLOCKS * BLOCK_BYTES) {
        run.size += size;
      } else {
        run = { begin: begin, size: size };
        runs.push(run);
      }
    }
  });
  return runs;
}

function checkQuota(missingBytes) {
  if (!PES6.RangeCache.isPersistent()) return Promise.resolve(true);
  if (!navigator.storage || !navigator.storage.estimate) return Promise.resolve(true);
  return navigator.storage.estimate().then(function (estimate) {
    return (estimate.quota || 0) - (estimate.usage || 0) >= missingBytes + QUOTA_SLACK_BYTES;
  }, function () { return true; });
}

// Only [0, tail offset) is downloaded: the page already holds the header and
// the index (PES6.Data).
function start() {
  if (job || preloadJob || !pakInfo || !isEnabled()) return;
  if (backgroundJobs.length) {
    Promise.all(backgroundJobs.map(function (current) { return current.promise; })).then(start);
    return;
  }
  var tail = pakInfo.total - pakInfo.indexBytes;
  var current = job = {
    url: pakInfo.url,
    total: pakInfo.total,
    dataEnd: tail,
    id: 'pak|' + pakInfo.url + '|' + pakInfo.total + '|' + tail,
    needed: 0,
    done: 0,
    cache: null,
    stopped: false
  };
  for (var begin = 0; begin < tail; begin += BLOCK_BYTES) current.needed += Math.min(BLOCK_BYTES, current.total - begin);

  current.promise = PES6.RangeCache.open().then(function (cache) {
    current.cache = cache;
    return cache.keys();
  }).then(function (requests) {
    if (current.stopped) return false;
    var cachedKeys = new Set(requests.map(function (request) { return request.url; }));
    var runs = missingRuns(current, cachedKeys);
    if (!runs.length) return true;
    var missing = current.needed - current.done;
    return checkQuota(missing).then(function (fits) {
      if (!fits) {
        PES6.Core.pushLine('[pak-download] skipped: not enough browser storage for ' +
                           formatMB(missing) + '.', true);
        PES6.Savedata.toast('No hay espacio para descargar el juego completo', true);
        return false;
      }
      // Asks the browser not to evict the cache under storage pressure.
      if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(function () {});
      render(current);
      var next = 0;
      function worker() {
        if (current.stopped || next >= runs.length) return Promise.resolve();
        var run = runs[next++];
        return downloadRun(current, run, 0).then(worker);
      }
      var workers = [];
      var failure = null;
      for (var index = 0; index < CONCURRENT_REQUESTS; ++index) workers.push(worker().catch(function (error) {
        current.stopped = true;
        if (!failure) failure = error;
      }));
      return Promise.all(workers).then(function () {
        if (failure) throw failure;
        return !current.stopped;
      });
    });
  }).then(function (complete) {
    if (current.stopped) return;
    job = null;
    if (complete) {
      PES6.Core.pushLine('[pak-download] complete: ' + formatMB(current.needed) + ' cached.', false);
      finish('Juego descargado completo');
    }
  }).catch(function (error) {
    if (job === current) job = null;
    PES6.Core.pushLine('[pak-download] stopped: ' + error, true);
    noticeEl.hidden = true;
  }).then(function () {
    backgroundJobs = backgroundJobs.filter(function (pending) { return pending !== current; });
  });
  backgroundJobs.push(current);
}

function stop(keepCompleted) {
  var pending = backgroundJobs.map(function (current) {
    current.keepCompleted = current.keepCompleted || keepCompleted === true;
    current.stopped = true;
    return current.promise;
  });
  job = null;
  noticeEl.hidden = true;
  return Promise.all(pending);
}

// Foreground download: drain the background job, fill the same persistent
// cache, and resolve only after every requested block has been stored.
// getRanges resolves to null for a legacy PAK (download all its data).
function preload(pak, getRanges, onProgress) {
  if (preloadJob) return preloadJob;
  var drained = stop(true);
  var operation = Promise.resolve(drained).then(function () {
    return getRanges();
  }).then(function (ranges) {
    var tail = pak.total - pak.indexBytes;
    var current = { url: pak.url, total: pak.total, dataEnd: tail,
      id: 'pak|' + pak.url + '|' + pak.total + '|' + tail,
      ranges: ranges, needed: 0, done: 0, cache: null, stopped: false,
      foreground: true, onProgress: onProgress };
    (ranges || [[0, tail]]).forEach(function (range) {
      for (var begin = range[0]; begin < range[0] + range[1]; begin += BLOCK_BYTES)
        current.needed += Math.min(BLOCK_BYTES, pak.total - begin);
    });
    return PES6.RangeCache.open().then(function (cache) {
      current.cache = cache;
      return cache.keys();
    }).then(function (requests) {
      var runs = missingRuns(current, new Set(requests.map(function (request) { return request.url; })));
      render(current);
      if (!runs.length) return;
      return checkQuota(current.needed - current.done).then(function (fits) {
        if (!fits) throw new Error('No hay espacio en el navegador para precargar los relatos.');
        if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(function () {});
        var next = 0;
        function worker() {
          if (current.stopped || next >= runs.length) return Promise.resolve();
          return downloadRun(current, runs[next++], 0).then(worker);
        }
        // Stop all workers on a failure, and drain them before allowing a retry.
        var failure = null;
        var workers = [];
        for (var i = 0; i < CONCURRENT_REQUESTS; ++i) workers.push(worker().catch(function (error) {
          current.stopped = true;
          if (!failure) failure = error;
        }));
        return Promise.all(workers).then(function () { if (failure) throw failure; });
      });
    });
  });
  preloadJob = operation.then(function () {
    preloadJob = null;
    start();
  }, function (error) {
    preloadJob = null;
    start();
    throw error;
  });
  return preloadJob;
}

// pak: { url, total, indexBytes } from PES6.Data, or null / { error } when
// there is no pak. Starts the download if the toggle is on.
function offer(pak) {
  if (!pak || pak.error) return;
  pakInfo = pak;
  start();
}

toggleEl.value = isEnabled() ? '1' : '0';
toggleEl.onchange = function () {
  var enabled = toggleEl.value === '1';
  try { localStorage.setItem(STORAGE_KEY, enabled ? '1' : '0'); } catch (e) {}
  if (enabled) start(); else stop();
};

PES6.PakDownload = {
  offer: offer,
  preload: preload,
  setGameBusy: setGameBusy
};
})(window.PES6);
