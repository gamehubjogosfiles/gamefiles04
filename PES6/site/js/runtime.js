(function (PES6) {
var Runtime = PES6.Runtime = PES6.Runtime || {};

// The implementation lives in js/runtime/*.
Runtime.init = function () {
  Runtime.Player.init();
  PES6.Core.setStatus('Descargando...');
};

Runtime.init();
})(window.PES6);
