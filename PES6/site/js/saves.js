(function (PES6) {
// --- Savedata / option files ---------------------------------------
// Each save is a folder under ms0:/PSP/SAVEDATA named <gameName><saveName>
// (pes6_hle_savedata.cpp), inside the IndexedDB mount above. Import takes
// those folders from a .zip or a picked directory; export zips them back
// up, so an option file can be shared or moved to another browser.
var SAVEDATA_ROOT = '/game/ms0/PSP/SAVEDATA';
var SAVE_NAME_PATTERN = /^[A-Za-z0-9_.-]{1,64}$/;
var savesStatusEl = document.getElementById('savesStatus');
var saveListEl = document.getElementById('saveList');

function isSafeSaveName(name) { return SAVE_NAME_PATTERN.test(name) && name.indexOf('..') < 0; }
function listDir(path) {
  try { return window.Module.FS.readdir(path).filter(function (n) { return n !== '.' && n !== '..'; }); }
  catch (e) { return []; }
}
function isDir(path) {
  try { return window.Module.FS.isDir(window.Module.FS.stat(path).mode); } catch (e) { return false; }
}
function saveFolders() {
  return listDir(SAVEDATA_ROOT).filter(function (n) { return isDir(SAVEDATA_ROOT + '/' + n); }).sort();
}
function saveFiles(folder) {
  var base = SAVEDATA_ROOT + '/' + folder;
  return listDir(base).filter(function (n) { return !isDir(base + '/' + n); }).map(function (n) {
    return { name: n, data: window.Module.FS.readFile(base + '/' + n) };
  });
}
function persistSaves(message) {
  window.Module.FS.syncfs(false, function (err) {
    savesStatusEl.textContent = err ? 'No se pudo guardar en el navegador: ' + err : message;
  });
  renderSaves();
}
function formatSize(bytes) {
  return bytes >= 1048576 ? (bytes / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(bytes / 1024)) + ' KB';
}
function renderSaves() {
  saveListEl.textContent = '';
  var folders = saveFolders();
  if (!folders.length) {
    var empty = document.createElement('div');
    empty.className = 'note';
    empty.textContent = 'No hay partidas guardadas.';
    saveListEl.appendChild(empty);
    return;
  }
  folders.forEach(function (folder) {
    var row = document.createElement('div');
    row.className = 'saveRow';
    var name = document.createElement('span');
    name.className = 'name';
    name.textContent = folder;
    name.title = folder;
    var size = document.createElement('span');
    size.className = 'size';
    size.textContent = formatSize(saveFiles(folder).reduce(function (sum, f) { return sum + f.data.length; }, 0));
    var download = document.createElement('button');
    download.className = 'btn small';
    download.textContent = 'Descargar';
    download.onclick = function () { downloadSaves([folder], folder + '.zip'); };
    var remove = document.createElement('button');
    remove.className = 'btn small';
    remove.textContent = 'Borrar';
    remove.onclick = function () {
      if (!confirm('¿Borrar ' + folder + ' de este navegador? No se puede deshacer.')) return;
      var base = SAVEDATA_ROOT + '/' + folder;
      saveFiles(folder).forEach(function (f) { window.Module.FS.unlink(base + '/' + f.name); });
      window.Module.FS.rmdir(base);
      persistSaves(folder + ' borrada.');
    };
    row.appendChild(name);
    row.appendChild(size);
    row.appendChild(download);
    row.appendChild(remove);
    saveListEl.appendChild(row);
  });
}

// Minimal ZIP: stored entries on write; stored or deflated on read
// (DecompressionStream 'deflate-raw'). No ZIP64, no encryption.
var CRC_TABLE = (function () {
  var table = new Uint32Array(256);
  for (var n = 0; n < 256; n++) {
    var c = n;
    for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();
function crc32(bytes) {
  var c = 0xFFFFFFFF;
  for (var i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
function buildZip(entries) {
  var now = new Date();
  var time = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
  var date = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  var parts = [], central = [], offset = 0;
  entries.forEach(function (entry) {
    var name = new TextEncoder().encode(entry.path);
    var crc = crc32(entry.data), size = entry.data.length;
    var local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true); local.setUint16(4, 20, true);
    local.setUint16(10, time, true); local.setUint16(12, date, true);
    local.setUint32(14, crc, true); local.setUint32(18, size, true); local.setUint32(22, size, true);
    local.setUint16(26, name.length, true);
    var dir = new DataView(new ArrayBuffer(46));
    dir.setUint32(0, 0x02014b50, true); dir.setUint16(4, 20, true); dir.setUint16(6, 20, true);
    dir.setUint16(12, time, true); dir.setUint16(14, date, true);
    dir.setUint32(16, crc, true); dir.setUint32(20, size, true); dir.setUint32(24, size, true);
    dir.setUint16(28, name.length, true); dir.setUint32(42, offset, true);
    parts.push(local.buffer, name, entry.data);
    central.push(dir.buffer, name);
    offset += 30 + name.length + size;
  });
  var centralSize = central.reduce(function (sum, p) { return sum + p.byteLength; }, 0);
  var end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, entries.length, true); end.setUint16(10, entries.length, true);
  end.setUint32(12, centralSize, true); end.setUint32(16, offset, true);
  return new Blob(parts.concat(central, [end.buffer]), { type: 'application/zip' });
}
function inflateRaw(bytes) {
  if (typeof DecompressionStream === 'undefined')
    return Promise.reject(new Error('este navegador no descomprime zip; usá "Cargar carpeta"'));
  var stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Response(stream).arrayBuffer().then(function (b) { return new Uint8Array(b); });
}
function readZip(buffer) {
  var bytes = new Uint8Array(buffer), view = new DataView(buffer);
  var eocd = -1;
  for (var i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) return Promise.reject(new Error('no es un .zip válido'));
  var count = view.getUint16(eocd + 10, true), pos = view.getUint32(eocd + 16, true);
  var jobs = [];
  for (var n = 0; n < count; n++) {
    if (view.getUint32(pos, true) !== 0x02014b50) return Promise.reject(new Error('zip dañado'));
    var flags = view.getUint16(pos + 8, true), method = view.getUint16(pos + 10, true);
    var packed = view.getUint32(pos + 20, true);
    var nameLength = view.getUint16(pos + 28, true);
    var skip = nameLength + view.getUint16(pos + 30, true) + view.getUint16(pos + 32, true);
    var local = view.getUint32(pos + 42, true);
    var path = new TextDecoder().decode(bytes.subarray(pos + 46, pos + 46 + nameLength));
    pos += 46 + skip;
    if (/\/$/.test(path)) continue;
    if (flags & 1) return Promise.reject(new Error('zip con contraseña: ' + path));
    var start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    var data = bytes.subarray(start, start + packed);
    if (method === 0) jobs.push(Promise.resolve({ path: path, data: data }));
    else if (method === 8) jobs.push((function (p) {
      return inflateRaw(data).then(function (d) { return { path: p, data: d }; });
    })(path));
    else return Promise.reject(new Error('compresión no soportada en ' + path));
  }
  return Promise.all(jobs);
}

function downloadSaves(folders, fileName) {
  var entries = [];
  folders.forEach(function (folder) {
    saveFiles(folder).forEach(function (f) { entries.push({ path: folder + '/' + f.name, data: f.data }); });
  });
  if (!entries.length) { savesStatusEl.textContent = 'No hay partidas para descargar.'; return; }
  var link = document.createElement('a');
  link.href = URL.createObjectURL(buildZip(entries));
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(function () { URL.revokeObjectURL(link.href); }, 1000);
  savesStatusEl.textContent = 'Descargado ' + fileName + '.';
}

// Every file lands in SAVEDATA/<its parent folder>/<file>, so a zip or a
// picked folder may hold one save folder, SAVEDATA or the whole PSP tree.
// Loose files at the top of a zip go into a folder named after the zip.
function importSaveEntries(entries, fallbackFolder) {
  var imported = {}, skipped = [];
  entries.forEach(function (entry) {
    var parts = entry.path.replace(/\\/g, '/').split('/').filter(function (p) { return p; });
    var file = parts.pop();
    var folder = parts.length ? parts.pop() : fallbackFolder;
    if (!file || /^(\.DS_Store|Thumbs\.db|desktop\.ini)$/i.test(file) || /__MACOSX/.test(entry.path)) return;
    if (!folder || !isSafeSaveName(folder) || !isSafeSaveName(file)) { skipped.push(entry.path); return; }
    window.Module.FS.mkdirTree(SAVEDATA_ROOT + '/' + folder);
    window.Module.FS.writeFile(SAVEDATA_ROOT + '/' + folder + '/' + file, entry.data);
    imported[folder] = true;
  });
  var names = Object.keys(imported);
  if (!names.length) {
    savesStatusEl.textContent = 'No se encontró ninguna partida para cargar' +
      (skipped.length ? ' (nombres no válidos: ' + skipped.slice(0, 3).join(', ') + ')' : '') + '.';
    return;
  }
  persistSaves('Cargado: ' + names.join(', ') + '.' +
               (skipped.length ? ' Ignorados: ' + skipped.length + '.' : '') +
               (PES6.Settings.isGameStarted() ? ' Recargá la página para que el juego lo lea.' : ''));
}

var importSavesZipFileEl = document.getElementById('importSavesZipFile');
var importSavesDirFileEl = document.getElementById('importSavesDirFile');
document.getElementById('importSavesZip').onclick = function () {
  importSavesZipFileEl.value = '';
  importSavesZipFileEl.click();
};
document.getElementById('importSavesDir').onclick = function () {
  importSavesDirFileEl.value = '';
  importSavesDirFileEl.click();
};
document.getElementById('exportAllSaves').onclick = function () {
  downloadSaves(saveFolders(), 'pes6-partidas.zip');
};
importSavesZipFileEl.onchange = function () {
  var files = Array.prototype.slice.call(importSavesZipFileEl.files || []);
  if (!files.length) return;
  savesStatusEl.textContent = 'Cargando...';
  files.reduce(function (chain, file) {
    return chain.then(function () {
      return file.arrayBuffer().then(readZip).then(function (entries) {
        importSaveEntries(entries, file.name.replace(/\.zip$/i, ''));
      });
    });
  }, Promise.resolve()).catch(function (e) {
    savesStatusEl.textContent = 'No se pudo cargar: ' + (e && e.message ? e.message : e);
  });
};
importSavesDirFileEl.onchange = function () {
  var files = Array.prototype.slice.call(importSavesDirFileEl.files || []);
  if (!files.length) return;
  savesStatusEl.textContent = 'Cargando...';
  Promise.all(files.map(function (file) {
    return file.arrayBuffer().then(function (b) {
      return { path: file.webkitRelativePath || file.name, data: new Uint8Array(b) };
    });
  })).then(function (entries) { importSaveEntries(entries, ''); }).catch(function (e) {
    savesStatusEl.textContent = 'No se pudo cargar: ' + (e && e.message ? e.message : e);
  });
};

PES6.Saves = {
  render: renderSaves
};
})(window.PES6);
