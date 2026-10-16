// =====================================================================
// Configuración de la página. Todo lo que hay que tocar para publicarla
// está en este archivo: de dónde se descarga cada archivo y el online por defecto.
// =====================================================================
window.PES6 = window.PES6 || {};

window.PES6.Config = {
  // Loader de Emscripten (chico); va junto a esta página.
  engineScript: 'PES6Recomp.js',
  // Motor y datos precargados, comprimidos con gzip por el build (~16 MB + ~3 MB)
  // para entrar en el límite de 25 MiB por archivo de Cloudflare Pages.
  // También acepta los archivos sin comprimir (PES6Recomp.wasm / .data).
  wasm: 'PES6Recomp.wasm.gz',
  data: 'PES6Recomp.data.gz',
  // Datos del juego, leídos por partes con peticiones Range.
  // '' = /PSP_GAME/USRDIR/pes6.pak en este mismo sitio; 'off' = .afs sueltos.
  pak: 'assets/pes6.pak',
  // Generado con pak_commentary_manifest.py para el mismo PAK. Si no coincide,
  // se busca <URL del PAK>.commentary.json; sin lista se precarga todo el PAK.
  commentaryManifest: 'assets/pak-commentary.json',
  // Lo mismo para cada relator extra del PAK (s_sound_<voz>.afs, botón de inicio
  // con data-commentary="<voz>"); si falta, se busca <URL del PAK>.commentary-<voz>.json.
  commentaryVoiceManifests: { mariano: 'assets/pak-commentary-mariano.json' },
  // Online: relay cuando ni la URL ni Ajustes indican otro.
  netServer: 'wss://sv.optijuegos.net/pes6',
  // Lista de salas (pestaña Online): página que abren los links de invitación.
  roomShareBase: 'https://pes6.optijuegos.net/',
  // Pestaña Chat: página embebida en un iframe; '' la oculta.
  chat: 'assets/chat.html',
  // AdSense: se carga cuando el motor ya compiló (js/ads.js); '' lo desactiva.
  adsClient: ''
};
