/* Serve the chunked public PAK as one virtual file on GitHub Pages. */
(function () {
  'use strict';

  if (window.__PES6_CHUNK_FETCH_INSTALLED__) return;

  var scriptUrl = document.currentScript && document.currentScript.src
    ? document.currentScript.src
    : new URL('js/pak-chunks.js', document.baseURI).href;
  var repositoryBases = [
    new URL('https://raw.githubusercontent.com/Igu2012/pes6web/main/'),
    new URL('https://igu2012.github.io/pes6web/')
  ];
  var virtualPak = new URL('../assets/pes6.pak', scriptUrl);
  var parts = [
    { file: 'part-000.bin', bytes: 94371840 },
    { file: 'part-001.bin', bytes: 94371840 },
    { file: 'part-002.bin', bytes: 94371840 },
    { file: 'part-003.bin', bytes: 68938677 }
  ];
  var totalBytes = parts.reduce(function (sum, part) { return sum + part.bytes; }, 0);
  var partSizeChecks = Object.create(null);
  var downloadedBytes = 0;
  var lastProgressUpdate = 0;
  var offsets = [];
  var offset = 0;
  parts.forEach(function (part) {
    part.offset = offset;
    offset += part.bytes;
    offsets.push(part);
  });

  var originalFetch = window.fetch.bind(window);

  function reportProgress(bytes) {
    downloadedBytes += bytes;
    var now = Date.now();
    if (now - lastProgressUpdate < 100) return;
    lastProgressUpdate = now;
    try {
      if (window.PES6_LOADING && typeof window.PES6_LOADING.updateGameData === 'function') {
        window.PES6_LOADING.updateGameData(downloadedBytes, totalBytes);
      }
    } catch (error) {}
    try {
      var downloads = window.PES6 && window.PES6.Runtime && window.PES6.Runtime.Downloads;
      if (downloads && typeof downloads.onNetworkProgress === 'function') {
        downloads.onNetworkProgress(downloadedBytes);
      }
    } catch (error) {}
  }

  function rangeFromHeader(value) {
    var match = /^bytes=(\d+)-(\d+)$/i.exec(value || '');
    if (!match) return null;
    return { begin: Number(match[1]), end: Number(match[2]) };
  }

  function validatePartSize(base, part) {
    var key = base.href + part.file;
    if (!partSizeChecks[key]) {
      var url = new URL('payload/pes6.pak.parts/' + part.file, base).href;
      partSizeChecks[key] = originalFetch(url, { method: 'HEAD', cache: 'no-store' }).then(function (response) {
        var actualBytes = Number(response.headers.get('Content-Length'));
        if (!response.ok || actualBytes !== part.bytes) {
          throw new Error('PAK chunk ' + part.file + ' has unexpected size ' + actualBytes + ' (expected ' + part.bytes + ')');
        }
      }).catch(function (error) {
        delete partSizeChecks[key];
        throw error;
      });
    }
    return partSizeChecks[key];
  }

  function chunkRangeFrom(base, part, begin, end, signal) {
    var url = new URL('payload/pes6.pak.parts/' + part.file, base).href;
    return validatePartSize(base, part).then(function () {
      return originalFetch(url, {
        method: 'GET',
        headers: { Range: 'bytes=' + begin + '-' + end },
        cache: 'no-store',
        signal: signal
      });
    }).then(function (response) {
      if (response.status !== 206) {
        if (response.body) response.body.cancel().catch(function () {});
        var error = new Error('PAK chunk ' + part.file + ' returned HTTP ' + response.status);
        error.status = response.status;
        throw error;
      }
      var expectedRange = 'bytes ' + begin + '-' + end + '/';
      var contentRange = response.headers.get('Content-Range');
      if (contentRange && contentRange.indexOf(expectedRange) !== 0) {
        throw new Error('Invalid Content-Range from ' + part.file + ': ' + contentRange);
      }
      var expectedBytes = end - begin + 1;
      if (!response.body || typeof response.body.getReader !== 'function') {
        return response.arrayBuffer().then(function (buffer) {
          var bytes = new Uint8Array(buffer);
          reportProgress(bytes.byteLength);
          if (bytes.byteLength !== expectedBytes) {
            throw new Error('Short PAK chunk response from ' + part.file);
          }
          return bytes;
        });
      }
      var reader = response.body.getReader();
      var chunks = [];
      var receivedBytes = 0;
      function readNext() {
        return reader.read().then(function (chunk) {
          if (chunk.done) {
            var bytes = new Uint8Array(receivedBytes);
            var cursor = 0;
            chunks.forEach(function (piece) {
              bytes.set(piece, cursor);
              cursor += piece.byteLength;
            });
            if (bytes.byteLength !== expectedBytes) {
              throw new Error('Short PAK chunk response from ' + part.file);
            }
            return bytes;
          }
          chunks.push(chunk.value);
          receivedBytes += chunk.value.byteLength;
          reportProgress(chunk.value.byteLength);
          return readNext();
        });
      }
      return readNext();
    });
  }

  function chunkRange(part, begin, end, signal) {
    return chunkRangeFrom(repositoryBases[0], part, begin, end, signal).catch(function (primaryError) {
      return chunkRangeFrom(repositoryBases[1], part, begin, end, signal).catch(function (fallbackError) {
        fallbackError.primaryError = primaryError;
        throw fallbackError;
      });
    });
  }

  function virtualRange(begin, end, signal) {
    if (!Number.isSafeInteger(begin) || !Number.isSafeInteger(end) ||
        begin < 0 || end < begin || end >= totalBytes) {
      var unsatisfied = new Error('PAK byte range is outside the game data file');
      unsatisfied.status = 416;
      return Promise.reject(unsatisfied);
    }

    var output = new Uint8Array(end - begin + 1);
    var reads = [];
    offsets.forEach(function (part) {
      var partEnd = part.offset + part.bytes - 1;
      var start = Math.max(begin, part.offset);
      var finish = Math.min(end, partEnd);
      if (start > finish) return;
      var localStart = start - part.offset;
      var localEnd = finish - part.offset;
      reads.push(chunkRange(part, localStart, localEnd, signal).then(function (bytes) {
        output.set(bytes, start - begin);
      }));
    });

    return Promise.all(reads).then(function () {
      return new Response(output, {
        status: 206,
        statusText: 'Partial Content',
        headers: {
          'Accept-Ranges': 'bytes',
          'Content-Length': String(output.byteLength),
          'Content-Range': 'bytes ' + begin + '-' + end + '/' + totalBytes,
          'Content-Type': 'application/octet-stream'
        }
      });
    });
  }

  function requestUrl(input) {
    if (typeof input === 'string' || input instanceof URL) return String(input);
    return input && input.url ? input.url : '';
  }

  window.fetch = function (input, init) {
    var method = (init && init.method) || (input && input.method) || 'GET';
    if (String(method).toUpperCase() !== 'GET') return originalFetch(input, init);

    var url;
    try { url = new URL(requestUrl(input), document.baseURI); }
    catch (error) { return originalFetch(input, init); }
    if (url.origin !== virtualPak.origin || url.pathname !== virtualPak.pathname) {
      return originalFetch(input, init);
    }

    var headers = new Headers(input && input.headers ? input.headers : undefined);
    if (init && init.headers) {
      new Headers(init.headers).forEach(function (value, key) { headers.set(key, value); });
    }
    var range = rangeFromHeader(headers.get('Range'));
    if (!range) return originalFetch(input, init);

    var signal = (init && init.signal) || (input && input.signal) || undefined;
    return virtualRange(range.begin, range.end, signal);
  };

  window.__PES6_CHUNK_FETCH_INSTALLED__ = true;
  window.PES6_PAK_SOURCE = 'GitHub Pages chunks';
})();
