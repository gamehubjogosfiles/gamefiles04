const TITLES = {
  BlackBoxPark: 'Black Box Park',
  dmjumpline: 'DM Jumpline',
  DownTownSkatePark: 'Downtown Skate Park',
  IndustrialSkatePark: 'Industrial Skate Park',
  KenneyPark: 'Kenney Park',
  MaloofMoneyCup: 'Maloof Money Cup',
  MegaPark: 'Mega Park',
  SkateSchool: 'Skate School',
  StartPark: 'Start Park',
};

const PHOTO_PREVIEWS = {
  BlackBoxPark: { src: './images/blackbox-gameplay.jpg', alt: 'Skate 3 Black Box Park gameplay image', href: 'https://www.youtube.com/watch?v=LlPcuxB5-0A', label: 'GAMEPLAY PHOTO · SOURCE' },
  MaloofMoneyCup: { src: './images/maloof-gameplay.jpg', alt: 'Skate 3 Maloof Money Cup gameplay image', href: 'https://www.youtube.com/watch?v=lJIMvnZ-b1o', label: 'GAMEPLAY PHOTO · SOURCE' },
  MegaPark: { src: './images/megapark-gameplay.webp', alt: 'Skate 3 Super Ultra Mega Park map image', href: 'https://skate.fandom.com/wiki/Super_Ultra_Mega_Park', label: 'MAP PHOTO · WIKI SOURCE' },
  StartPark: { src: './images/startpark-gameplay.jpg', alt: 'Skate 3 Basic Training gameplay at the starting skatepark', href: 'https://www.youtube.com/watch?v=YRXfuF291_k&amp;t=55s', label: 'GAMEPLAY PHOTO · SOURCE' },
};

const PARK_ART = {
  BlackBoxPark: { accent: '#f07848', details: `<g>
    <path d="M38 264V214Q42 178 86 155L177 121V264Z" fill="#d7643d"/><path d="M38 264V214Q42 178 86 155L177 121V141L93 173Q61 190 58 218V264Z" fill="#a64731"/>
    <path d="M82 257L222 211L283 230L142 281Z" fill="#2fc8b2"/><path d="M142 281L283 230V249L142 301Z" fill="#168e83"/>
    <path d="M343 248L483 208L527 224L386 270Z" fill="#34434a"/><path d="M369 231L492 196" stroke="#f5f0e6" stroke-width="6" stroke-linecap="round"/><path d="M369 238L492 203" stroke="#ef8354" stroke-width="3"/>
    <path d="M610 198V93M650 196V94M590 95H671" stroke="#526169" stroke-width="7"/><path d="M85 88H635" stroke="#526169" stroke-width="5" opacity=".55"/>
  </g>` },
  dmjumpline: { accent: '#eaa93b', details: `<g>
    <path d="M58 267L130 208L206 267V286L58 286Z" fill="#df9b35"/><path d="M58 267L130 208L206 267L133 244Z" fill="#f4c760"/>
    <path d="M244 269L324 177L407 269V289L244 289Z" fill="#ca753a"/><path d="M244 269L324 177L407 269L327 239Z" fill="#f0a34c"/>
    <path d="M432 269L500 217L573 269V286L432 286Z" fill="#df9b35"/><path d="M432 269L500 217L573 269L503 246Z" fill="#f4c760"/>
    <path d="M178 251L221 237M390 245L427 231M566 253L620 239" stroke="#d7e0d9" stroke-width="5" stroke-linecap="round"/>
    <path d="M83 300H633" stroke="#f4c760" stroke-width="3" stroke-dasharray="9 12" opacity=".7"/>
  </g>` },
  DownTownSkatePark: { accent: '#52c2ad', details: `<g>
    <path d="M60 225H198V255H60Z" fill="#3c4a50"/><path d="M60 255H198V274H60Z" fill="#29363b"/>
    <path d="M242 214H365V242H242Z" fill="#e07b48"/><path d="M242 242H365V261H242Z" fill="#a84e38"/>
    <path d="M402 228L510 195L563 213L455 247Z" fill="#48565b"/><path d="M415 215L524 182" stroke="#cfe9df" stroke-width="5" stroke-linecap="round"/>
    <path d="M93 180V112H142V180M595 174V95H643V174" fill="#273239"/><path d="M106 129H128M106 145H128M607 115H631M607 132H631" stroke="#52c2ad" stroke-width="4"/>
    <path d="M176 265L217 265M365 268L398 268M552 260L599 260" stroke="#f3eee5" stroke-width="4" stroke-linecap="round"/>
  </g>` },
  IndustrialSkatePark: { accent: '#b5c267', details: `<g>
    <path d="M52 269V219Q56 190 91 177L189 141V269Z" fill="#697149"/><path d="M52 269V219Q56 190 91 177L189 141V160L98 192Q74 204 72 226V269Z" fill="#485237"/>
    <path d="M245 269L330 202L414 269V288H245Z" fill="#56624a"/><path d="M245 269L330 202L414 269L330 245Z" fill="#a0ad5a"/>
    <path d="M454 233L570 199L627 218L511 254Z" fill="#3b4743"/><path d="M465 221L582 187" stroke="#d2dac4" stroke-width="6" stroke-linecap="round"/>
    <path d="M119 156V75M219 158V73M320 177V86M122 83H221M222 92H319" stroke="#58646a" stroke-width="5" opacity=".8"/>
    <path d="M620 145V112M640 144V102" stroke="#b5c267" stroke-width="4"/>
  </g>` },
  KenneyPark: { accent: '#64c987', details: `<g>
    <path d="M65 270L65 232L153 197L238 230V270Z" fill="#49b982"/><path d="M65 232L153 197L238 230L151 249Z" fill="#80d6a0"/>
    <path d="M284 250H402V273H284Z" fill="#50636a"/><path d="M294 244L394 244" stroke="#f2f2db" stroke-width="5" stroke-linecap="round"/>
    <path d="M448 268V238Q452 216 481 203L552 177V268Z" fill="#4d9da0"/><path d="M448 268V238Q452 216 481 203L552 177V195L486 219Q465 230 464 245V268Z" fill="#347c83"/>
    <circle cx="128" cy="143" r="22" fill="#64c987" opacity=".75"/><circle cx="590" cy="145" r="28" fill="#64c987" opacity=".5"/>
    <path d="M110 285H570" stroke="#e5f0e1" stroke-width="3" stroke-dasharray="8 10" opacity=".7"/>
  </g>` },
  MaloofMoneyCup: { accent: '#e6a43a', details: `<g>
    <ellipse cx="205" cy="240" rx="140" ry="62" fill="#b47a38"/><ellipse cx="205" cy="228" rx="108" ry="39" fill="#202a2d"/><ellipse cx="205" cy="226" rx="80" ry="25" fill="#303d3d"/>
    <path d="M397 270L475 166L553 270V290H397Z" fill="#c66b3e"/><path d="M397 270L475 166L553 270L476 239Z" fill="#efa548"/>
    <path d="M420 254L507 254M434 237L496 237" stroke="#f7deae" stroke-width="3" opacity=".8"/>
    <path d="M80 176L126 160M562 187L627 166" stroke="#e6a43a" stroke-width="5" stroke-linecap="round"/>
    <path d="M567 100V145M603 92V145M556 101H615" stroke="#728187" stroke-width="4"/>
  </g>` },
  MegaPark: { accent: '#f0793f', details: `<g>
    <path d="M24 272V210Q28 160 93 137L208 98V272Z" fill="#d16a3d"/><path d="M24 272V210Q28 160 93 137L208 98V119L101 156Q51 177 48 215V272Z" fill="#9d4832"/>
    <path d="M238 271L332 184L429 271V293H238Z" fill="#eb9848"/><path d="M238 271L332 184L429 271L333 244Z" fill="#f5bb62"/>
    <path d="M459 272V210Q463 168 513 151L680 99V272Z" fill="#d16a3d"/><path d="M459 272V210Q463 168 513 151L680 99V120L521 171Q481 186 480 215V272Z" fill="#9d4832"/>
    <path d="M68 294H650" stroke="#f7d9aa" stroke-width="4" stroke-dasharray="12 12"/>
    <path d="M179 146L220 133M422 217L450 206" stroke="#eaf0e9" stroke-width="5" stroke-linecap="round"/>
  </g>` },
  SkateSchool: { accent: '#4eacd0', details: `<g>
    <path d="M64 270V244L138 211L210 244V270Z" fill="#398eae"/><path d="M64 244L138 211L210 244L138 260Z" fill="#61bbd1"/>
    <path d="M260 216H380V239H260Z" fill="#44545b"/><path d="M260 239H380V259H260Z" fill="#303d42"/>
    <path d="M423 269V247L474 226L525 247V269Z" fill="#bb7047"/><path d="M423 247L474 226L525 247L474 259Z" fill="#e69b5a"/>
    <path d="M85 188H185M284 197H367M438 204H516" stroke="#dbe7e7" stroke-width="4" stroke-linecap="round"/>
    <path d="M108 184L108 164M183 184L183 164M291 193L291 173M364 193L364 173" stroke="#dbe7e7" stroke-width="4"/>
    <path d="M574 266V218L621 197V266Z" fill="#455962"/><path d="M574 218L621 197" stroke="#72c9d7" stroke-width="4"/>
  </g>` },
  StartPark: { accent: '#e46d42', details: `<g>
    <path d="M70 270V237Q73 211 104 198L178 171V270Z" fill="#cb6842"/><path d="M70 270V237Q73 211 104 198L178 171V190L110 216Q91 225 89 242V270Z" fill="#994b35"/>
    <path d="M225 249H336V270H225Z" fill="#4b6165"/><path d="M239 242L324 242" stroke="#d9ece2" stroke-width="5" stroke-linecap="round"/>
    <path d="M393 270L451 226L508 270V285H393Z" fill="#c98543"/><path d="M393 270L451 226L508 270L451 253Z" fill="#e6b25d"/>
    <path d="M536 267V239L584 219L632 239V267Z" fill="#3f8589"/><path d="M536 239L584 219L632 239L584 254Z" fill="#5fb5aa"/>
    <path d="M101 292H607" stroke="#e8e4d8" stroke-width="3" stroke-dasharray="8 12" opacity=".65"/>
  </g>` },
};

export function mapTitle(name) {
  return TITLES[name] ?? String(name).replace(/([a-z0-9])([A-Z])/g, '$1 $2');
}

export function mapPhoto(name) {
  return PHOTO_PREVIEWS[name] ?? null;
}

export function mapPreview(name) {
  const photo = mapPhoto(name);
  if (photo) return `<img class="park-photo" src="${photo.src}" alt="${photo.alt}" loading="eager"><span class="preview-shade"></span><a class="preview-badge" href="${photo.href}" target="_blank" rel="noreferrer">${photo.label}</a>`;
  return `${mapArtwork(name)}<span class="preview-badge">Illustrative preview</span>`;
}

export function mapArtwork(name) {
  const scene = PARK_ART[name] ?? PARK_ART.StartPark;
  const id = `sky-${String(name).replace(/[^a-z0-9_-]/gi, '')}`;
  return `<svg class="park-art" viewBox="0 0 720 380" role="img" aria-label="Illustrative skatepark preview for ${mapTitle(name)}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#27363b"/><stop offset="1" stop-color="#121a1d"/></linearGradient>
      <linearGradient id="ground-${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#35434a"/><stop offset="1" stop-color="#192226"/></linearGradient>
    </defs>
    <rect width="720" height="380" fill="url(#${id})"/>
    <circle cx="585" cy="73" r="30" fill="${scene.accent}" opacity=".2"/>
    <path d="M0 150Q150 124 310 145T720 132V240H0Z" fill="#273339" opacity=".82"/>
    <path d="M0 184Q230 153 430 180T720 160V380H0Z" fill="url(#ground-${id})"/>
    <g fill="none" stroke="#dce6e2" stroke-opacity=".09" stroke-width="2">
      <path d="M0 218Q220 188 720 192M0 262Q240 230 720 230M0 310Q280 278 720 270"/>
      <path d="M112 180L34 380M245 171L197 380M390 170L390 380M535 168L588 380M666 163L710 380"/>
    </g>
    <g opacity=".26" stroke="#0b1012" stroke-width="10" stroke-linecap="round"><path d="M42 321H678"/></g>
    <g stroke="#101719" stroke-opacity=".5" stroke-width="3" stroke-linejoin="round">${scene.details}</g>
    <path d="M0 344Q180 322 360 342T720 330V380H0Z" fill="#0b1113" opacity=".44"/>
    <path d="M28 28H118" stroke="${scene.accent}" stroke-width="4" stroke-linecap="round" opacity=".9"/>
  </svg>`;
}
