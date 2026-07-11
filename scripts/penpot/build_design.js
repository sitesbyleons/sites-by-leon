const COLORS = {
  graphite: '#090A0C',
  graphite2: '#101217',
  graphite3: '#181B22',
  ivory: '#F3EFE6',
  silver: '#9A9DA6',
  silverLight: '#C3C5CB',
  blue: '#4C7DFF',
  blueLight: '#86A5FF',
  blueDark: '#2549A8',
};

const displayFont = penpot.fonts.findByName('Cormorant Garamond') || penpot.fonts.findByName('Cormorant');
const interfaceFont = penpot.fonts.findByName('Manrope') || penpot.fonts.findByName('Inter');
const signatureFont = penpot.fonts.findByName('Allura') || displayFont;

function addRect(parent, name, x, y, width, height, fill, radius = 0, opacity = 1) {
  const shape = penpot.createRectangle();
  shape.name = name;
  shape.x = parent.x + x;
  shape.y = parent.y + y;
  shape.resize(width, height);
  shape.fills = [{ fillColor: fill, fillOpacity: opacity }];
  shape.borderRadius = radius;
  parent.appendChild(shape);
  return shape;
}

function addEllipse(parent, name, x, y, width, height, fill, opacity = 1) {
  const shape = penpot.createEllipse();
  shape.name = name;
  shape.x = parent.x + x;
  shape.y = parent.y + y;
  shape.resize(width, height);
  shape.fills = [{ fillColor: fill, fillOpacity: opacity }];
  parent.appendChild(shape);
  return shape;
}

function addLine(parent, name, x, y, width, color, opacity = 1) {
  return addRect(parent, name, x, y, width, 1, color, 0, opacity);
}

function addText(parent, name, characters, x, y, width, size, color, options = {}) {
  const shape = penpot.createText(characters);
  if (!shape) return null;
  shape.name = name;
  const font = options.font === 'display' ? displayFont : options.font === 'signature' ? signatureFont : interfaceFont;
  if (font) font.applyToText(shape);
  shape.fontSize = String(size);
  const requestedWeight = options.font === 'signature' ? 400 : options.weight || (options.font === 'display' ? 400 : 600);
  const supportedWeights = font?.variants.map((variant) => Number(variant.fontWeight)).filter(Number.isFinite) || [400];
  const weight = supportedWeights.reduce((closest, candidate) =>
    Math.abs(candidate - requestedWeight) < Math.abs(closest - requestedWeight) ? candidate : closest,
  supportedWeights[0] || 400);
  shape.fontWeight = String(weight);
  shape.fontStyle = options.italic ? 'italic' : 'normal';
  shape.lineHeight = String(options.lineHeight || 1.05);
  shape.letterSpacing = String(options.letterSpacing || 0);
  shape.align = options.align || 'left';
  shape.fills = [{ fillColor: color, fillOpacity: options.opacity ?? 1 }];
  shape.x = parent.x + x;
  shape.y = parent.y + y;
  shape.resize(width, options.height || size * (options.lines || 2));
  shape.growType = 'auto-height';
  parent.appendChild(shape);
  return shape;
}

function addButton(parent, name, label, x, y, width, fill, color) {
  const button = addRect(parent, name, x, y, width, 54, fill, 10);
  addText(parent, `${name} / Label`, label, x, y + 16, width, 14, color, { weight: 750, align: 'center', height: 24 });
  return button;
}

function addBrowser(parent, name, x, y, width, height, tone, title) {
  addRect(parent, `${name} / Shell`, x, y, width, height, COLORS.graphite2, 18);
  addRect(parent, `${name} / Chrome`, x, y, width, 46, COLORS.graphite3, 18);
  addLine(parent, `${name} / Chrome divider`, x, y + 46, width, COLORS.silver, 0.25);
  for (let i = 0; i < 3; i += 1) addEllipse(parent, `${name} / Chrome dot ${i + 1}`, x + 18 + i * 14, y + 19, 7, 7, COLORS.silver, 0.8);
  addText(parent, `${name} / Address`, title.toLowerCase().replaceAll(' ', '') + '.studio', x + width * 0.28, y + 16, width * 0.44, 10, COLORS.silver, { align: 'center', height: 18 });
  addRect(parent, `${name} / Scene`, x + 18, y + 66, width - 36, height - 84, tone, 8);
  addEllipse(parent, `${name} / Scene orbit`, x + width * 0.48, y + height * 0.24, width * 0.34, width * 0.34, COLORS.ivory, 0.16);
  addLine(parent, `${name} / Scene beam`, x + width * 0.28, y + height * 0.63, width * 0.58, COLORS.ivory, 0.58).rotation = -24;
  addText(parent, `${name} / Brand`, title, x + 44, y + 86, width * 0.45, 16, COLORS.ivory, { weight: 750, height: 25 });
  addText(parent, `${name} / Display`, title, x + 44, y + height * 0.58, width * 0.56, Math.max(34, width * 0.07), COLORS.ivory, { font: 'display', lineHeight: 0.86, lines: 2 });
}

function addEyebrow(parent, text, x, y, width, light = false) {
  return addText(parent, `Eyebrow / ${text}`, text.toUpperCase(), x, y, width, 12, light ? COLORS.blueDark : COLORS.blueLight, { weight: 750, letterSpacing: 1.5, height: 22 });
}

function addPricingCard(parent, x, y, width, name, price, featured = false) {
  const fill = featured ? COLORS.blue : COLORS.graphite2;
  const ink = featured ? COLORS.graphite : COLORS.ivory;
  addRect(parent, `Pricing / ${name}`, x, y, width, 570, fill, 18);
  addText(parent, `Pricing / ${name} / Name`, name.toUpperCase(), x + 28, y + 32, width - 56, 12, ink, { weight: 750, letterSpacing: 1.4, height: 20 });
  addText(parent, `Pricing / ${name} / Price`, `$${price}`, x + 28, y + 92, width - 56, 86, ink, { font: 'display', weight: 450, height: 110 });
  addText(parent, `Pricing / ${name} / Interval`, '/ month', x + 31, y + 185, width - 60, 12, featured ? COLORS.graphite : COLORS.silver, { height: 20 });
  addText(parent, `Pricing / ${name} / Description`, name === 'Essential' ? 'A polished one-page home for your work.' : name === 'Studio' ? 'A fuller portfolio and inquiry journey.' : 'A tailored presence for ambitious ideas.', x + 28, y + 235, width - 56, 16, featured ? COLORS.graphite : COLORS.silverLight, { lineHeight: 1.45, lines: 3 });
  ['Designed for your images', 'Hosting and routine care', 'Direct support from Leon'].forEach((item, index) => {
    addLine(parent, `Pricing / ${name} / Divider ${index}`, x + 28, y + 330 + index * 48, width - 56, featured ? COLORS.graphite : COLORS.silver, 0.2);
    addText(parent, `Pricing / ${name} / Feature ${index + 1}`, `â†³  ${item}`, x + 28, y + 342 + index * 48, width - 56, 12, ink, { weight: 600, height: 20 });
  });
  addButton(parent, `Pricing / ${name} / CTA`, 'Contact', x + 28, y + 492, width - 56, featured ? COLORS.graphite : COLORS.ivory, featured ? COLORS.ivory : COLORS.graphite);
}

function createTokens() {
  const catalog = penpot.library.local.tokens;
  let set = catalog.sets.find((candidate) => candidate.name === 'sites-by-leon-core');
  if (!set) set = catalog.addSet({ name: 'sites-by-leon-core', active: true });
  if (!set.active) set.toggleActive();
  const values = [
    ['color', 'color.graphite.950', COLORS.graphite],
    ['color', 'color.graphite.900', COLORS.graphite2],
    ['color', 'color.ivory.100', COLORS.ivory],
    ['color', 'color.silver.500', COLORS.silver],
    ['color', 'color.blue.500', COLORS.blue],
    ['spacing', 'space.2', '8'], ['spacing', 'space.3', '12'], ['spacing', 'space.4', '16'],
    ['spacing', 'space.6', '24'], ['spacing', 'space.8', '32'], ['spacing', 'space.12', '48'], ['spacing', 'space.20', '80'],
    ['borderRadius', 'radius.sm', '10'], ['borderRadius', 'radius.md', '18'], ['borderRadius', 'radius.pill', '999'],
  ];
  for (const [type, name, value] of values) {
    if (!set.tokens.find((token) => token.name === name)) set.addToken({ type, name, value });
  }
  return set;
}

function buildDesktop(page) {
  const board = penpot.createBoard();
  board.name = 'Homepage / Desktop / 1440';
  board.x = 0;
  board.y = 0;
  board.resize(1440, 8660);
  board.fills = [{ fillColor: COLORS.graphite, fillOpacity: 1 }];
  board.clipContent = true;
  page.root.appendChild(board);

  addRect(board, 'Hero / Background', 0, 0, 1440, 1120, COLORS.graphite);
  addEllipse(board, 'Hero / Atmosphere', 830, 90, 650, 650, COLORS.blue, 0.08);
  addLine(board, 'Hero / Beam', 710, 510, 760, COLORS.blue, 0.45).rotation = -27;
  addRect(board, 'Navigation / Shell', 60, 28, 1320, 84, COLORS.graphite2, 18);
  addText(board, 'Navigation / Brand / Sites', 'Sites\nBy\nLeon', 86, 40, 90, 26, COLORS.ivory, { font: 'signature', align: 'center', lineHeight: 0.6, lines: 3 });
  addText(board, 'Navigation / Links', 'WORK       SERVICES       PRICING', 950, 58, 270, 12, COLORS.silverLight, { weight: 700, height: 20 });
  addButton(board, 'Navigation / Contact', 'Contact', 1230, 44, 118, COLORS.blue, COLORS.graphite);
  addEyebrow(board, 'Web design  â€¢  Managed hosting', 72, 190, 520);
  addText(board, 'Hero / Heading', 'Websites for\nphotographers,', 72, 245, 700, 116, COLORS.ivory, { font: 'display', lineHeight: 0.78, lines: 2 });
  addText(board, 'Hero / Heading accent', 'without the\nwebsite headache.', 126, 435, 650, 102, COLORS.blueLight, { font: 'display', italic: true, lineHeight: 0.82, lines: 2 });
  addText(board, 'Hero / Description', 'A cinematic home for your workâ€”designed, launched, hosted,\nand cared for by one person you can actually reach.', 72, 675, 610, 18, COLORS.silverLight, { lineHeight: 1.45, lines: 2 });
  addButton(board, 'Hero / Contact', 'Contact', 72, 770, 136, COLORS.blue, COLORS.graphite);
  addText(board, 'Hero / Email', 'sites.by.leon@gmail.com  â†—', 238, 786, 340, 14, COLORS.ivory, { weight: 700, height: 24 });
  addLine(board, 'Hero / Fact divider', 72, 865, 620, COLORS.silver, 0.28);
  addText(board, 'Hero / Facts', 'MONTHLY ONLY    /    $25â€“$40    /    DOMAIN + PAYMENTS', 72, 890, 610, 11, COLORS.silver, { letterSpacing: 0.8, height: 20 });
  addBrowser(board, 'Hero / Website preview', 800, 190, 560, 710, '#4C4138', 'Aster House');

  addRect(board, 'Promise / Background', 0, 1120, 1440, 300, COLORS.graphite2);
  [
    ['01', 'Effortless', 'You bring the work. I handle the web.'],
    ['02', 'Photographer-specific', 'Built around images, inquiries, and trust.'],
    ['03', 'Actually affordable', 'Clear monthly pricing. No giant build fee.'],
  ].forEach((item, index) => {
    const x = index * 480;
    addRect(board, `Promise / Divider ${index + 1}`, x, 1120, 1, 300, COLORS.silver, 0, 0.18);
    addText(board, `Promise / ${item[1]} / Index`, item[0], x + 52, 1160, 80, 11, COLORS.blueLight, { letterSpacing: 1.2, height: 18 });
    addText(board, `Promise / ${item[1]} / Title`, item[1], x + 52, 1240, 360, 38, COLORS.ivory, { font: 'display', height: 50 });
    addText(board, `Promise / ${item[1]} / Copy`, item[2], x + 52, 1300, 360, 14, COLORS.silver, { lineHeight: 1.4, lines: 2 });
  });

  addRect(board, 'Work / Background', 0, 1420, 1440, 2080, COLORS.ivory, 44);
  addEyebrow(board, '02 / Selected directions', 72, 1530, 260, true);
  addText(board, 'Work / Heading', 'Three ways your work could', 350, 1510, 790, 82, COLORS.graphite, { font: 'display', lineHeight: 0.92, height: 100 });
  addText(board, 'Work / Heading accent', 'own the room.', 770, 1610, 500, 82, COLORS.blueDark, { font: 'display', italic: true, height: 100 });
  addText(board, 'Work / Honesty note', 'Original concept projectsâ€”not client claimsâ€”built to show how different\nphotography businesses can feel completely their own.', 350, 1740, 710, 16, '#4E5158', { lineHeight: 1.5, lines: 2 });
  addLine(board, 'Work / Header divider', 72, 1860, 1296, '#5D6068', 0.25);
  const concepts = [
    ['Vow & Light', 'EDITORIAL WEDDING PHOTOGRAPHY', '#4A4038'],
    ['Northline Portraits', 'BOLD PORTRAIT STUDIO', '#172B64'],
    ['Fieldwork Commercial', 'MINIMAL COMMERCIAL PHOTOGRAPHY', '#6B6F78'],
  ];
  concepts.forEach((item, index) => {
    const x = 72 + index * 432;
    addText(board, `Work / ${item[0]} / Index`, `0${index + 1}`, x, 1930, 60, 11, '#5E6169', { height: 18 });
    addRect(board, `Work / ${item[0]} / Label`, x + 180, 1918, 160, 34, COLORS.ivory, 17);
    addText(board, `Work / ${item[0]} / Label text`, 'CONCEPT PROJECT', x + 190, 1927, 140, 10, COLORS.graphite, { weight: 750, align: 'center', letterSpacing: 0.8, height: 18 });
    addBrowser(board, `Work / ${item[0]} / Browser`, x, 1990, 384, 500, item[2], item[0]);
    addText(board, `Work / ${item[0]} / Focus`, item[1], x, 2530, 384, 11, '#5E6169', { weight: 750, letterSpacing: 0.8, height: 18 });
    addText(board, `Work / ${item[0]} / Title`, item[0], x, 2570, 384, 48, COLORS.graphite, { font: 'display', lineHeight: 0.9, lines: 2 });
    addText(board, `Work / ${item[0]} / Copy`, index === 0 ? 'Quiet editorial space for moments that need room to breathe.' : index === 1 ? 'High-contrast structure that makes personality impossible to ignore.' : 'A disciplined grid for campaigns, products, and commissions.', x, 2680, 370, 14, '#555961', { lineHeight: 1.45, lines: 3 });
  });

  addRect(board, 'Process / Background', 0, 3500, 1440, 820, COLORS.graphite);
  addEyebrow(board, '03 / The process', 72, 3610, 220);
  addText(board, 'Process / Heading', 'A clear path from â€œI need a siteâ€ to live.', 350, 3585, 780, 76, COLORS.ivory, { font: 'display', lineHeight: 0.9, lines: 2 });
  const processItems = ['Start with a conversation', 'Shape the direction', 'Review the build', 'Launch without the headache'];
  processItems.forEach((label, index) => {
    const y = 3830 + index * 105;
    addLine(board, `Process / Row ${index + 1}`, 72, y, 1296, COLORS.silver, 0.22);
    addText(board, `Process / ${label} / Index`, `0${index + 1}`, 72, y + 30, 80, 11, COLORS.blueLight, { height: 18 });
    addText(board, `Process / ${label}`, label, 220, y + 20, 500, 30, COLORS.ivory, { font: 'display', height: 40 });
    addText(board, `Process / ${label} / Note`, ['Tell me what you photograph and what you need.', 'Align on pages, personality, and images.', 'See the site and refine the details together.', 'I publish, host, and stay available.'][index], 760, y + 28, 520, 13, COLORS.silver, { height: 24 });
  });

  addRect(board, 'Pricing / Background', 0, 4320, 1440, 1180, COLORS.graphite2);
  addEyebrow(board, '04 / Monthly packages', 72, 4430, 250);
  addText(board, 'Pricing / Heading', 'Professional presence.', 350, 4400, 750, 82, COLORS.ivory, { font: 'display', height: 95 });
  addText(board, 'Pricing / Heading accent', 'Human-sized pricing.', 350, 4490, 750, 82, COLORS.blueLight, { font: 'display', italic: true, height: 95 });
  addText(board, 'Pricing / Note', 'Monthly only. No separate build fee.', 990, 4475, 320, 15, COLORS.silverLight, { height: 25 });
  addPricingCard(board, 72, 4690, 408, 'Essential', 30, false);
  addPricingCard(board, 516, 4690, 408, 'Studio', 65, true);
  addPricingCard(board, 960, 4690, 408, 'Signature', 100, false);

  addRect(board, 'Services / Background', 0, 5500, 1440, 1220, COLORS.ivory);
  addEyebrow(board, '05 / Everything handled', 72, 5610, 260, true);
  addText(board, 'Services / Heading', 'Your website should create momentum,', 350, 5580, 820, 74, COLORS.graphite, { font: 'display', height: 90 });
  addText(board, 'Services / Heading accent', 'not another job.', 730, 5670, 520, 74, COLORS.blueDark, { font: 'display', italic: true, height: 90 });
  const s×Ž}¶‰žËkºwµç]•¡½ÍÑ¥¹œ™½ÈÁ¡½Ñ½É…Á¡•ÉÌÝ¡¼Ý…¹ÐÑ¡”Ý•ˆ¡…¹‘±•¸œ°€ÈÜÀ°€àÐÜÀ°€ÔÈÀ°€ÄÐ°=1=IL¹Í¥±Ù•È°ì±¥¹•Ìè€Èô¤ì4(€…‘‘Q•áÐ¡‰½…É°€½½Ñ•È€¼µ…¥°œ°€Í¥Ñ•Ì¹‰ä¹±•½¹µ…¥°¹½´œ°€ÄÀÌÀ°€àÐÜÀ°€ÌÌÀ°€ÈÈ°=1=IL¹¥Ù½Éä°ì™½¹Ðè€‘¥ÍÁ±…äœ°…±¥¸è€É¥¡Ðœ°¡•¥¡Ðè€ÌÔô¤ì4(€É•ÑÕÉ¸‰½…Éì4)ô4(4)™Õ¹Ñ¥½¸‰Õ¥±‘5½‰¥±”¡Á…”¤ì4(€½¹ÍÐ‰½…É€ôÁ•¹Á½Ð¹É•…Ñ•	½…É ¤ì4(€‰½…É¹¹…µ”€ô€!½µ•Á…”€¼5½‰¥±”€¼€ÌäÀœì4(€‰½…É¹à€ô€ÄØÀÀì4(€‰½…É¹ä€ô€Àì4(€‰½…É¹É•Í¥é” ÌäÀ°€ÄÀÜÔÀ¤ì4(€‰½…É¹™¥±±Ì€ômì™¥±±½±½Èè=1=IL¹É…Á¡¥Ñ”°™¥±±=Á…¥Ñäè€Äõtì4(€‰½…É¹±¥Á½¹Ñ•¹Ð€ôÑÉÕ”ì4(€Á…”¹É½½Ð¹…ÁÁ•¹‘¡¥±¡‰½…É¤ì4(4(€…‘‘I•Ð¡‰½…É°€5½‰¥±”€¼!•É¼œ°€À°€À°€ÌäÀ°€ÄÀàÀ°=1=IL¹É…Á¡¥Ñ”¤ì4(€…‘‘I•Ð¡‰½…É°€5½‰¥±”€¼9…Ù¥…Ñ¥½¸œ°€ÄØ°€ÄØ°€ÌÔà°€ÜØ°=1=IL¹É…Á¡¥Ñ”È°€ÄØ¤ì4(€…‘‘Q•áÐ¡‰½…É°€5½‰¥±”€¼	É…¹œ°€M¥Ñ•Íq¹	åq¹1•½¸œ°€ÌÀ°€ÈÔ°€Üà°€ÈÌ°=1=IL¹¥Ù½Éä°ì™½¹Ðè€Í¥¹…ÑÕÉ”œ°…±¥¸è€•¹Ñ•Èœ°±¥¹•!•¥¡Ðè€À¸ÔØ°±¥¹•Ìè€Ìô¤ì4(€…‘‘	ÕÑÑ½¸¡‰½…É°€5½‰¥±”€¼½¹Ñ…ÐQœ°€½¹Ñ…Ðœ°€ÈÜÐ°€Èà°€àØ°=1=IL¹‰±Õ”°=1=IL¹É…Á¡¥Ñ”¤ì4(€…‘‘å•‰É½Ü¡‰½…É°€]•ˆ‘•Í¥¸€ƒŠˆ€5…¹…•¡½ÍÑ¥¹œœ°€ÈÀ°€ÄÐÀ°€ÌÐÀ¤ì4(€…‘‘Q•áÐ¡‰½…É°€5½‰¥±”€¼!•É¼¡•…‘¥¹œœ°€]•‰Í¥Ñ•Ì™½Éq¹Á¡½Ñ½É…Á¡•ÉÌ°œ°€ÈÀ°€ÄàØ°€ÌÔÀ°€ÔÌ°=1=IL¹¥Ù½Éä°ì™½¹Ðè€‘¥ÍÁ±…äœ°±¥¹•!•¥¡Ðè€À¸àÈ°±¥¹•Ìè€Èô¤ì4(€…‘‘Q•áÐ¡‰½…É°€5½‰¥±”€¼!•É¼…•¹Ðœ°€Ý¥Ñ¡½ÕÐÑ¡•q¹Ý•‰Í¥Ñ”¡•…‘…¡”¸œ°€ÌÐ°€ÈàØ°€ÌÌÀ°€ÔÀ°=1=IL¹‰±Õ•1¥¡Ð°ì™½¹Ðè€‘¥ÍÁ±…äœ°¥Ñ…±¥ŒèÑÉÕ”°±¥¹•!•¥¡Ðè€À¸àÐ°±¥¹•Ìè€Èô¤ì4(€…‘‘Q•áÐ¡‰½…É°€5½‰¥±”€¼!•É¼‘•ÍÉ¥ÁÑ¥½¸œ°€¥¹•µ…Ñ¥Œ¡½µ”™½Èå½ÕÈÝ½É¯ŠQ‘•Í¥¹•°±…Õ¹¡•°¡½ÍÑ•±q¹…¹…É•™½È‰ä½¹”Á•ÉÍ½¸å½Ô…¸…ÑÕ…±±äÉ•… ¸œ°€ÈÀ°€ÐÈÀ°€ÌÔÀ°€ÄÔ°=1=IL¹Í¥±Ù•É1¥¡Ð°ì±¥¹•!•¥¡Ðè€Ä¸ÐÔ°±¥¹•Ìè€Ðô¤ì4(€…‘‘	ÕÑÑ½¸¡‰½…É°€5½‰¥±”€¼!•É¼Qœ°€½¹Ñ…Ðœ°€ÈÀ°€ÔÌÔ°€ÌÔÀ°=1=IL¹‰±Õ”°=1=IL¹É…Á¡¥Ñ”¤ì4(€…‘‘Q•áÐ¡‰½…É°€5½‰¥±”€¼!•É¼•µ…¥°œ°€Í¥Ñ•Ì¹‰ä¹±•½¹µ…¥°¹½´€ƒŠ\œ°€ÈÀ°€ØÄÈ°€ÌÔÀ°€ÄÌ°=1=IL¹¥Ù½Éä°ìÝ•¥¡Ðè€ÜÀÀ°¡•¥¡Ðè€ÈÈô¤ì4(€…‘‘Q•áÐ¡‰½…É°€5½‰¥±”€¼!•É¼™…ÑÌœ°€5=9Q!1d=91d€€€¼€€€È×ŠLÐÀ€€€¼€€=5%8€¬Ae59QLœ°€ÈÀ°€ØàÀ°€ÌÔÀ°€ä°=1=IL¹Í¥±Ù•È°ì±•ÑÑ•ÉMÁ…¥¹œè€À¸Ô°¡•¥¡Ðè€Äàô¤ì4(€…‘‘	É½ÝÍ•È¡‰½…É°€5½‰¥±”€¼!•É¼‰É½ÝÍ•Èœ°€ÈÀ°€ÜÌÀ°€ÌÔÀ°€ÌÀÔ°€œŒÑÐÄÌàœ°€ÍÑ•È!½ÕÍ”œ¤ì4(4(€…‘‘I•Ð¡‰½…É°€5½‰¥±”€¼AÉ½µ¥Í”œ°€À°€ÄÀàÀ°€ÌäÀ°€ÌÌÀ°=1=IL¹É…Á¡¥Ñ”È¤ì4(€mlœÀÄœ°€™™½ÉÑ±•ÍÌt°lœÀÈœ°€A¡½Ñ½É…Á¡•ÈµÍÁ•¥™¥Œt°lœÀÌœ°€ÑÕ…±±ä…™™½É‘…‰±”ut¹™½É…  ¡¥Ñ•´°¥¹‘•à¤€ôøì4(€€€½¹ÍÐä€ô€ÄÄÄÔ€¬¥¹‘•à€¨€äÐì4(€€€…‘‘1¥¹”¡‰½…É°5½‰¥±”€¼AÉ½µ¥Í”€¼1¥¹”€‘í¥¹‘•áõ€°€ÈÀ°ä°€ÌÔÀ°=1=IL¹Í¥±Ù•È°€À¸È¤ì4(€€€…‘‘Q•áÐ¡‰½…É°5½‰¥±”€¼AÉ½µ¥Í”€¼€‘í¥Ñ•µlÅuô€¼%¹‘•á€°¥Ñ•µlÁt°€ÈÀ°ä€¬€ÈÔ°€ÐÀ°€ÄÀ°=1=IL¹‰±Õ•1¥¡Ð°ì¡•¥¡Ðè€Äàô¤ì4(€€€…‘‘Q•áÐ¡‰½…É°5½‰¥±”€¼AÉ½µ¥Í”€¼€‘í¥Ñ•µlÅuõ€°¥Ñ•µlÅt°€ÜÈ°ä€¬€ÄØ°€ÈàÀ°€ÈÔ°=1=IL¹¥Ù½Éä°ì™½¹Ðè€‘¥ÍÁ±…äœ°¡•¥¡Ðè€ÌÐô¤ì4(€ô¤ì4(4(€…‘‘I•Ð¡‰½…É°€5½‰¥±”€¼]½É¬œ°€À°€ÄÐÄÀ°€ÌäÀ°€ÈÀÐÀ°=1=IL¹¥Ù½Éä°€ÈÐ¤ì4(€…‘‘å•‰É½Ü¡‰½…É°€œÀÈ€¼M•±•Ñ•‘¥É•Ñ¥½¹Ìœ°€ÈÀ°€ÄÔÄÀ°€ÈÜÀ°ÑÉÕ”¤ì4(€…‘‘Q•áÐ¡‰½…É°€5½‰¥±”€¼]½É¬¡•…‘¥¹œœ°€Q¡É•”Ý…åÍq¹å½ÕÈÝ½É­q¹½Õ±½Ý¹q¹Ñ¡”É½½´¸œ°€ÈÀ°€ÄÔÜÀ°€ÌÔÀ°€ÔÄ°=1=IL¹É…Á¡¥Ñ”°ì™½¹Ðè€‘¥ÍÁ±…äœ°±¥¹•!•¥¡Ðè€À¸àØ°±¥¹•Ìè€Ðô¤ì4(€…‘‘Q•áÐ¡‰½…É°€5½‰¥±”€¼]½É¬¹½Ñ”œ°€=É¥¥¹…°½¹•ÁÐÁÉ½©•ÑÏŠQ¹½Ð±¥•¹Ð±…¥µÌ¸Ù•Éä•á…µÁ±”¥Ì±•…É±ä±…‰•±•¸œ°€ÈÀ°€ÄÜÜÔ°€ÌÔÀ°€ÄÌ°€œŒÔÔÔäØÄœ°ì±¥¹•!•¥¡Ðè€Ä¸ÐÔ°±¥¹•Ìè€Ðô¤ì4(€½¹ÍÐµ½‰¥±•½¹•ÁÑÌ€ôl4(€€€lY½Ü€˜1¥¡Ðœ°€%Q=I%0]%9A!=Q=IA!dœ°€œŒÑÐÀÌàt°4(€€€l9½ÉÑ¡±¥¹”A½ÉÑÉ…¥ÑÌœ°€	=1A=IQI%PMQU%<œ°€œŒÄÜÉØÐt°4(€€€l¥•±‘Ý½É¬½µµ•É¥…°œ°€=55I%0A!=Q=IA!dœ°€œŒÙÙÜàt°4(€tì4(€µ½‰¥±•½¹•ÁÑÌ¹™½É…  ¡¥Ñ•´°¥¹‘•à¤€ôøì4(€€€½¹ÍÐä€ô€ÄäÌÀ€¬¥¹‘•à€¨€ÐàÀì4(€€€…‘‘1¥¹”¡‰½…É°5½‰¥±”€¼]½É¬€¼€‘í¥Ñ•µlÁuô€¼¥Ù¥‘•É€°€ÈÀ°ä°€ÌÔÀ°€œŒÕØÀØàœ°€À¸ÈÔ¤ì4(€€€…‘‘Q•áÐ¡‰½…É°5½‰¥±”€¼]½É¬€¼€‘í¥Ñ•µlÁuô€¼%¹‘•á€°€À‘í¥¹‘•à€¬€Åõ€°€ÈÀ°ä€¬€ÈÔ°€ÔÀ°€ÄÀ°€œŒÕØÄØäœ°ì¡•¥¡Ðè€Äàô¤ì4(€€€…‘‘Q•áÐ¡‰½…É°5½‰¥±”€¼]½É¬€¼€‘í¥Ñ•µlÁuô€¼1…‰•±€°€=9APAI=)Pœ°€ÈÈÀ°ä€¬€Äà°€ÄÔÀ°€ÄÀ°=1=IL¹É…Á¡¥Ñ”°ìÝ•¥¡Ðè€ÜÔÀ°…±¥¸è€É¥¡Ðœ°±•ÑÑ•ÉMÁ…¥¹œè€À¸Ü°¡•¥¡Ðè€Äàô¤ì4(€€€…‘‘Q•áÐ¡‰½…É°5½‰¥±”€¼]½É¬€¼€‘í¥Ñ•µlÁuô€¼½ÕÍ€°¥Ñ•µlÅt°€ÈÀ°ä€¬€ÜÀ°€ÌÔÀ°€ÄÀ°€œŒÕØÄØäœ°ìÝ•¥¡Ðè€ÜÔÀ°±•ÑÑ•ÉMÁ…¥¹œè€À¸Ø°¡•¥¡Ðè€Äàô¤ì4(€€€…‘‘Q•áÐ¡‰½…É°5½‰¥±”€¼]½É¬€¼€‘í¥Ñ•µlÁuô€¼Q¥Ñ±•€°¥Ñ•µlÁt°€ÈÀ°ä€¬€ÄÀÐ°€ÌÔÀ°€ÐÈ°=1=IL¹É…Á¡¥Ñ”°ì™½¹Ðè€‘¥ÍÁ±…äœ°±¥¹•!•¥¡Ðè€À¸ä°±¥¹•Ìè€Èô¤ì4(€€€…‘‘	É½ÝÍ•È¡‰½…É°5½‰¥±”€¼]½É¬€¼€‘í¥Ñ•µlÁuô€¼	É½ÝÍ•É€°€ÈÀ°ä€¬€ÄäÀ°€ÌÔÀ°€ÈÔÀ°¥Ñ•µlÉt°¥Ñ•µlÁt¤ì4(€ô¤ì4(4(€…‘‘I•Ð¡‰½…É°€5½‰¥±”€¼AÉ½•ÍÌœ°€À°€ÌÐÔÀ°€ÌäÀ°€ÄÄÀÀ°=1=IL¹É…Á¡¥Ñ”¤ì4(€…‘‘å•‰É½Ü¡‰½…É°€œÀÌ€¼Q¡”ÁÉ½•ÍÌœ°€ÈÀ°€ÌÔÐÀ°€ÈÈÀ¤ì4(€…‘‘Q•áÐ¡‰½…É°€5½‰¥±”€¼AÉ½•ÍÌ¡•…‘¥¹œœ°€±•…ÈÁ…Ñ¡q¹™É½´¹••Ñ¼±¥Ù”¸œ°€ÈÀ°€ÌÔäÔ°€ÌÔÀ°€Ðà°=1=IL¹¥Ù½Éä°ì™½¹Ðè€‘¥ÍÁ±…äœ°±¥¹•!•¥¡Ðè€À¸àØ°±¥¹•Ìè€Èô¤ì4(€lMÑ…ÉÐÝ¥Ñ „½¹Ù•ÉÍ…Ñ¥½¸œ°€M¡…Á”Ñ¡”‘¥É•Ñ¥½¸œ°€I•Ù¥•ÜÑ¡”‰Õ¥±œ°€1…Õ¹ Ý¥Ñ¡½ÕÐÑ¡”¡•…‘…¡”t¹™½É…  ¡¥Ñ•´°¥¹‘•à¤€ôøì4(€€€½¹ÍÐä€ô€ÌÜÜÀ€¬¥¹‘•à€¨€ÄØÔì4(€€€…‘‘1¥¹”¡‰½…É°5½‰¥±”€¼AÉ½•ÍÌ€¼€‘í¥Ñ•µô€¼¥Ù¥‘•É€°€ÈÀ°ä°€ÌÔÀ°=1=IL¹Í¥±Ù•È°€À¸ÈÈ¤ì4(€€€…‘‘Q•áÐ¡‰½…É°5½‰¥±”€¼AÉ½•ÍÌ€¼€‘í¥Ñ•µô€¼%¹‘•á€°€À‘í¥¹‘•à€¬€Åõ€°€ÈÀ°ä€¬€Èà°€ÐÔ°€ÄÀ°=1=IL¹‰±Õ•1¥¡Ð°ì¡•¥¡Ðè€Äàô¤ì4(€€€…‘‘Q•áÐ¡‰½…É°5½‰¥±”€¼AÉ½•ÍÌ€¼€‘í¥Ñ•µõ€°¥Ñ•´°€ÜÈ°ä€¬€ÈÀ°€ÈäÀ°€ÈÜ°=1=IL¹¥Ù½Éä°ì™½¹Ðè€‘¥ÍÁ±…äœ°±¥¹•!•¥¡Ðè€À¸äÔ°±¥¹•Ìè€Èô¤ì4(€€€…‘‘Q•áÐ¡‰½…É°5½‰¥±”€¼AÉ½•ÍÌ€¼€‘í¥Ñ•µô€¼½Áå€°lQ•±°µ”Ý¡…Ðå½ÔÁ¡½Ñ½É…Á …¹Ý¡…Ðå½Ô¹••¸œ°€±¥¸½¸Á…•Ì°Á•ÉÍ½¹…±¥Ñä°…¹¥µ…•Ì¸œ°€M•”Ñ¡”Í¥Ñ”‰•™½É”±…Õ¹ ¸œ°€$ÁÕ‰±¥Í °¡½ÍÐ°…¹ÍÑ…ä…Ù…¥±…‰±”¸um¥¹‘•át°€ÜÈ°ä€¬€àÀ°€ÈàÔ°€ÄÈ°=1=IL¹Í¥±Ù•È°ì±¥¹•!•¥¡Ðè€Ä¸Ð°±¥¹•Ìè€Èô¤ì4(€ô¤ì4(4(€…‘‘I•Ð¡‰½…É°€5½‰¥±”€¼AÉ¥¥¹œœ°€À°€ÐÔÔÀ°€ÌäÀ°€ÄäÔÀ°=1=IL¹É…Á¡¥Ñ”È¤ì4(€…‘‘å•‰É½Ü¡‰½…É°€œÀÐ€¼5½¹Ñ¡±äÁ…­…•Ìœ°€ÈÀ°€ÐØÐÀ°€ÈÐÀ¤ì4(€…‘‘Q•áÐ¡‰½…É°€5½‰¥±”€¼AÉ¥¥¹œ¡•…‘¥¹œœ°€AÉ½™•ÍÍ¥½¹…±q¹ÁÉ•Í•¹”¸œ°€ÈÀ°€ÐÜÀÀ°€ÌÔÀ°€ÔÀ°=1=IL¹¥Ù½Éä°ì™½¹Ðè€‘¥ÍÁ±…äœ°±¥¹•!•¥¡Ðè€À¸àØ°±¥¹•Ìè€Èô¤ì4(€…‘‘Q•áÐ¡‰½…É°€5½‰¥±”€¼AÉ¥¥¹œ…•¹Ðœ°€!Õµ…¸µÍ¥é•‘q¹ÁÉ¥¥¹œ¸œ°€ÈÀ°€ÐàÀÀ°€ÌÔÀ°€ÔÀ°=1=IL¹‰±Õ•1¥¡Ð°ì™½¹Ðè€‘¥ÍÁ±…äœ°¥Ñ…±¥ŒèÑÉÕ”°±¥¹•!•¥¡Ðè€À¸àØ°±¥¹•Ìè€Èô¤ì4(€…‘‘Q•áÐ¡‰½…É°€5½‰¥±”€¼AÉ¥¥¹œ¹½Ñ”œ°€5½¹Ñ¡±ä½¹±ä¸9¼Í•Á…É…Ñ”‰Õ¥±™•”¸œ°€ÈÀ°€ÐäÄÔ°€ÌÔÀ°€ÄÌ°=1=IL¹Í¥±Ù•É1¥¡Ð°ì¡•¥¡Ðè€ÈÈô¤ì4(€…‘‘AÉ¥¥¹…É¡‰½…É°€ÈÀ°€ÐäàÔ°€ÌÔÀ°€ÍÍ•¹Ñ¥…°œ°€ÌÀ°™…±Í”¤ì4(€…‘‘AÉ¥¥¹…É¡‰½…É°€ÈÀ°€ÔÔàÀ°€ÌÔÀ°€MÑÕ‘¥¼œ°€ØÔ°ÑÉÕ”¤ì4(€…‘‘AÉ¥¥¹…É¡‰½…É°€ÈÀ°€ØÄÜÔ°€ÌÔÀ°€M¥¹…ÑÕÉ”œ°€ÄÀÀ°™…±Í”¤ì4(4(€…‘‘I•Ð¡‰½…É°€5½‰¥±”€¼M•ÉÙ¥•Ìœ°€À°€ØÔÀÀ°€ÌäÀ°€ÄÈÀÀ°=1=IL¹¥Ù½Éä¤ì4(€…‘‘å•‰É½Ü¡‰½…É°€œÀÔ€¼Ù•ÉåÑ¡¥¹œ¡…¹‘±•œ°€ÈÀ°€ØÔäÀ°€ÈØÀ°ÑÉÕ”¤ì4(€…‘‘Q•áÐ¡‰½…É°€5½‰¥±”€¼M•ÉÙ¥•Ì¡•…‘¥¹œœ°€e½ÕÈÝ•‰Í¥Ñ”Í¡½Õ±‘q¹É•…Ñ”µ½µ•¹ÑÕ´±q¹¹½Ð…¹½Ñ¡•È©½ˆ¸œ°€ÈÀ°€ØØÔÀ°€ÌÔÀ°€ÐØ°=1=IL¹É…Á¡¥Ñ”°ì™½¹Ðè€‘¥ÍÁ±…äœ°±¥¹•!•¥¡Ðè€À¸àà°±¥¹•Ìè€Ìô¤ì4(€l•Í¥¹•…É½Õ¹å½ÕÈÝ½É¬œ°€!½ÍÑ•…¹µ…¥¹Ñ…¥¹•œ°€É•…°Á•ÉÍ½¸Ñ¼½¹Ñ…Ðt¹™½É…  ¡¥Ñ•´°¥¹‘•à¤€ôøì4(€€€½¹ÍÐä€ô€ØàØÀ€¬¥¹‘•à€¨€ÄäÀì4(€€€…‘‘1¥¹”¡‰½…É°5½‰¥±”€¼M•ÉÙ¥•Ì€¼€‘í¥Ñ•µô€¼¥Ù¥‘•É€°€ÈÀ°ä°€ÌÔÀ°€œŒÕØÀØàœ°€À¸ÈÔ¤ì4(€€€…‘‘Q•áÐ¡‰½…É°5½‰¥±”€¼M•ÉÙ¥•Ì€¼€‘í¥Ñ•µô€¼%¹‘•á€°€À‘í¥¹‘•à€¬€Åõ€°€ÈÀ°ä€¬€Èà°€ÐÔ°€ÄÀ°=1=IL¹‰±Õ•…É¬°ì¡•¥¡Ðè€Äàô¤ì4(€€€…‘‘Q•áÐ¡‰½…É°5½‰¥±”€¼M•ÉÙ¥•Ì€¼€‘í¥Ñ•µõ€°¥Ñ•´°€ÜÈ°ä€¬€Äà°€ÈàÔ°€ÌÀ°=1=IL¹É…Á¡¥Ñ”°ì™½¹Ðè€‘¥ÍÁ±…äœ°±¥¹•!•¥¡Ðè€À¸äÔ°±¥¹•Ìè€Èô¤ì4(€€€…‘‘Q•áÐ¡‰½…É°5½‰¥±”€¼M•ÉÙ¥•Ì€¼€‘í¥Ñ•µô€¼½Áå€°l1…å½ÕÐÍ¡…Á•…É½Õ¹å½ÕÈ¥µ…•Ì…¹…Õ‘¥•¹”¸œ°€1…Õ¹ …¹É½ÕÑ¥¹”Ñ•¡¹¥…°…É”ÍÑ…ä¡…¹‘±•¸œ°€Q…±¬‘¥É•Ñ±äÝ¥Ñ 1•½¸Ý¡•¸å½Ô¹••…¸ÕÁ‘…Ñ”¸um¥¹‘•át°€ÜÈ°ä€¬€äÀ°€ÈàÀ°€ÄÈ°€œŒÔÔÔäØÄœ°ì±¥¹•!•¥¡Ðè€Ä¸Ð°±¥¹•Ìè€Ìô¤ì4(€ô¤ì4(4(€…‘‘I•Ð¡‰½…É°€5½‰¥±”€¼A…åµ•¹ÑÌœ°€ÈÀ°€ÜÄØÀ°€ÌÔÀ°€ÐàÀ°=1=IL¹‰±Õ”°€Äà¤ì4(€…‘‘å•‰É½Ü¡‰½…É°€=ÁÑ¥½¹…°É½ÝÑ Á…Ñ œ°€ÐÐ°€ÜÈÀÀ°€ÈØÀ°™…±Í”¤ì4(€…‘‘Q•áÐ¡‰½…É°€5½‰¥±”€¼A…åµ•¹ÑÌÑ¥Ñ±”œ°€9••‘•Á½Í¥ÑÌ½È±¥•¹ÐÁ…åµ•¹ÑÌ±…Ñ•Èüœ°€ÐÐ°€ÜÈØÀ°€ÌÀÀ°€ÌÜ°=1=IL¹É…Á¡¥Ñ”°ì™½¹Ðè€‘¥ÍÁ±…äœ°±¥¹•!•¥¡Ðè€À¸ä°±¥¹•Ìè€Ìô¤ì4(€…‘‘Q•áÐ¡‰½…É°€5½‰¥±”€¼A…åµ•¹ÑÌ½Áäœ°€]”…¸Á±…¸„Á…åµ•¹ÐµÉ•…‘ä•áÁ•É¥•¹”…É•™Õ±±ä¸9¼±¥Ù”Á…å½ÕÐ™•…ÑÕÉ”¥ÌÁÉ½µ¥Í•Õ¹Ñ¥°Ñ•ÍÑ•¸œ°€ÐÐ°€ÜÌäÔ°€ÌÀÀ°€ÄÈ°=1=IL¹É…Á¡¥Ñ”°ì±¥¹•!•¥¡Ðè€Ä¸ÐÔ°±¥¹•Ìè€Ðô¤ì4(4(€…‘‘I•Ð¡‰½…É°€5½‰¥±”€¼½Õ¹‘•Èœ°€À°€ÜÜÀÀ°€ÌäÀ°€ÄÄàÀ°=1=IL¹É…Á¡¥Ñ”¤ì4(€…‘‘±±¥ÁÍ”¡‰½…É°€5½‰¥±”€¼½Õ¹‘•È½É‰¥Ðœ°€ÔÔ°€ÜÜäÀ°€ÈàÀ°€ÈàÀ°=1=IL¹‰±Õ”°€À¸Àà¤ì4(€…‘‘Q•áÐ¡‰½…É°€5½‰¥±”€¼½Õ¹‘•ÈÍ¥¹…ÑÕÉ”œ°€M¥Ñ•Íq¹	åq¹1•½¸œ°€àÔ°€ÜàÐÔ°€ÈÈÀ°€ÜÀ°=1=IL¹¥Ù½Éä°ì™½¹Ðè€Í¥¹…ÑÕÉ”œ°…±¥¸è€•¹Ñ•Èœ°±¥¹•!•¥¡Ðè€À¸ÔØ°±¥¹•Ìè€Ìô¤ì4(€…‘‘å•‰É½Ü¡‰½…É°€œÀØ€¼Q¡”Á•ÉÍ½¸‰•¡¥¹¥Ðœ°€ÈÀ°€àÄÜÀ°€ÈàÀ¤ì4(€…‘‘Q•áÐ¡‰½…É°€5½‰¥±”€¼½Õ¹‘•È¡•…‘¥¹œœ°€Mµ…±°ÍÑÕ‘¥¼¹q¹¥É•ÐÉ•±…Ñ¥½¹Í¡¥À¸œ°€ÈÀ°€àÈÌÀ°€ÌÔÀ°€Ðà°=1=IL¹¥Ù½Éä°ì™½¹Ðè€‘¥ÍÁ±…äœ°±¥¹•!•¥¡Ðè€À¸àØ°±¥¹•Ìè€Èô¤ì4(€…‘‘Q•áÐ¡‰½…É°€5½‰¥±”€¼½Õ¹‘•È½Áäœ°€'Še´1•½¸¸$‘•Í¥¸…¹¡½ÍÐÝ•‰Í¥Ñ•Ì™½ÈÁ¡½Ñ½É…Á¡•ÉÌÝ¡¼Ý…¹ÐÑ¡•¥È½¹±¥¹”ÁÉ•Í•¹”¡…¹‘±•Ý¥Ñ¡½ÕÐ…¹½Ñ¡•È™Õ±°µÑ¥µ”©½ˆ¸œ°€ÈÀ°€àÌÜÀ°€ÌÔÀ°€ÄÐ°=1=IL¹Í¥±Ù•É1¥¡Ð°ì±¥¹•!•¥¡Ðè€Ä¸Ô°±¥¹•Ìè€Ôô¤ì4(€…‘‘Q•áÐ¡‰½…É°€5½‰¥±”€¼½Õ¹‘•È±¥¹¬œ°€MQIP=9YIMQ%=8€ƒŠ\œ°€ÈÀ°€àÔÈÔ°€ÌÀÀ°€ÄÄ°=1=IL¹¥Ù½Éä°ìÝ•¥¡Ðè€ÜÔÀ°±•ÑÑ•ÉMÁ…¥¹œè€Ä°¡•¥¡Ðè€Äàô¤ì4(4(€…‘‘I•Ð¡‰½…É°€5½‰¥±”€¼½¹Ñ…Ðœ°€À°€àààÀ°€ÌäÀ°€ÄÔÜÀ°=1=IL¹‰±Õ”¤ì4(€…‘‘å•‰É½Ü¡‰½…É°€œÀÜ€¼½¹Ñ…Ðœ°€ÈÀ°€àäÜÀ°€ÄàÀ°™…±Í”¤ì4(€…‘‘Q•áÐ¡‰½…É°€5½‰¥±”€¼½¹Ñ…Ð¡•…‘¥¹œœ°€1•ÓŠeÌµ…­•q¹å½ÕÈÝ½É­q¹™••°¥µÁ½ÍÍ¥‰±•q¹Ñ¼½Ù•É±½½¬¸œ°€ÈÀ°€äÀÌÀ°€ÌÔÀ°€ÔÄ°=1=IL¹É…Á¡¥Ñ”°ì™½¹Ðè€‘¥ÍÁ±…äœ°¥Ñ…±¥ŒèÑÉÕ”°±¥¹•!•¥¡Ðè€À¸àÐ°±¥¹•Ìè€Ðô¤ì4(€…‘‘Q•áÐ¡‰½…É°€5½‰¥±”€¼½¹Ñ…Ð½Áäœ°€Q•±°µ”Ý¡…Ðå½ÔÁ¡½Ñ½É…Á …¹Ý¡…Ðå½ÔÝ…¹Ðå½ÕÈ¹•áÐÍ¥Ñ”Ñ¼‘¼¸œ°€ÈÀ°€äÈÐÔ°€ÌÔÀ°€ÄÐ°=1=IL¹É…Á¡¥Ñ”°ì±¥¹•!•¥¡Ðè€Ä¸Ô°±¥¹•Ìè€Ìô¤ì4(€…‘‘Q•áÐ¡‰½…É°€5½‰¥±”€¼½¹Ñ…Ð•µ…¥°±…‰•°œ°€AIH%IP5%0üœ°€ÈÀ°€äÌàÀ°€ÈàÀ°€ÄÀ°=1=IL¹É…Á¡¥Ñ”°ìÝ•¥¡Ðè€ÜÔÀ°±•ÑÑ•ÉMÁ…¥¹œè€À¸à°¡•¥¡Ðè€Äàô¤ì4(€…‘‘Q•áÐ¡‰½…É°€5½‰¥±”€¼½¹Ñ…Ð•µ…¥°œ°€Í¥Ñ•Ì¹‰ä¹±•½¹µ…¥°¹½´œ°€ÈÀ°€äÐÈÀ°€ÌÔÀ°€ÈÜ°=1=IL¹É…Á¡¥Ñ”°ì™½¹Ðè€‘¥ÍÁ±…äœ°Ý•¥¡Ðè€ØÀÀ°¡•¥¡Ðè€Ìàô¤ì4(€…‘‘I•Ð¡‰½…É°€5½‰¥±”€¼½¹Ñ…Ð™½É´œ°€ÈÀ°€äÔÄÀ°€ÌÔÀ°€ÜàÀ°=1=IL¹¥Ù½Éä°€Äà¤ì4(€l95œ°€5%0œ°€]!P<e=TA!=Q=IA üœ°€]!PIe=T1==-%9=Hüt¹™½É…  ¡±…‰•°°¥¹‘•à¤€ôøì4(€€€½¹ÍÐä€ô€äÔØÀ€¬¥¹‘•à€¨€ÄÌÔì4(€€€…‘‘Q•áÐ¡‰½…É°5½‰¥±”€¼½¹Ñ…Ð€¼€‘í±…‰•±õ€°±…‰•°°€ÐÐ°ä°€ÌÀÀ°€ÄÀ°=1=IL¹É…Á¡¥Ñ”°ìÝ•¥¡Ðè€ÜÔÀ°±•ÑÑ•ÉMÁ…¥¹œè€À¸Ü°¡•¥¡Ðè€Äàô¤ì4(€€€…‘‘1¥¹”¡‰½…É°5½‰¥±”€¼½¹Ñ…Ð€¼€‘í±…‰•±ô€¼1¥¹•€°€ÐÐ°ä€¬€¡¥¹‘•à€ôôô€Ì€ü€ÄÀÀ€è€ÔÈ¤°€ÌÀÀ°=1=IL¹É…Á¡¥Ñ”°€À¸Èà¤ì4(€ô¤ì4(€…‘‘	ÕÑÑ½¸¡‰½…É°€5½‰¥±”€¼½¹Ñ…ÐÍÕ‰µ¥Ðœ°€M•¹¥¹ÅÕ¥Éäœ°€ÐÐ°€ÄÀÄàÀ°€ÌÀÈ°=1=IL¹É…Á¡¥Ñ”°=1=IL¹¥Ù½Éä¤ì4(4(€…‘‘I•Ð¡‰½…É°€5½‰¥±”€¼½½Ñ•Èœ°€À°€ÄÀÐÔÀ°€ÌäÀ°€ÌÀÀ°=1=IL¹É…Á¡¥Ñ”¤ì4(€…‘‘Q•áÐ¡‰½…É°€5½‰¥±”€¼½½Ñ•È‰É…¹œ°€M¥Ñ•Íq¹	åq¹1•½¸œ°€ÈÀ°€ÄÀÔÀÀ°€ÄÀÀ°€Èà°=1=IL¹¥Ù½Éä°ì™½¹Ðè€Í¥¹…ÑÕÉ”œ°…±¥¸è€•¹Ñ•Èœ°±¥¹•!•¥¡Ðè€À¸Ôà°±¥¹•Ìè€Ìô¤ì4(€…‘‘Q•áÐ¡‰½…É°€5½‰¥±”€¼½½Ñ•È½Áäœ°€]•‰Í¥Ñ•Ì…¹µ…¹…•¡½ÍÑ¥¹œ™½ÈÁ¡½Ñ½É…Á¡•ÉÌ¸œ°€ÄÔÀ°€ÄÀÔÄÀ°€ÈÄÀ°€ÄÈ°=1=IL¹Í¥±Ù•È°ì±¥¹•!•¥¡Ðè€Ä¸Ð°±¥¹•Ìè€Ìô¤ì4(€…‘‘Q•áÐ¡‰½…É°€5½‰¥±”€¼½½Ñ•È•µ…¥°œ°€Í¥Ñ•Ì¹‰ä¹±•½¹µ…¥°¹½´œ°€ÈÀ°€ÄÀØÌÀ°€ÌÔÀ°€Äà°=1=IL¹¥Ù½Éä°ì™½¹Ðè€‘¥ÍÁ±…äœ°¡•¥¡Ðè€Èàô¤ì4(€É•ÑÕÉ¸‰½…Éì4)ô4(4)™Õ¹Ñ¥½¸‰Õ¥±‘½µÁ½¹•¹ÑÌ¡Á…”¤ì4(€½¹ÍÐ‰½…É€ôÁ•¹Á½Ð¹É•…Ñ•	½…É ¤ì4(€‰½…É¹¹…µ”€ô€½µÁ½¹•¹ÑÌ€¼½É”œì4(€‰½…É¹à€ô€ÈÈÀÀì4(€‰½…É¹ä€ô€Àì4(€‰½…É¹É•Í¥é” äÈÀ°€ÄÈàÀ¤ì4(€‰½…É¹™¥±±Ì€ômì™¥±±½±½Èè=1=IL¹¥Ù½Éä°™¥±±=Á…¥Ñäè€Äõtì4(€‰½…É¹±¥Á½¹Ñ•¹Ð€ôÑÉÕ”ì4(€Á…”¹É½½Ð¹…ÁÁ•¹‘¡¥±¡‰½…É¤ì4(€…‘‘Q•áÐ¡‰½…É°€½µÁ½¹•¹ÑÌ€¼Q¥Ñ±”œ°€Í¥Ñ•Ì¹‰ä¹±•½¸€¼½É”½µÁ½¹•¹ÑÌœ°€Ðà°€Ðà°€àÈÀ°€ÔÐ°=1=IL¹É…Á¡¥Ñ”°ì™½¹Ðè€‘¥ÍÁ±…äœ°¡•¥¡Ðè€ÜÀô¤ì4(€…‘‘Q•áÐ¡‰½…É°€½µÁ½¹•¹ÑÌ€¼Q½­•¸¹½Ñ”œ°€É…Á¡¥Ñ”ƒ
Ü]…É´¥Ù½Éäƒ
ÜM¥±Ù•Èƒ
Ü±•ÑÉ¥Œ‰±Õ”€¼½Éµ½É…¹Ðƒ
Ü5…¹É½Á”ƒ
Ü±±ÕÉ„œ°€Ðà°€ÄÈÀ°€àÈÀ°€ÄÌ°€œŒÔÔÔäØÄœ°ì¡•¥¡Ðè€ÈÈô¤ì4(€…‘‘1¥¹”¡‰½…É°€½µÁ½¹•¹ÑÌ€¼!•…‘•È‘¥Ù¥‘•Èœ°€Ðà°€ÄØÔ°€àÈÐ°€œŒÕØÀØàœ°€À¸ÈÔ¤ì4(€…‘‘Q•áÐ¡‰½…É°€½µÁ½¹•¹ÑÌ€¼	É…¹µ…É¬±…‰•°œ°€	I95I,œ°€Ðà°€ÈÄÀ°€ÄØÀ°€ÄÄ°=1=IL¹‰±Õ•…É¬°ìÝ•¥¡Ðè€ÜÔÀ°±•ÑÑ•ÉMÁ…¥¹œè€Ä°¡•¥¡Ðè€Äàô¤ì4(€½¹ÍÐ‰É…¹‘A±…Ñ”€ô…‘‘I•Ð¡‰½…É°€½µÁ½¹•¹Ð€¼	É…¹5…É¬œ°€Ðà°€ÈÔÀ°€ÌÀÀ°€ÈÔÀ°=1=IL¹É…Á¡¥Ñ”°€Äà¤ì4(€…‘‘Q•áÐ¡‰½…É°€½µÁ½¹•¹Ð€¼	É…¹5…É¬€¼Q•áÐœ°€M¥Ñ•Íq¹	åq¹1•½¸œ°€äÀ°€ÈäÀ°€ÈÄÔ°€Øà°=1=IL¹¥Ù½Éä°ì™½¹Ðè€Í¥¹…ÑÕÉ”œ°…±¥¸è€•¹Ñ•Èœ°±¥¹•!•¥¡Ðè€À¸ÔØ°±¥¹•Ìè€Ìô¤ì4(€…‘‘Q•áÐ¡‰½…É°€½µÁ½¹•¹ÑÌ€¼	ÕÑÑ½¹Ì±…‰•°œ°€	UQQ=9Lœ°€ÐÄÀ°€ÈÄÀ°€ÄØÀ°€ÄÄ°=1=IL¹‰±Õ•…É¬°ìÝ•¥¡Ðè€ÜÔÀ°±•ÑÑ•ÉMÁ…¥¹œè€Ä°¡•¥¡Ðè€Äàô¤ì4(€½¹ÍÐÁÉ¥µ…Éå	ÕÑÑ½¸€ô…‘‘	ÕÑÑ½¸¡‰½…É°€½µÁ½¹•¹Ð€¼	ÕÑÑ½¸€¼AÉ¥µ…Éäœ°€½¹Ñ…Ðœ°€ÐÄÀ°€ÈÔÀ°€ÄàÀ°=1=IL¹‰±Õ”°=1=IL¹É…Á¡¥Ñ”¤ì4(€½¹ÍÐ‘…É­	ÕÑÑ½¸€ô…‘‘	ÕÑÑ½¸¡‰½…É°€½µÁ½¹•¹Ð€¼	ÕÑÑ½¸€¼%¹¬œ°€M•¹¥¹ÅÕ¥Éäœ°€ØÄÀ°€ÈÔÀ°€ÈÄÀ°=1=IL¹É…Á¡¥Ñ”°=1=IL¹¥Ù½Éä¤ì4(€…‘‘Q•áÐ¡‰½…É°€½µÁ½¹•¹ÑÌ€¼1…‰•°±…‰•°œ°€=9AP1	0œ°€ÐÄÀ°€ÌÔÀ°€ÈÀÀ°€ÄÄ°=1=IL¹‰±Õ•…É¬°ìÝ•¥¡Ðè€ÜÔÀ°±•ÑÑ•ÉMÁ…¥¹œè€Ä°¡•¥¡Ðè€Äàô¤ì4(€½¹ÍÐ½¹•ÁÑ1…‰•°€ô…‘‘I•Ð¡‰½…É°€½µÁ½¹•¹Ð€¼½¹•ÁÐ1…‰•°œ°€ÐÄÀ°€ÌäÀ°€ÄàÀ°€ÐÈ°=1=IL¹¥Ù½Éä°€ÈÄ¤ì4(€…‘‘Q•áÐ¡‰½…É°€½µÁ½¹•¹Ð€¼½¹•ÁÐ1…‰•°€¼Q•áÐœ°€=9APAI=)Pœ°€ÐÈÔ°€ÐÀÈ°€ÄÔÀ°€ÄÀ°=1=IL¹É…Á¡¥Ñ”°ìÝ•¥¡Ðè€ÜÔÀ°…±¥¸è€•¹Ñ•Èœ°±•ÑÑ•ÉMÁ…¥¹œè€À¸Ü°¡•¥¡Ðè€Äàô¤ì4(€…‘‘Q•áÐ¡‰½…É°€½µÁ½¹•¹ÑÌ€¼	É½ÝÍ•È±…‰•°œ°€	I=]MH5=-U@œ°€Ðà°€ÔØÀ°€ÈÈÀ°€ÄÄ°=1=IL¹‰±Õ•…É¬°ìÝ•¥¡Ðè€ÜÔÀ°±•ÑÑ•ÉMÁ…¥¹œè€Ä°¡•¥¡Ðè€Äàô¤ì4(€…‘‘	É½ÝÍ•È¡‰½…É°€½µÁ½¹•¹Ð€¼	É½ÝÍ•È5½­ÕÀœ°€Ðà°€ØÀÀ°€ÔÈÀ°€ÐÌÀ°€œŒÑÐÀÌàœ°€Y½Ü€˜1¥¡Ðœ¤ì4(€…‘‘Q•áÐ¡‰½…É°€½µÁ½¹•¹ÑÌ€¼AÉ¥”±…‰•°œ°€AI%%9Iœ°€ØÈÀ°€ÔØÀ°€ÄàÀ°€ÄÄ°=1=IL¹‰±Õ•…É¬°ìÝ•¥¡Ðè€ÜÔÀ°±•ÑÑ•ÉMÁ…¥¹œè€Ä°¡•¥¡Ðè€Äàô¤ì4(€…‘‘AÉ¥¥¹…É¡‰½…É°€ØÈÀ°€ØÀÀ°€ÈÔÈ°€MÑÕ‘¥¼œ°€ØÔ°ÑÉÕ”¤ì4(€ÑÉäì4(€€€½¹ÍÐ±¥‰É…Éä€ôÁ•¹Á½Ð¹±¥‰É…Éä¹±½…°ì4(€€€¥˜€ …±¥‰É…Éä¹½µÁ½¹•¹ÑÌ¹™¥¹ ¡½µÁ½¹•¹Ð¤€ôø½µÁ½¹•¹Ð¹¹…µ”€ôôô€	É…¹5…É¬œ¤¤±¥‰É…Éä¹É•…Ñ•½µÁ½¹•¹Ð¡m‰É…¹‘A±…Ñ•t¤¹¹…µ”€ô€	É…¹5…É¬œì4(€€€¥˜€ …±¥‰É…Éä¹½µÁ½¹•¹ÑÌ¹™¥¹ ¡½µÁ½¹•¹Ð¤€ôø½µÁ½¹•¹Ð¹¹…µ”€ôôô€	ÕÑÑ½¸€¼AÉ¥µ…Éäœ¤¤±¥‰É…Éä¹É•…Ñ•½µÁ½¹•¹Ð¡mÁÉ¥µ…Éå	ÕÑÑ½¹t¤¹¹…µ”€ô€	ÕÑÑ½¸€¼AÉ¥µ…Éäœì4(€€€¥˜€ …±¥‰É…Éä¹½µÁ½¹•¹ÑÌ¹™¥¹ ¡½µÁ½¹•¹Ð¤€ôø½µÁ½¹•¹Ð¹¹…µ”€ôôô€	ÕÑÑ½¸€¼%¹¬œ¤¤±¥‰É…Éä¹É•…Ñ•½µÁ½¹•¹Ð¡m‘…É­	ÕÑÑ½¹t¤¹¹…µ”€ô€	ÕÑÑ½¸€¼%¹¬œì4(€€€¥˜€ …±¥‰É…Éä¹½µÁ½¹•¹ÑÌ¹™¥¹ ¡½µÁ½¹•¹Ð¤€ôø½µÁ½¹•¹Ð¹¹…µ”€ôôô€½¹•ÁÐ1…‰•°œ¤¤±¥‰É…Éä¹É•…Ñ•½µÁ½¹•¹Ð¡m½¹•ÁÑ1…‰•±t¤¹¹…µ”€ô€½¹•ÁÐ1…‰•°œì4(€ô…Ñ €¡•ÉÉ½È¤ì4(€€€€¼¼Q¡”Ù¥ÍÕ…°½µÁ½¹•¹Ð‰½…ÉÉ•µ…¥¹Ì½µÁ±•Ñ”•Ù•¸¥˜„±¥‰É…Éä½Á•É…Ñ¥½¸¥ÌÕ¹…Ù…¥±…‰±”¸4(€ô4(€É•ÑÕÉ¸‰½…Éì4)ô4(4)½¹ÍÐÁ…”€ôÁ•¹Á½Ð¹ÕÉÉ•¹ÑA…”ì4)½¹ÍÐ™¥±”€ôÁ•¹Á½Ð¹ÕÉÉ•¹Ñ¥±”ì4)¥˜€ …Á…”ñð€…™¥±”¤Ñ¡É½Ü¹•ÜÉÉ½È =Á•¸„A•¹Á½Ð‘•Í¥¸™¥±”‰•™½É”ÉÕ¹¹¥¹œÑ¡”‰Õ¥±‘•È¸œ¤ì4(4)Á…”¹¹…µ”€ô€!½µ•Á…”œì4)É•…Ñ•Q½­•¹Ì ¤ì4(4)½¹ÍÐ•á¥ÍÑ¥¹œ€ôÁ…”¹™¥¹‘M¡…Á•Ì¡ìÑåÁ”è€‰½…Éœô¤¹™¥±Ñ•È ¡Í¡…Á”¤€ôø4(€l!½µ•Á…”€¼•Í­Ñ½À€¼€ÄÐÐÀœ°€!½µ•Á…”€¼5½‰¥±”€¼€ÌäÀœ°€½µÁ½¹•¹ÑÌ€¼½É”t¹¥¹±Õ‘•Ì¡Í¡…Á”¹¹…µ”¤°4(¤ì4)•á¥ÍÑ¥¹œ¹™½É…  ¡Í¡…Á”¤€ôøÍ¡…Á”¹É•µ½Ù” ¤¤ì4(4)½¹ÍÐ‘•Í­Ñ½À€ô‰Õ¥±‘•Í­Ñ½À¡Á…”¤ì4)½¹ÍÐµ½‰¥±”€ô‰Õ¥±‘5½‰¥±”¡Á…”¤ì4)½¹ÍÐ½µÁ½¹•¹ÑÌ€ô‰Õ¥±‘½µÁ½¹•¹ÑÌ¡Á…”¤ì4(4)ÍÑ½É…”¹Í¥Ñ•Í	å1•½¹	½…É‘Ì€ôì‘•Í­Ñ½Àè‘•Í­Ñ½À¹¥°µ½‰¥±”èµ½‰¥±”¹¥°½µÁ½¹•¹ÑÌè½µÁ½¹•¹ÑÌ¹¥ôì4)Á•¹Á½Ð¹Ù¥•ÝÁ½ÉÐ¹é½½µQ½¥Ñ±° ¤ì4(4)É•ÑÕÉ¸ì4(€™¥±”è™¥±”¹¹…µ”°4(€Á…”èÁ…”¹¹…µ”°4(€‰½…É‘ÌèÍÑ½É…”¹Í¥Ñ•Í	å1•½¹	½…É‘Ì°4(€Ñ½­•¹ÌèÁ•¹Á½ÑUÑ¥±Ì¹Ñ½­•¹=Ù•ÉÙ¥•Ü ¤°4(€Ù…±¥‘…Ñ¥½¸è™¥±”¹Ù…±¥‘…Ñ” ¤¹µ…À ¡•ÉÉ½È¤€ôøMÑÉ¥¹œ¡•ÉÉ½È¤¤°4)ôì4