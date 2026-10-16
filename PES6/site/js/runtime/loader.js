(function (PES6) {
var Runtime = PES6.Runtime = PES6.Runtime || {};

var wasmLabelEl = document.getElementById('wasmLabel');
var wasmProgressEl = document.getElementById('wasmProgress');

function formatMB(bytes) {
  return (bytes / 1048576).toFixed(bytes >= 104857600 ? 0 : 1) + ' MB';
}

function showWasmProgress(loaded, total) {
  wasmProgressEl.hidden = false;
  if (total > 0) {
    wasmProgressEl.max = total;
    wasmProgressEl.value = Math.min(loaded, total);
    wasmLabelEl.textContent = loaded >= total
      ? 'Compilando el motor...'
      : 'Motor: ' + formatMB(loaded) + ' / ' + formatMB(total);
  } else {
    wasmProgressEl.removeAttribute('value');
    wasmLabelEl.textContent = 'Motor: ' + formatMB(loaded);
  }
}

// The .wasm is kept in the Cache API under its ETag (the content hash the
// Hugging Face CDN sends), so a new build is downloaded once and an
// unchanged one never again. Only the latest build is kept.
var ENGINE_CACHE_NAME = 'pes6-engine-v1';
var WASM_HEADERS = { 'Content-Type': 'application/wasm' };

function engineCacheKey(etag) {
  return 'https://pes6-engine.invalid/wasm/' + encodeURIComponent(etag);
}

function openEngineCache() {
  if (typeof caches === 'undefined' || !window.isSecureContext) return Promise.resolve(null);
  return caches.open(ENGINE_CACHE_NAME).catch(function () { return null; });
}

// url with a query parameter added (or url itself when value is empty).
function withQuery(url, name, value) {
  if (!value) return url;
  return url + (url.indexOf('?') < 0 ? '?' : '&') + name + '=' + encodeURIComponent(value);
}

// One-byte request for the ETag of the current .wasm; null when the server
// sends none or the request fails (the engine is then downloaded uncached).
// The unique query keeps a CDN edge from answering with a stale ETag.
function fetchWasmEtag(url) {
  return fetch(withQuery(url, 'probe', String(Date.now())),
               { headers: { Range: 'bytes=0-0' }, cache: 'no-store', credentials: 'same-origin' })
    .then(function (response) {
      if (response.body) response.body.cancel().catch(function () {});
      if (response.status !== 206 && response.status !== 200) return null;
      return response.headers.get('ETag') || null;
    })
    .catch(function () { return null; });
}

// The .wasm ETag names the build. PES6Recomp.js, the .wasm and the .data
// are requested with it as ?build=, so a CDN edge that caches them (Cloudflare
// keeps .js for days) never pairs files from different builds.
var buildEtag = null;

function currentBuildEtag() {
  if (!buildEtag) buildEtag = fetchWasmEtag(PES6.Core.sources.wasm);
  return buildEtag;
}

// Stores the downloaded build and drops every older one.
function storeEngine(cache, key, chunks) {
  var response = new Response(new Blob(chunks, { type: 'application/wasm' }), { headers: WASM_HEADERS });
  cache.put(key, response).then(function () {
    return cache.keys();
  }).then(function (requests) {
    requests.forEach(function (request) {
      if (request.url !== key) cache.delete(request).catch(function () {});
    });
  }).catch(function (error) {
    PES6.Core.pushLine('Engine not cached: ' + error, false);
  });
}

// The response body as decoded bytes. A gzip body (PES6Recomp.*.gz from
// tools/GzipWebFile.cmake, served without Content-Encoding) is recognized
// by its magic bytes and decompressed; anything else passes through.
// onBytes(loaded, total) counts the bytes received, before decompression.
function openBodyStream(response, onBytes) {
  var total = parseInt(response.headers.get('Content-Length') || '0', 10) || 0;
  var loaded = 0;
  var reader = response.body.getReader();
  return reader.read().then(function (first) {
    var gzip = !first.done && first.value.byteLength >= 2 &&
               first.value[0] === 0x1f && first.value[1] === 0x8b;
    var pending = first;
    var received = new ReadableStream({
      pull: function (controller) {
        var next = pending ? Promise.resolve(pending) : reader.read();
        pending = null;
        return next.then(function (chunk) {
          if (chunk.done) {
            controller.close();
            return;
          }
          loaded += chunk.value.byteLength;
          onBytes(loaded, total);
          controller.enqueue(chunk.value);
        });
      }
    });
    if (!gzip) return received;
    if (typeof DecompressionStream === 'undefined') {
      reader.cancel().catch(function () {});
      throw new Error('this browser has no DecompressionStream for the gzip file');
    }
    return received.pipeThrough(new DecompressionStream('gzip'));
  });
}

function instantiateCachedEngine(cached, imports) {
  wasmLabelEl.textContent = 'Compilando el motor...';
  if (WebAssembly.instantiateStreaming) return WebAssembly.instantiateStreaming(cached, imports);
  return cached.arrayBuffer().then(function (bytes) { return WebAssembly.instantiate(bytes, imports); });
}

// Downloads the engine with a progress bar and compiles it while streaming;
// the bytes are cached under cacheKey once the whole file has arrived.
function downloadEngine(url, imports, cache, cacheKey) {
  wasmLabelEl.textContent = 'Descargando el motor...';
  return fetch(url, { credentials: 'same-origin' }).then(function (response) {
    if (!response.ok) throw new Error('HTTP ' + response.status + ' en ' + url);

    var total = parseInt(response.headers.get('Content-Length') || '0', 10) || 0;
    if (!response.body || typeof ReadableStream === 'undefined') {
      return response.arrayBuffer().then(function (bytes) {
        showWasmProgress(bytes.byteLength, bytes.byteLength);
        if (cache && cacheKey) storeEngine(cache, cacheKey, [bytes]);
        return WebAssembly.instantiate(bytes, imports);
      });
    }

    var loaded = 0;
    return openBodyStream(response, function (bytes) {
      loaded = bytes;
      showWasmProgress(loaded, total);
    }).then(function (body) {
      // The cache keeps the decompressed module, so a cached build
      // compiles as is (instantiateCachedEngine).
      var chunks = cache && cacheKey ? [] : null;
      var reader = body.getReader();
      var decoded = new ReadableStream({
        pull: function (controller) {
          return reader.read().then(function (chunk) {
            if (chunk.done) {
              showWasmProgress(total || loaded, total || loaded);
              controller.close();
              if (chunks && (!total || loaded === total)) storeEngine(cache, cacheKey, chunks);
              return;
            }
            if (chunks) chunks.push(chunk.value);
            controller.enqueue(chunk.value);
          });
        }
      });

      return WebAssembly.instantiateStreaming(new Response(decoded, { headers: WASM_HEADERS }), imports);
    });
  });
}

// PES6Recomp.data is downloaded here instead of by the Emscripten loader,
// so a gzip copy can be served too; the loader takes it through
// Module.getPreloadedPackage (runtime/module.js).
var dataPackage = null;

function downloadDataPackage(etag) {
  var url = withQuery(PES6.Core.sources.data, 'build', etag);
  return fetch(url, { credentials: 'same-origin' }).then(function (response) {
    if (!response.ok) throw new Error('HTTP ' + response.status + ' en ' + url);
    return openBodyStream(response, function (loaded, total) {
      PES6.Core.setStatus('Descargando datos... ' + formatMB(loaded) + (total ? ' / ' + formatMB(total) : ''));
    });
  }).then(function (body) {
    return new Response(body).arrayBuffer();
  }).then(function (bytes) {
    dataPackage = bytes;
  }).catch(function (error) {
    PES6.Core.pushLine('Engine data download failed (' + url + '): ' + error, true);
    PES6.Core.setStatus('Error al cargar los datos del motor');
    throw error;
  });
}

// Hands the package over once; the filesystem keeps views into it.
function takeDataPackage() {
  var bytes = dataPackage;
  dataPackage = null;
  return bytes;
}

function instantiateEngine(imports, receiveInstance) {
  var url = PES6.Core.sources.wasm;
  // Diagnostic mode: avoid retaining decompressed chunks for Cache API storage.
  var cacheDisabled = new URLSearchParams(window.location.search).get('wasm_cache') === 'off';
  wasmLabelEl.textContent = 'Buscando el motor...';

  if (cacheDisabled) PES6.Core.pushLine('Engine: WASM cache disabled (wasm_cache=off)', false);
  Promise.all([cacheDisabled ? Promise.resolve(null) : openEngineCache(), currentBuildEtag()]).then(function (found) {
    var cache = found[0], etag = found[1];
    url = withQuery(url, 'build', etag);
    if (!cache || !etag) return downloadEngine(url, imports, null, null);
    var key = engineCacheKey(etag);
    return cache.match(key).then(function (cached) {
      if (!cached) return downloadEngine(url, imports, cache, key);
      PES6.Core.pushLine('Engine: cached build ' + etag, false);
      // A damaged entry is dropped and the engine downloaded again.
      return instantiateCachedEngine(cached, imports).catch(function (error) {
        PES6.Core.pushLine('Cached engine rejected (' + error + '), downloading it again.', true);
        cache.delete(key).catch(function () {});
        return downloadEngine(url, imports, cache, key);
      });
    }, function () {
      return downloadEngine(url, imports, cache, key);
    });
  }).then(function (result) {
    wasmLabelEl.textContent = 'Motor cargado, preparando...';
    wasmProgressEl.hidden = true;
    receiveInstance(result.instance, result.module);
  }).catch(function (error) {
    PES6.Core.pushLine('Engine download failed (' + url + '): ' + error, true);
    wasmLabelEl.textContent = 'No se pudo descargar el motor. Revisá el log.';
    PES6.Core.setStatus('Error al cargar el motor');
  });

  return {};
}

function reportEngineScriptFailure(error) {
  PES6.Core.pushLine('Engine loader download failed: ' + PES6.Core.sources.engineScript +
                     (error ? ' (' + error + ')' : ''), true);
  PES6.Core.setStatus('Error al cargar el motor');
}

function appendEngineScript(src) {
  var script = document.createElement('script');
  script.src = src;
  script.async = true;
  script.onerror = function () { reportEngineScriptFailure(null); };
  document.body.appendChild(script);
  return script;
}

// PES6Recomp.js must come from the same build as the .wasm: its EM_ASM table
// is indexed by addresses inside the module. The host caches .js files for
// hours while the .wasm is checked against its ETag on every load, so the
// loader is revalidated here (a 304 when unchanged) and run from a blob URL.
// It runs once PES6Recomp.data is in, since it asks for the package right away.
function loadEngineScript() {
  var src = PES6.Core.sources.engineScript;
  if (typeof fetch !== 'function' || typeof URL === 'undefined' || !URL.createObjectURL) {
    appendEngineScript(src);
    return;
  }
  var etag = currentBuildEtag();
  var script = etag.then(function (build) {
    return fetch(withQuery(src, 'build', build), { cache: 'no-cache', credentials: 'same-origin' });
  }).then(function (response) {
    if (!response.ok) throw new Error('HTTP ' + response.status);
    // Cloudflare Pages answers a missing file with index.html and a 200.
    if (/text\/html/i.test(response.headers.get('Content-Type') || '')) {
      throw new Error('the host sent an HTML page, the file is missing from the deploy');
    }
    return response.blob();
  }).catch(function (error) {
    reportEngineScriptFailure(error);
    throw error;
  });
  Promise.all([script, etag.then(downloadDataPackage)]).then(function (results) {
    var url = URL.createObjectURL(new Blob([results[0]], { type: 'text/javascript' }));
    appendEngineScript(url).onload = function () { URL.revokeObjectURL(url); };
  }).catch(function () {});
}

Runtime.Loader = {
  engineCacheName: ENGINE_CACHE_NAME,
  instantiateEngine: instantiateEngine,
  loadEngineScript: loadEngineScript,
  takeDataPackage: takeDataPackage
};
})(window.PES6);
