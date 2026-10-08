(function () {
  "use strict";

  const defaultConfig = {
    files: [],
    basePath: "",
    debug: true,
  };

  const config = Object.assign(
    {},
    defaultConfig,
    window.fileMergerConfig || {},
  );
  window.mergedFiles = window.mergedFiles || {};

  const mergeStatus = {};
  const mergeProgress = {};

  let loadingDiv;
  let loadingContent;
  let updateScheduled = false;
  
  // Cache for faster URL matching
  const fileMap = new Map();
  const urlCache = new Map();
  const downloadCache = new Map();
  
  // Concurrency settings
  const DOWNLOAD_CONCURRENCY = 6;
  const POLL_START_INTERVAL = 10;
  const MAX_POLL_INTERVAL = 100;
  const MAX_WAIT_TIME = 60000;

  function initializeUI() {
    loadingDiv = document.createElement("div");
    loadingDiv.id = "file-merger-loading";
    loadingDiv.style.cssText = `
      position: fixed;
      inset: 0;
      background: #000;
      color: #fff;
      padding: 28px;
      z-index: 10000;
      width: 100vw;
      height: 100vh;
      font-family: system-ui, sans-serif;
      font-size: 14px;
      text-align: center;
      pointer-events: none;
      display: grid;
      place-content: center;
      gap: 12px;
    `;

    loadingContent = document.createElement("div");
    loadingContent.id = "file-merger-content";
    loadingDiv.appendChild(loadingContent);
    document.body.appendChild(loadingDiv);
  }

  function updateLoadingDisplay() {
    if (updateScheduled) return;
    
    updateScheduled = true;
    requestAnimationFrame(() => {
      if (!loadingContent) {
        updateScheduled = false;
        return;
      }

      let loadedBytes = 0;
      let totalBytes = 0;
      let loadedParts = 0;
      let totalParts = 0;
      config.files.forEach((file) => {
        const progress = mergeProgress[file.name] || { bytes: 0, current: 0, total: file.parts };
        loadedBytes += progress.bytes || 0;
        totalBytes += progress.totalBytes || file.bytes || 0;
        loadedParts += progress.current || 0;
        totalParts += progress.total || file.parts || 0;
      });
      const hasByteTotal = totalBytes > 0;
      const percent = hasByteTotal
        ? Math.min(100, Math.round((loadedBytes / totalBytes) * 100))
        : (totalParts ? Math.min(100, Math.round((loadedParts / totalParts) * 100)) : 0);
      const formatMB = (value) => (value / 1048576).toFixed(2);
      const overallText = hasByteTotal
        ? `Downloading... ${formatMB(loadedBytes)} / ${formatMB(totalBytes)} MB (${percent}%)`
        : `Downloading... ${loadedParts} / ${totalParts} parts (${percent}%)`;

      const lines = [
        '<div class="gamehub-merge-spinner"></div>',
        '<div class="gamehub-merge-title">DOWNLOADING...</div>',
        `<div id="gamehub-merge-detail" class="gamehub-merge-detail" aria-live="polite">${overallText}</div>`,
        `<div class="gamehub-merge-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent}"><div id="gamehub-merge-fill" style="width:${percent}%"></div></div>`,
      ];

      config.files.forEach((file) => {
        const status = mergeStatus[file.name] || "waiting";
        const progress = mergeProgress[file.name] || {
          current: 0,
          total: file.parts,
        };

        let statusText = "";
        let color = "#888";

        if (status === "merging") {
          const percent = progress.totalBytes ? ((progress.bytes / progress.totalBytes) * 100).toFixed(0) : ((progress.current / progress.total) * 100).toFixed(0);
          const mb = (value) => (value / 1048576).toFixed(2);
          statusText = progress.totalBytes ? `Downloading... ${mb(progress.bytes)} / ${mb(progress.totalBytes)} MB (${percent}%)` : `Downloading... ${progress.current}/${progress.total} (${percent}%)`;
          color = "var(--gamehub-load-accent, #ffd400)";
        } else if (status === "ready") {
          statusText = "✓ done";
          color = "#00ff00";
        } else if (status === "failed") {
          statusText = "✗ failed";
          color = "#ff0000";
        } else {
          statusText = "○ waiting...";
        }

        lines.push(
          `<div style="margin: 6px 0; color: ${color}; font-size: 14px;">${file.name}: ${statusText}</div>`,
        );
      });
      
      loadingContent.innerHTML = lines.join("");

      const allDone = config.files.every(
        (file) =>
          mergeStatus[file.name] === "ready" ||
          mergeStatus[file.name] === "failed",
      );

      if (allDone) {
        setTimeout(() => {
          if (loadingDiv) {
            loadingDiv.style.opacity = "0";
            loadingDiv.style.transition = "opacity 0.5s";
            setTimeout(() => {
              if (loadingDiv && loadingDiv.remove) loadingDiv.remove();
            }, 500);
          }
        }, 1000);
      }
      
      updateScheduled = false;
    });
  }

  function log(...args) {
    if (config.debug) console.log("[FileMerger]", ...args);
  }

  function error(...args) {
    console.error("[FileMerger]", ...args);
  }

  function normalizeUrl(url) {
    try {
      const cleanUrl = decodeURIComponent(url.toString().split("?")[0]);
      return cleanUrl;
    } catch (e) {
      return url;
    }
  }

  function urlsMatch(url1, url2) {
    const norm1 = normalizeUrl(url1);
    const norm2 = normalizeUrl(url2);

    if (norm1 === norm2) return true;
    if (norm1.endsWith(norm2) || norm2.endsWith(norm1)) return true;

    return norm1.split("/").pop() === norm2.split("/").pop();
  }

  function initializeFileMap() {
    fileMap.clear();
    for (const file of config.files) {
      const fileName = file.name;
      const fullPath = config.basePath ? `${config.basePath}${fileName}` : fileName;
      
      // Cache all possible URL variants
      const variants = [
        fileName,
        fullPath,
        fileName + ".br",
        fullPath + ".br"
      ];
      
      for (const variant of variants) {
        const normalized = normalizeUrl(variant);
        fileMap.set(normalized, file);
      }
    }
  }

  function shouldInterceptFile(url) {
    const urlStr = normalizeUrl(url);
    
    // Quick check for .part files
    if (urlStr.includes(".part")) return null;
    
    // Use cached lookup
    const file = fileMap.get(urlStr);
    return file ? file.name : null;
  }

  function getMergedFile(filename) {
    // Check direct match first
    if (window.mergedFiles[filename]) return window.mergedFiles[filename];
    
    // Fallback to URL matching for edge cases
    for (const [key, value] of Object.entries(window.mergedFiles)) {
      if (urlsMatch(key, filename)) return value;
    }
    
    return null;
  }

  async function downloadPart(url, partIndex, fileName) {
    // Check cache first
    if (downloadCache.has(url)) {
      return downloadCache.get(url);
    }
    
    const promise = (async () => {
      const response = await window.originalFetch(url);
      if (!response.ok) {
        if (response.status === 403 || response.status === 404) {
          throw new Error(`Part missing: ${url}`);
        }
        throw new Error(`Failed to load part ${url}: ${response.status}`);
      }
      const buffer = await response.arrayBuffer();
      
      // Update progress
      if (mergeProgress[fileName]) {
        mergeProgress[fileName].current++;
        mergeProgress[fileName].bytes += buffer.byteLength;
        updateLoadingDisplay();
      }
      
      return buffer;
    })();
    
    downloadCache.set(url, promise);
    return promise;
  }

  async function mergeSplitFiles(filePath, numParts) {
    const fileName = filePath.split("/").pop();
    const configured = config.files.find((file) => file.name === fileName) || {};
    mergeProgress[fileName] = { current: 0, total: numParts, bytes: 0, totalBytes: configured.bytes || 0 };
    updateLoadingDisplay();

    try {
      // Pre-generate part URLs
      const parts = Array.from(
        { length: numParts }, 
        (_, i) => `${filePath}.part${i + 1}`
      );
      
      log(`Merging ${filePath} from ${numParts} parts...`);

      const buffers = new Array(numParts);
      
      // Download in parallel batches
      for (let i = 0; i < numParts; i += DOWNLOAD_CONCURRENCY) {
        const batchEnd = Math.min(i + DOWNLOAD_CONCURRENCY, numParts);
        const batchPromises = [];
        
        for (let j = i; j < batchEnd; j++) {
          batchPromises.push(
            downloadPart(parts[j], j, fileName).then(buffer => {
              buffers[j] = buffer;
            })
          );
        }
        
        await Promise.all(batchPromises);
      }

      // Efficient buffer merging
      const totalSize = buffers.reduce((sum, buf) => sum + buf.byteLength, 0);
      const mergedArray = new Uint8Array(totalSize);
      let offset = 0;

      for (const buffer of buffers) {
        mergedArray.set(new Uint8Array(buffer), offset);
        offset += buffer.byteLength;
      }
      
      // Clear download cache for this file to free memory
      for (let i = 1; i <= numParts; i++) {
        downloadCache.delete(`${filePath}.part${i}`);
      }

      log(`✓ ${filePath} done: ${(totalSize / 1024 / 1024).toFixed(2)} MB`);
      return mergedArray.buffer;
    } catch (err) {
      error(`Failed to merge ${filePath}:`, err);
      throw err;
    }
  }

  // Store original fetch
  if (!window.originalFetch) window.originalFetch = window.fetch;

  // Optimized fetch interceptor with adaptive polling
  window.fetch = function (url, ...args) {
    const filename = shouldInterceptFile(url);

    if (filename) {
      log("Intercepting fetch for:", filename);

      return new Promise((resolve, reject) => {
        const startTime = Date.now();
        let pollInterval = POLL_START_INTERVAL;
        
        const check = () => {
          const buffer = getMergedFile(filename);

          if (buffer) {
            const contentType = filename.endsWith(".wasm")
              ? "application/wasm"
              : "application/octet-stream";
            resolve(
              new Response(buffer, {
                status: 200,
                statusText: "OK",
                headers: {
                  "Content-Type": contentType,
                  "Content-Length": buffer.byteLength.toString(),
                  "Cache-Control": "no-cache",
                },
              }),
            );
          } else if (mergeStatus[filename] === "failed") {
            reject(new Error(`Merge failed for ${filename}`));
          } else if (Date.now() - startTime > MAX_WAIT_TIME) {
            reject(new Error(`Timeout waiting for ${filename}`));
          } else {
            // Adaptive polling - increase interval gradually
            pollInterval = Math.min(pollInterval * 1.5, MAX_POLL_INTERVAL);
            setTimeout(check, pollInterval);
          }
        };
        
        check();
      });
    }

    return window.originalFetch.call(this, url, ...args);
  };

  // Store original XHR
  if (!window.OriginalXMLHttpRequest)
    window.OriginalXMLHttpRequest = window.XMLHttpRequest;

  // Optimized XHR interceptor
  window.XMLHttpRequest = function (options) {
    const xhr = new window.OriginalXMLHttpRequest(options);
    const originalOpen = xhr.open;
    const originalSend = xhr.send;
    let requestUrl = "";
    let pollInterval = POLL_START_INTERVAL;

    xhr.open = function (method, url, ...args) {
      requestUrl = url;
      return originalOpen.call(this, method, url, ...args);
    };

    xhr.send = function (...args) {
      const filename = shouldInterceptFile(requestUrl);

      if (filename) {
        log("Intercepting XHR for:", filename);

        const waitForMerge = () => {
          const buffer = getMergedFile(filename);

          if (buffer) {
            // Define properties efficiently
            Object.defineProperties(xhr, {
              status: { value: 200, configurable: true },
              statusText: { value: "OK", configurable: true },
              response: { value: buffer, configurable: true },
              responseText: { value: null, configurable: true },
              responseType: { value: "arraybuffer", configurable: true },
              readyState: { value: 4, configurable: true },
            });
            
            // Trigger events asynchronously
            queueMicrotask(() => {
              if (xhr.onreadystatechange) xhr.onreadystatechange();
              if (xhr.onload) xhr.onload({ type: "load", target: xhr });
            });
          } else if (mergeStatus[filename] === "failed") {
            if (xhr.onerror) xhr.onerror(new Error("Merge Failed"));
          } else {
            // Adaptive polling
            setTimeout(() => {
              pollInterval = Math.min(pollInterval * 1.5, MAX_POLL_INTERVAL);
              waitForMerge();
            }, pollInterval);
          }
        };

        waitForMerge();
        return;
      }

      return originalSend.call(this, ...args);
    };

    return xhr;
  };

  async function autoMergeFiles() {
    if (!config.files.length) return;

    // Initialize file map for fast lookups
    initializeFileMap();
    updateLoadingDisplay();

    try {
      // Start all merges in parallel
      const promises = config.files.map((file) => {
        const fullPath = config.basePath
          ? `${config.basePath}${file.name}`
          : file.name;

        mergeStatus[file.name] = "merging";
        updateLoadingDisplay();

        return mergeSplitFiles(fullPath, file.parts)
          .then((buffer) => {
            window.mergedFiles[file.name] = buffer;
            window.mergedFiles[fullPath] = buffer;
            mergeStatus[file.name] = "ready";
            updateLoadingDisplay();
          })
          .catch((err) => {
            mergeStatus[file.name] = "failed";
            updateLoadingDisplay();
            error(`Failed to merge ${file.name}:`, err);
          });
      });

      await Promise.all(promises);
      
      // Clear download cache after all merges complete
      downloadCache.clear();
      log("All files merged successfully");
    } catch (e) {
      error("Auto-merge failed:", e);
    }
  }
  
  function init() {
    if (document.body) {
      initializeUI();
      autoMergeFiles();
    } else {
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", () => {
          initializeUI();
          autoMergeFiles();
        });
      } else {
        setTimeout(init, 10);
      }
    }
  }

  init();
})();
