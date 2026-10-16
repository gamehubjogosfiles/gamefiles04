(function (PES6) {
function dumpWasmCrashContext(error, message) {
  var text = message || (error && error.message) || '';
  var isWasmTrap = (typeof WebAssembly !== 'undefined' &&
      error instanceof WebAssembly.RuntimeError) ||
    /memory access out of bounds|out of memory|stack overflow|unreachable/i.test(text);
  if (!isWasmTrap) return;
  try {
    window.Module.ccall('pes6_dump_crash_context', null, [], []);
  } catch (dumpError) {
    PES6.Core.pushLine('Crash-context dump failed: ' + dumpError, true);
  }
}
// An EM_ASM lookup that fails means PES6Recomp.js and the .wasm come from
// different builds (a stale cached loader after an update).
function reportBuildMismatch(text) {
  if (!/ASM_CONSTS/.test(text)) return;
  PES6.Runtime.Downloads.showError('El juego se actualizó y el navegador tiene una versión vieja. ' +
                                   'Recargá con Ctrl+F5.');
}
window.onerror = function (message, source, lineno, colno, error) {
  var location = source ? ' @ ' + source + ':' + lineno + ':' + colno : '';
  var stack = error && error.stack ? '\n' + error.stack : '';
  PES6.Core.pushLine('Exception: ' + message + location + stack, true);
  dumpWasmCrashContext(error, String(message));
  reportBuildMismatch(String(message));
  PES6.Core.setStatus('Error: revisá el log');
};
// A repeated rejected Promise can otherwise flood both our DOM log and
// DevTools, which is measurable on the main browser thread. Keep the
// first rejection (including its stack, so internal errors such as M_ID
// are actionable) and collapse identical repeats into a cheap counter.
var rejectionLast = '';
var rejectionRepeats = 0;
function flushRejectionRepeats() {
  if (!rejectionRepeats) return;
  PES6.Core.pushLine('Unhandled rejection repeated ' + rejectionRepeats + ' more times: ' + rejectionLast, true);
  rejectionRepeats = 0;
}
window.onunhandledrejection = function (e) {
  var reason = e.reason;
  var message = reason && reason.message ? reason.message : String(reason);
  if (message === rejectionLast) {
    rejectionRepeats++;
    // Report occasionally without turning a hot recurring rejection into
    // hundreds of DOM/console writes per second.
    if ((rejectionRepeats & 63) === 0) flushRejectionRepeats();
  } else {
    flushRejectionRepeats();
    rejectionLast = message;
    var stack = e.reason && e.reason.stack ? '\n' + e.reason.stack : '';
    PES6.Core.pushLine('Unhandled rejection: ' + message + stack, true);
    dumpWasmCrashContext(e.reason, message);
    reportBuildMismatch(message);
  }
  // We already surfaced the first instance with a stack; suppress the
  // browser's duplicate default console report for repeated failures.
  if (e.preventDefault) e.preventDefault();
};
PES6.Errors = { dumpWasmCrashContext: dumpWasmCrashContext };
})(window.PES6);
