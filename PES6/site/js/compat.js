(function (PES6) {
// Browser capabilities the engine needs, checked before downloading it.
// The GE backend renders with OpenGL ES 3.0 shaders (#version 300 es), so
// WebGL 1 is not enough. Probes use a throwaway canvas: calling getContext on
// the game canvas would fix its context type before SDL creates its own.

function releaseContext(gl) {
  var extension = gl && gl.getExtension('WEBGL_lose_context');
  if (extension) extension.loseContext();
}

function probeContext(type, attributes) {
  try {
    var gl = document.createElement('canvas').getContext(type, attributes);
    releaseContext(gl);
    return !!gl;
  } catch (e) {
    return false;
  }
}

// Returns { errors, warnings } as user-facing lines.
function check() {
  var errors = [];
  var warnings = [];

  if (typeof WebAssembly !== 'object' || typeof WebAssembly.instantiate !== 'function') {
    errors.push('Tu navegador no soporta WebAssembly.');
  }

  var hasWebGL2 = probeContext('webgl2');
  if (!hasWebGL2 && !(window.navigator && window.navigator.gpu)) {
    errors.push(probeContext('webgl')
      ? 'Tu navegador o placa de video solo soporta WebGL 1; el juego necesita WebGL 2.'
      : 'WebGL está desactivado o no es compatible con tu navegador.');
  } else if (hasWebGL2 && !probeContext('webgl2', { failIfMajorPerformanceCaveat: true })) {
    // A context exists only through a software rasterizer (SwiftShader,
    // llvmpipe): the game runs, but far below full speed.
    warnings.push('WebGL funciona sin aceleración por hardware; el juego puede ir lento. ' +
                  'Activá la aceleración por hardware en la configuración del navegador.');
  }

  // Same touch-primary test as touch.js: phones and tablets.
  if (window.matchMedia('(pointer: coarse)').matches)
    warnings.push('En celulares y tablets el juego todavía no está optimizado y puede tener mal rendimiento.');

  return { errors: errors, warnings: warnings };
}

var noticeEl = document.getElementById('compatNotice');

// Shows the result in the start overlay and the log. False when the engine
// cannot run here and must not be downloaded.
function report(result) {
  result.errors.concat(result.warnings).forEach(function (line) {
    PES6.Core.pushLine('[compat] ' + line, result.errors.indexOf(line) >= 0);
  });
  var lines = result.errors.length ? result.errors.concat(
    'Probá con Chrome, Edge o Firefox actualizados y con la aceleración por hardware activada.')
    : result.warnings;
  if (lines.length) {
    noticeEl.textContent = lines.join(' ');
    noticeEl.classList.toggle('error', result.errors.length > 0);
    noticeEl.hidden = false;
  }
  if (result.errors.length) {
    PES6.Core.elements.overlay.classList.add('boot-error');
    PES6.Core.setStatus('Navegador no compatible');
    document.getElementById('wasmLabel').textContent = 'El motor no se descargó.';
    return false;
  }
  return true;
}

PES6.Compat = {
  check: check,
  report: report
};
})(window.PES6);
