(function (PES6) {
// A small sidecar lists the physical PAK blocks used by speech. Legacy PAKs
// without a matching list download completely before gameplay instead.
var BLOCK_BYTES = 256 * 1024;
var MANIFEST_TIMEOUT_MS = 20000;

function headerHex(pak) {
  return Array.prototype.map.call(pak.meta.subarray(0, 64), function (byte) {
    return ('0' + byte.toString(16)).slice(-2);
  }).join('');
}

// '' = retail s_sound.afs; a voice mod is packed as s_sound_<voice>.afs.
function voiceArchive(voice) {
  return voice ? 's_sound_' + voice + '.afs' : 's_sound.afs';
}

function valid(manifest, pak, voice) {
  var tail = pak.total - pak.indexBytes;
  if (!manifest || manifest.version !== 1 || manifest.blockBytes !== BLOCK_BYTES ||
      !Array.isArray(manifest.archives) || !manifest.archives.some(function (name) {
        return String(name).toLowerCase() === voiceArchive(voice);
      }) ||
      manifest.pakBytes !== pak.total || manifest.tailOffset !== tail ||
      manifest.headerHex !== headerHex(pak) || !Array.isArray(manifest.ranges)) return false;
  var previousEnd = 0;
  return manifest.ranges.every(function (range) {
    if (!Array.isArray(range) || range.length !== 2) return false;
    var begin = range[0], size = range[1], end = begin + size;
    if (!Number.isSafeInteger(begin) || !Number.isSafeInteger(size) || size <= 0 ||
        begin < previousEnd || begin < 0 || begin >= tail || begin % BLOCK_BYTES !== 0 ||
        end > Math.min(pak.total, Math.ceil(tail / BLOCK_BYTES) * BLOCK_BYTES) ||
        (size % BLOCK_BYTES !== 0 && end !== pak.total)) return false;
    previousEnd = end;
    return true;
  });
}

function readManifest(url, pak, voice) {
  var controller = new AbortController();
  var timer = setTimeout(function () { controller.abort(); }, MANIFEST_TIMEOUT_MS);
  return fetch(url, { cache: 'no-store', signal: controller.signal }).then(function (response) {
    if (!response.ok) throw new Error('HTTP ' + response.status);
    return response.json();
  }).then(function (manifest) {
    return valid(manifest, pak, voice) ? manifest.ranges : null;
  }).catch(function () { return null; }).then(function (ranges) {
    clearTimeout(timer);
    return ranges;
  });
}

// pak_commentary_manifest.py writes <pak>.commentary.json for the retail
// speech and <pak>.commentary-<voice>.json for each voice mod.
function findRanges(pak, voice) {
  var sidecar = new URL(pak.url, window.location.href);
  sidecar.pathname += voice ? '.commentary-' + voice + '.json' : '.commentary.json';
  var bundled = voice ? (PES6.Config.commentaryVoiceManifests || {})[voice] : PES6.Config.commentaryManifest;
  // A custom ?pak= may have a different sidecar, even if the site bundles one.
  if (bundled && PES6.Core.sources.pak === PES6.Config.pak) {
    return readManifest(bundled, pak, voice).then(function (ranges) {
      return ranges !== null ? ranges : readManifest(sidecar.href, pak, voice);
    });
  }
  return readManifest(sidecar.href, pak, voice);
}

function load(pak, voice) {
  var fullPak = false;
  PES6.Core.setStatus('Preparando descarga de relatos...');
  return PES6.PakDownload.preload(pak, function () {
    return findRanges(pak, voice || '').then(function (ranges) {
      fullPak = ranges === null;
      if (fullPak) PES6.Core.pushLine('[commentary-preload] No matching manifest; caching the complete PAK.', false);
      return ranges;
    });
  }, function (done, total) {
    var label = fullPak ? 'Precargando juego completo para los relatos' : 'Precargando relatos';
    if (!PES6.RangeCache.isPersistent()) label += ' en memoria';
    var mb = function (bytes) { return (bytes / 1048576).toFixed(1); };
    // Core.setStatus recognizes this byte fraction and updates its progress bar.
    PES6.Core.setStatus(label + ': ' + mb(done) + ' / ' + mb(total) + ' MB (' + done + '/' + total + ')');
  });
}

PES6.CommentaryPreload = { load: load };
})(window.PES6);
