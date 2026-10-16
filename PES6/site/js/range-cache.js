(function (PES6) {
// Both the preloader and the engine read the same block store. Cache API
// persists across visits; ordinary HTTP uses compressed bytes held in RAM.
var opened = null;
var persistent = false;
var blocks = new Map();
var memory = {
  keys: function () {
    return Promise.resolve(Array.from(blocks.keys(), function (url) { return { url: url }; }));
  },
  match: function (key) {
    var bytes = blocks.get(typeof key === 'string' ? key : key.url);
    return Promise.resolve(bytes ? new Response(bytes) : undefined);
  },
  put: function (key, response) {
    return response.arrayBuffer().then(function (bytes) {
      blocks.set(typeof key === 'string' ? key : key.url, bytes);
    });
  }
};

function useMemory() {
  persistent = false;
  return memory;
}

function open() {
  if (opened) return opened;
  try {
    if (window.isSecureContext && typeof caches !== 'undefined') {
      opened = caches.open(PES6.Data.rangeCacheName).then(function (cache) {
        persistent = true;
        return cache;
      }).catch(useMemory);
    } else {
      opened = Promise.resolve(useMemory());
    }
  } catch (error) {
    opened = Promise.resolve(useMemory());
  }
  return opened;
}

function bindEngine(module) {
  module['rangeCacheName'] = PES6.Data.rangeCacheName;
  module['rangeCacheKeyOrigin'] = 'https://pes6-range.invalid';
  module['openRangeCache'] = open;
  // Existing non-modular Emscripten builds expose this library globally.
  // Bind those too so static web updates work without relinking the Wasm.
  var legacy = window.PSPRECOMPRANGE || window.PES6RANGE;
  if (legacy && typeof legacy.openCache === 'function') legacy.openCache = open;
}

PES6.RangeCache = {
  open: open,
  bindEngine: bindEngine,
  isPersistent: function () { return persistent; },
  clearMemory: function () { blocks.clear(); }
};
})(window.PES6);
