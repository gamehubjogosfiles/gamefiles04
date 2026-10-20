(function (PES6) {
var Runtime = PES6.Runtime = PES6.Runtime || {};

function apply(module) {
  var searchParams = new URLSearchParams(window.location.search);
  var ini = PES6.Settings.readIni();

  // ?trace_commentary=1: [commentary] goal, selection and clip log.
  if (searchParams.has('trace_commentary')) {
    module.ccall('pes6_set_commentary_trace', null, ['number'],
                 [searchParams.get('trace_commentary') !== '0' ? 1 : 0]);
  }

  if (searchParams.has('trace_crash')) {
    module.ccall('pes6_set_crash_diagnostics', null, ['number'], [1]);
    PES6.Core.pushLine('Crash diagnostics enabled: chained guest PCs and AOT memory accesses will be traced.', false);
  }

  // ?trace_heap=1: game heap map with allocation callers ([guest-heap-map]).
  if (searchParams.has('trace_heap')) {
    var traceHeap = searchParams.get('trace_heap') !== '0';
    module.ccall('pes6_set_guest_heap_trace', null, ['number'], [traceHeap ? 1 : 0]);
    if (traceHeap) PES6.Core.pushLine('Guest heap trace enabled.', false);
  }

  // ?server= first, then pes6.ini [net] server, then config. "off" disables
  // online. Configure the paired relay now, but do not open its room-browser
  // socket until the player opens Online; ?room= is still used for tests.
  var netServer = PES6.NetServer.configured(PES6.Settings.getIniValue(ini, 'net', 'server'));
  var netRoom = searchParams.get('room') || PES6.Rooms.WAIT_ROOM;
  if (netServer.toLowerCase() === 'off') netServer = '';

  if (netServer) {
    module.pes6RtcMode = searchParams.get('rtc') || PES6.Settings.getIniValue(ini, 'net', 'rtc') || 'reliable';
    // Optional test: ?rtc_buffer_kb=256 (16..1024 KB). Default remains 1024 KB.
    if (searchParams.has('rtc_buffer_kb')) {
      var rtcBufferKb = Number(searchParams.get('rtc_buffer_kb'));
      if (Number.isInteger(rtcBufferKb) && rtcBufferKb >= 16 && rtcBufferKb <= 1024) {
        module.pes6RtcMaxBuffered = rtcBufferKb * 1024;
      }
    }
    var rtcStun = searchParams.get('stun');
    if (rtcStun) module.pes6RtcStun = rtcStun.split(',').filter(function (url) { return url; });
    PES6.Rooms.Link.configure(netServer);
    netServer = PES6.Rooms.Link.gameServerUrl(netServer);
    // ?snapshot_pacing=0 (off) or =adaptive: follower jitter buffer modes for
    // comparison runs; fixed (depth 1 at all times) otherwise.
    var snapshotPacing = searchParams.get('snapshot_pacing') ||
                         PES6.Settings.getIniValue(ini, 'net', 'snapshot_pacing');
    if (snapshotPacing) {
      var snapshotPacingMode = snapshotPacing === '0' ? 0 : snapshotPacing === 'adaptive' ? 1 : 2;
      module.ccall('pes6_set_snapshot_pacing', null, ['number'], [snapshotPacingMode]);
    }
    module.ccall('pes6_set_adhoc_server', null, ['string', 'string'], [netServer, netRoom]);
    PES6.Core.pushLine('Online relay: ' + netServer.replace(/pair=[^&]+/, 'pair=***') + ' room=' + netRoom +
                       ' webrtc=' + module.pes6RtcMode, false);
  }

  var countedPcs = searchParams.get('count_pc');
  if (!countedPcs && searchParams.has('profile_graphics')) {
    countedPcs = '0x0884AEC8,0x0886EB40,0x0886FF78,0x0886FFB8,0x0886C260,0x0886FF30,0x0886FEE4,0x0886C624';
  }
  if (countedPcs) {
    module.ccall('pes6_set_counted_pcs', null, ['string'], [countedPcs]);
    PES6.Core.pushLine('Profiling PCs: ' + countedPcs, false);
  }

  // ?slice_ms=<ms per turn> ?slice_max_ms=<cap while running behind; 0 = fixed>
  if (searchParams.has('slice_ms') || searchParams.has('slice_max_ms')) {
    var sliceMs = parseFloat(searchParams.get('slice_ms') || '0');
    var sliceMaxMs = parseFloat(searchParams.get('slice_max_ms') || '-1');
    module.ccall('pes6_set_web_slice_budget', null, ['number', 'number'],
                 [isFinite(sliceMs) ? sliceMs : 0, isFinite(sliceMaxMs) ? sliceMaxMs : -1]);
  }

  var perfEnabled = searchParams.has('perf') && searchParams.get('perf') !== '0';
  if (perfEnabled) {
    module.ccall('pes6_set_web_perf_report', null, ['number'], [1]);
    PES6.Core.pushLine('Performance report enabled.', false);
  }
  if (searchParams.has('ge_timing')) {
    var geTiming = searchParams.get('ge_timing') !== '0';
    module.ccall('pes6_set_ge_timing', null, ['number'], [geTiming ? 1 : 0]);
    if (geTiming && !perfEnabled) {
      module.ccall('pes6_set_web_perf_report', null, ['number'], [1]);
      perfEnabled = true;
    }
    if (geTiming) PES6.Core.pushLine('Detailed GE timing enabled.', false);
  }
  // Default on in WebGL2. Compare the same match with ?geometry_cache=0.
  if (searchParams.has('geometry_cache')) {
    module.ccall('pes6_set_geometry_cache', null, ['number'],
                 [searchParams.get('geometry_cache') === '0' ? 0 : 1]);
  }
  // Default off; compare the same match with ?decoded_geometry_cache=1.
  if (searchParams.has('decoded_geometry_cache')) {
    module.ccall('pes6_set_decoded_geometry_cache', null, ['number'],
                 [searchParams.get('decoded_geometry_cache') === '0' ? 0 : 1]);
  }
  // ?frameskip=<max frames skipped in a row while running behind>; default 1,
  // 0 renders every frame.
  if (searchParams.has('frameskip') && typeof module._pes6_set_frame_skip === 'function') {
    var frameSkip = parseInt(searchParams.get('frameskip'), 10);
    module.ccall('pes6_set_frame_skip', null, ['number'],
                 [isFinite(frameSkip) && frameSkip > 0 ? frameSkip : 0]);
  }
  if (searchParams.get('simple_fragments') === '1') {
    module.ccall('pes6_set_simple_fragments', null, ['number'], [1]);
  }
  if (searchParams.get('simple_shader') === '1') {
    module.ccall('pes6_set_simple_shader', null, ['number'], [1]);
  }

  if (searchParams.has('overlay_aot_entries')) {
    var overlayEntries = searchParams.get('overlay_aot_entries') !== '0';
    module.ccall('pes6_set_overlay_entry_chaining', null, ['number'], [overlayEntries ? 1 : 0]);
    PES6.Core.pushLine('Overlay AOT entries: ' + (overlayEntries ? 'shared memory' : 'legacy wrappers'), false);
  }
  if (searchParams.has('overlay_aot_direct')) {
    var overlayDirect = searchParams.get('overlay_aot_direct') !== '0';
    module.ccall('pes6_set_overlay_direct_chaining', null, ['number'], [overlayDirect ? 1 : 0]);
    PES6.Core.pushLine('Overlay AOT direct pilot: ' + (overlayDirect ? 'enabled' : 'disabled'), false);
  }

  if (searchParams.has('profile_hot')) {
    var hotInterval = parseInt(searchParams.get('profile_hot') || '256', 10);
    if (!isFinite(hotInterval) || hotInterval < 1) hotInterval = 256;
    module.ccall('pes6_set_hot_pc_sampling', null, ['number'], [hotInterval]);
    PES6.Core.pushLine('Hot AOT PC sampling enabled every ' + hotInterval + ' entries.', false);
  }

  if (searchParams.has('validate_reimpl')) {
    module.ccall('pes6_set_reimplementation_validation', null, ['number'], [1]);
    PES6.Core.pushLine('Reimplementation shadow validation enabled.', false);
  }

  if (searchParams.has('trace_native_renderer')) {
    var rendererTraceInterval = parseInt(searchParams.get('trace_native_renderer') || '512', 10);
    if (!isFinite(rendererTraceInterval) || rendererTraceInterval < 1) rendererTraceInterval = 512;
    module.ccall('pes6_set_native_renderer_trace', null, ['number'], [rendererTraceInterval]);
    PES6.Core.pushLine('Native renderer descriptor trace enabled every ' + rendererTraceInterval + ' calls.', false);
  }

  if (searchParams.has('native_renderer_visual_test')) {
    module.ccall('pes6_set_native_renderer_visual_test', null, ['number'], [1]);
    PES6.Core.pushLine('Native renderer visual test enabled.', false);
  }

  // Native renderer replacement is on unless URL or pes6.ini disables it.
  var nativeRenderer = searchParams.has('native_renderer_replace')
    ? searchParams.get('native_renderer_replace')
    : PES6.Settings.getIniValue(ini, 'debug', 'native_renderer_replace');
  if (nativeRenderer !== '0') {
    module.ccall('pes6_set_native_renderer_replace', null, ['number'], [1]);
    PES6.Core.pushLine('Native renderer replacement enabled.', false);
  }
}

Runtime.Debug = {
  apply: apply
};
})(window.PES6);
