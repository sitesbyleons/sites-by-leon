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
    addText(parent, `Pricing / ${name} / Feature ${index + 1}`, `↳  ${item}`, x + 28, y + 342 + index * 48, width - 56, 12, ink, { weight: 600, height: 20 });
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
  addEyebrow(board, 'Web design  •  Managed hosting', 72, 190, 520);
  addText(board, 'Hero / Heading', 'Websites for\nphotographers,', 72, 245, 700, 116, COLORS.ivory, { font: 'display', lineHeight: 0.78, lines: 2 });
  addText(board, 'Hero / Heading accent', 'without the\nwebsite headache.', 126, 435, 650, 102, COLORS.blueLight, { font: 'display', italic: true, lineHeight: 0.82, lines: 2 });
  addText(board, 'Hero / Description', 'A cinematic home for your work—designed, launched, hosted,\nand cared for by one person you can actually reach.', 72, 675, 610, 18, COLORS.silverLight, { lineHeight: 1.45, lines: 2 });
  addButton(board, 'Hero / Contact', 'Contact', 72, 770, 136, COLORS.blue, COLORS.graphite);
  addText(board, 'Hero / Email', 'sites.by.leon@gmail.com  ↗', 238, 786, 340, 14, COLORS.ivory, { weight: 700, height: 24 });
  addLine(board, 'Hero / Fact divider', 72, 865, 620, COLORS.silver, 0.28);
  addText(board, 'Hero / Facts', 'MONTHLY ONLY    /    $25–$40    /    DOMAIN + PAYMENTS', 72, 890, 610, 11, COLORS.silver, { letterSpacing: 0.8, height: 20 });
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
  addText(board, 'Work / Honesty note', 'Original concept projects—not client claims—built to show how different\nphotography businesses can feel completely their own.', 350, 1740, 710, 16, '#4E5158', { lineHeight: 1.5, lines: 2 });
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
  addText(board, 'Process / Heading', 'A clear path from “I need a site” to live.', 350, 3585, 780, 76, COLORS.ivory, { font: 'display', lineHeight: 0.9, lines: 2 });
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
  const serviceItems = [
    ['Designed around your work', 'Every layout is shaped around your images, voice, audience, and focus.'],
    ['Hosted and maintained', 'Launch, routine technical care, and dependable hosting stay off your plate.'],
    ['A real person to contact', 'When you need an update, you talk directly with Leon.'],
  ];
  serviceItems.forEach((item, index) => {
    const y = 5890 + index * 145;
    addLine(board, `Services / Row ${index + 1}`, 72, y, 1296, '#5D6068', 0.28);
    addText(board, `Services / ${item[0]} / Index`, `0${index + 1}`, 72, y + 38, 80, 11, COLORS.blueDark, { height: 18 });
    addText(board, `Services / ${item[0]}`, item[0], 220, y + 26, 430, 34, COLORS.graphite, { font: 'display', height: 45 });
    addText(board, `Services / ${item[0]} / Copy`, item[1], 760, y + 30, 500, 14, '#555961', { lineHeight: 1.45, lines: 2 });
  });
  addRect(board, 'Payments / Callout', 72, 6380, 1296, 260, COLORS.blue, 18);
  addEyebrow(board, 'Optional growth path', 130, 6440, 250, false);
  addText(board, 'Payments / Title', 'Need deposits or client payments later?', 390, 6420, 480, 48, COLORS.graphite, { font: 'display', lineHeight: 0.9, lines: 2 });
  addText(board, 'Payments / Copy', 'We can plan a payment-ready experience carefully.\nNo live payout feature is promised until it is tested.', 930, 6442, 340, 13, COLORS.graphite, { lineHeight: 1.45, lines: 3 });

  addRect(board, 'Founder / Background', 0, 6720, 1440, 780, COLORS.graphite);
  addEllipse(board, 'Founder / Orbit', 90, 6810, 560, 560, COLORS.blue, 0.08);
  addText(board, 'Founder / Signature', 'Sites\nBy\nLeon', 190, 6925, 360, 105, COLORS.ivory, { font: 'signature', align: 'center', lineHeight: 0.56, lines: 3 });
  addEyebrow(board, '06 / The person behind it', 760, 6840, 280);
  addText(board, 'Founder / Heading', 'Small studio.\nDirect relationship.', 760, 6900, 560, 72, COLORS.ivory, { font: 'display', lineHeight: 0.86, lines: 2 });
  addText(board, 'Founder / Copy', 'I’m Leon. I design and host websites for photographers who want\ntheir online presence handled without turning it into another job.', 760, 7100, 520, 17, COLORS.silverLight, { lineHeight: 1.5, lines: 3 });
  addText(board, 'Founder / Link', 'START A CONVERSATION  ↗', 760, 7235, 300, 12, COLORS.ivory, { weight: 750, letterSpacing: 1, height: 22 });

  addRect(board, 'Contact / Background', 0, 7500, 1440, 900, COLORS.blue);
  addEyebrow(board, '07 / Contact', 72, 7610, 180, false);
  addText(board, 'Contact / Heading', 'Let’s make your work', 72, 7670, 620, 76, COLORS.graphite, { font: 'display', height: 90 });
  addText(board, 'Contact / Heading accent', 'feel impossible to overlook.', 72, 7755, 620, 76, COLORS.graphite, { font: 'display', italic: true, lineHeight: 0.86, lines: 2 });
  addText(board, 'Contact / Description', 'Tell me what you photograph and what you want your next site to do.', 72, 7980, 520, 15, COLORS.graphite, { lineHeight: 1.5, lines: 2 });
  addLine(board, 'Contact / Email divider', 72, 8080, 520, COLORS.graphite, 0.3);
  addText(board, 'Contact / Email label', 'PREFER A DIRECT EMAIL?', 72, 8115, 260, 11, COLORS.graphite, { weight: 750, letterSpacing: 1, height: 18 });
  addText(board, 'Contact / Email', 'sites.by.leon@gmail.com', 72, 8155, 500, 30, COLORS.graphite, { font: 'display', weight: 600, height: 42 });
  addRect(board, 'Contact / Form', 760, 7600, 608, 700, COLORS.ivory, 18);
  [['NAME', 790, 7670, 250], ['EMAIL', 1080, 7670, 250], ['WHAT DO YOU PHOTOGRAPH?', 790, 7810, 540], ['WHAT ARE YOU LOOKING FOR?', 790, 7950, 540]].forEach((field, index) => {
    addText(board, `Contact / Form / Field ${index + 1}`, field[0], field[1], field[2], field[3], 11, COLORS.graphite, { weight: 750, letterSpacing: 0.8, height: 18 });
    addLine(board, `Contact / Form / Field line ${index + 1}`, field[1], field[2] + (index < 2 ? 55 : index === 2 ? 65 : 170), field[3], COLORS.graphite, 0.3);
  });
  addButton(board, 'Contact / Form / Submit', 'Send inquiry', 790, 8180, 150, COLORS.graphite, COLORS.ivory);

  addRect(board, 'Footer / Background', 0, 8400, 1440, 260, COLORS.graphite);
  addText(board, 'Footer / Brand', 'Sites\nBy\nLeon', 72, 8450, 120, 32, COLORS.ivory, { font: 'signature', align: 'center', lineHeight: 0.58, lines: 3 });
  addText(board, 'Footer / Positioning', 'Websites and managed hosting for photographers who want the web handled.', 270, 8470, 520, 14, COLORS.silver, { lines: 2 });
  addText(board, 'Footer / Email', 'sites.by.leon@gmail.com', 1030, 8470, 330, 22, COLORS.ivory, { font: 'display', align: 'right', height: 35 });
  return board;
}

function buildMobile(page) {
  const board = penpot.createBoard();
  board.name = 'Homepage / Mobile / 390';
  board.x = 1600;
  board.y = 0;
  board.resize(390, 10750);
  board.fills = [{ fillColor: COLORS.graphite, fillOpacity: 1 }];
  board.clipContent = true;
  page.root.appendChild(board);

  addRect(board, 'Mobile / Hero', 0, 0, 390, 1080, COLORS.graphite);
  addRect(board, 'Mobile / Navigation', 16, 16, 358, 76, COLORS.graphite2, 16);
  addText(board, 'Mobile / Brand', 'Sites\nBy\nLeon', 30, 25, 78, 23, COLORS.ivory, { font: 'signature', align: 'center', lineHeight: 0.56, lines: 3 });
  addButton(board, 'Mobile / Contact CTA', 'Contact', 274, 28, 86, COLORS.blue, COLORS.graphite);
  addEyebrow(board, 'Web design  •  Managed hosting', 20, 140, 340);
  addText(board, 'Mobile / Hero heading', 'Websites for\nphotographers,', 20, 186, 350, 53, COLORS.ivory, { font: 'display', lineHeight: 0.82, lines: 2 });
  addText(board, 'Mobile / Hero accent', 'without the\nwebsite headache.', 34, 286, 330, 50, COLORS.blueLight, { font: 'display', italic: true, lineHeight: 0.84, lines: 2 });
  addText(board, 'Mobile / Hero description', 'A cinematic home for your work—designed, launched, hosted,\nand cared for by one person you can actually reach.', 20, 420, 350, 15, COLORS.silverLight, { lineHeight: 1.45, lines: 4 });
  addButton(board, 'Mobile / Hero CTA', 'Contact', 20, 535, 350, COLORS.blue, COLORS.graphite);
  addText(board, 'Mobile / Hero email', 'sites.by.leon@gmail.com  ↗', 20, 612, 350, 13, COLORS.ivory, { weight: 700, height: 22 });
  addText(board, 'Mobile / Hero facts', 'MONTHLY ONLY   /   $25–$40   /   DOMAIN + PAYMENTS', 20, 680, 350, 9, COLORS.silver, { letterSpacing: 0.5, height: 18 });
  addBrowser(board, 'Mobile / Hero browser', 20, 730, 350, 305, '#4C4138', 'Aster House');

  addRect(board, 'Mobile / Promise', 0, 1080, 390, 330, COLORS.graphite2);
  [['01', 'Effortless'], ['02', 'Photographer-specific'], ['03', 'Actually affordable']].forEach((item, index) => {
    const y = 1115 + index * 94;
    addLine(board, `Mobile / Promise / Line ${index}`, 20, y, 350, COLORS.silver, 0.2);
    addText(board, `Mobile / Promise / ${item[1]} / Index`, item[0], 20, y + 25, 40, 10, COLORS.blueLight, { height: 18 });
    addText(board, `Mobile / Promise / ${item[1]}`, item[1], 72, y + 16, 280, 25, COLORS.ivory, { font: 'display', height: 34 });
  });

  addRect(board, 'Mobile / Work', 0, 1410, 390, 2040, COLORS.ivory, 24);
  addEyebrow(board, '02 / Selected directions', 20, 1510, 270, true);
  addText(board, 'Mobile / Work heading', 'Three ways\nyour work\ncould own\nthe room.', 20, 1570, 350, 51, COLORS.graphite, { font: 'display', lineHeight: 0.86, lines: 4 });
  addText(board, 'Mobile / Work note', 'Original concept projects—not client claims. Every example is clearly labeled.', 20, 1775, 350, 13, '#555961', { lineHeight: 1.45, lines: 4 });
  const mobileConcepts = [
    ['Vow & Light', 'EDITORIAL WEDDING PHOTOGRAPHY', '#4A4038'],
    ['Northline Portraits', 'BOLD PORTRAIT STUDIO', '#172B64'],
    ['Fieldwork Commercial', 'COMMERCIAL PHOTOGRAPHY', '#6B6F78'],
  ];
  mobileConcepts.forEach((item, index) => {
    const y = 1930 + index * 480;
    addLine(board, `Mobile / Work / ${item[0]} / Divider`, 20, y, 350, '#5D6068', 0.25);
    addText(board, `Mobile / Work / ${item[0]} / Index`, `0${index + 1}`, 20, y + 25, 50, 10, '#5E6169', { height: 18 });
    addText(board, `Mobile / Work / ${item[0]} / Label`, 'CONCEPT PROJECT', 220, y + 18, 150, 10, COLORS.graphite, { weight: 750, align: 'right', letterSpacing: 0.7, height: 18 });
    addText(board, `Mobile / Work / ${item[0]} / Focus`, item[1], 20, y + 70, 350, 10, '#5E6169', { weight: 750, letterSpacing: 0.6, height: 18 });
    addText(board, `Mobile / Work / ${item[0]} / Title`, item[0], 20, y + 104, 350, 42, COLORS.graphite, { font: 'display', lineHeight: 0.9, lines: 2 });
    addBrowser(board, `Mobile / Work / ${item[0]} / Browser`, 20, y + 190, 350, 250, item[2], item[0]);
  });

  addRect(board, 'Mobile / Process', 0, 3450, 390, 1100, COLORS.graphite);
  addEyebrow(board, '03 / The process', 20, 3540, 220);
  addText(board, 'Mobile / Process heading', 'A clear path\nfrom need to live.', 20, 3595, 350, 48, COLORS.ivory, { font: 'display', lineHeight: 0.86, lines: 2 });
  ['Start with a conversation', 'Shape the direction', 'Review the build', 'Launch without the headache'].forEach((item, index) => {
    const y = 3770 + index * 165;
    addLine(board, `Mobile / Process / ${item} / Divider`, 20, y, 350, COLORS.silver, 0.22);
    addText(board, `Mobile / Process / ${item} / Index`, `0${index + 1}`, 20, y + 28, 45, 10, COLORS.blueLight, { height: 18 });
    addText(board, `Mobile / Process / ${item}`, item, 72, y + 20, 290, 27, COLORS.ivory, { font: 'display', lineHeight: 0.95, lines: 2 });
    addText(board, `Mobile / Process / ${item} / Copy`, ['Tell me what you photograph and what you need.', 'Align on pages, personality, and images.', 'See the site before launch.', 'I publish, host, and stay available.'][index], 72, y + 80, 285, 12, COLORS.silver, { lineHeight: 1.4, lines: 2 });
  });

  addRect(board, 'Mobile / Pricing', 0, 4550, 390, 1950, COLORS.graphite2);
  addEyebrow(board, '04 / Monthly packages', 20, 4640, 240);
  addText(board, 'Mobile / Pricing heading', 'Professional\npresence.', 20, 4700, 350, 50, COLORS.ivory, { font: 'display', lineHeight: 0.86, lines: 2 });
  addText(board, 'Mobile / Pricing accent', 'Human-sized\npricing.', 20, 4800, 350, 50, COLORS.blueLight, { font: 'display', italic: true, lineHeight: 0.86, lines: 2 });
  addText(board, 'Mobile / Pricing note', 'Monthly only. No separate build fee.', 20, 4915, 350, 13, COLORS.silverLight, { height: 22 });
  addPricingCard(board, 20, 4985, 350, 'Essential', 30, false);
  addPricingCard(board, 20, 5580, 350, 'Studio', 65, true);
  addPricingCard(board, 20, 6175, 350, 'Signature', 100, false);

  addRect(board, 'Mobile / Services', 0, 6500, 390, 1200, COLORS.ivory);
  addEyebrow(board, '05 / Everything handled', 20, 6590, 260, true);
  addText(board, 'Mobile / Services heading', 'Your website should\ncreate momentum,\nnot another job.', 20, 6650, 350, 46, COLORS.graphite, { font: 'display', lineHeight: 0.88, lines: 3 });
  ['Designed around your work', 'Hosted and maintained', 'A real person to contact'].forEach((item, index) => {
    const y = 6860 + index * 190;
    addLine(board, `Mobile / Services / ${item} / Divider`, 20, y, 350, '#5D6068', 0.25);
    addText(board, `Mobile / Services / ${item} / Index`, `0${index + 1}`, 20, y + 28, 45, 10, COLORS.blueDark, { height: 18 });
    addText(board, `Mobile / Services / ${item}`, item, 72, y + 18, 285, 30, COLORS.graphite, { font: 'display', lineHeight: 0.95, lines: 2 });
    addText(board, `Mobile / Services / ${item} / Copy`, ['Layout shaped around your images and audience.', 'Launch and routine technical care stay handled.', 'Talk directly with Leon when you need an update.'][index], 72, y + 90, 280, 12, '#555961', { lineHeight: 1.4, lines: 3 });
  });

  addRect(board, 'Mobile / Payments', 20, 7160, 350, 480, COLORS.blue, 18);
  addEyebrow(board, 'Optional growth path', 44, 7200, 260, false);
  addText(board, 'Mobile / Payments title', 'Need deposits or client payments later?', 44, 7260, 300, 37, COLORS.graphite, { font: 'display', lineHeight: 0.9, lines: 3 });
  addText(board, 'Mobile / Payments copy', 'We can plan a payment-ready experience carefully. No live payout feature is promised until tested.', 44, 7395, 300, 12, COLORS.graphite, { lineHeight: 1.45, lines: 4 });

  addRect(board, 'Mobile / Founder', 0, 7700, 390, 1180, COLORS.graphite);
  addEllipse(board, 'Mobile / Founder orbit', 55, 7790, 280, 280, COLORS.blue, 0.08);
  addText(board, 'Mobile / Founder signature', 'Sites\nBy\nLeon', 85, 7845, 220, 70, COLORS.ivory, { font: 'signature', align: 'center', lineHeight: 0.56, lines: 3 });
  addEyebrow(board, '06 / The person behind it', 20, 8170, 280);
  addText(board, 'Mobile / Founder heading', 'Small studio.\nDirect relationship.', 20, 8230, 350, 48, COLORS.ivory, { font: 'display', lineHeight: 0.86, lines: 2 });
  addText(board, 'Mobile / Founder copy', 'I’m Leon. I design and host websites for photographers who want their online presence handled without another full-time job.', 20, 8370, 350, 14, COLORS.silverLight, { lineHeight: 1.5, lines: 5 });
  addText(board, 'Mobile / Founder link', 'START A CONVERSATION  ↗', 20, 8525, 300, 11, COLORS.ivory, { weight: 750, letterSpacing: 1, height: 18 });

  addRect(board, 'Mobile / Contact', 0, 8880, 390, 1570, COLORS.blue);
  addEyebrow(board, '07 / Contact', 20, 8970, 180, false);
  addText(board, 'Mobile / Contact heading', 'Let’s make\nyour work\nfeel impossible\nto overlook.', 20, 9030, 350, 51, COLORS.graphite, { font: 'display', italic: true, lineHeight: 0.84, lines: 4 });
  addText(board, 'Mobile / Contact copy', 'Tell me what you photograph and what you want your next site to do.', 20, 9245, 350, 14, COLORS.graphite, { lineHeight: 1.5, lines: 3 });
  addText(board, 'Mobile / Contact email label', 'PREFER A DIRECT EMAIL?', 20, 9380, 280, 10, COLORS.graphite, { weight: 750, letterSpacing: 0.8, height: 18 });
  addText(board, 'Mobile / Contact email', 'sites.by.leon@gmail.com', 20, 9420, 350, 27, COLORS.graphite, { font: 'display', weight: 600, height: 38 });
  addRect(board, 'Mobile / Contact form', 20, 9510, 350, 780, COLORS.ivory, 18);
  ['NAME', 'EMAIL', 'WHAT DO YOU PHOTOGRAPH?', 'WHAT ARE YOU LOOKING FOR?'].forEach((label, index) => {
    const y = 9560 + index * 135;
    addText(board, `Mobile / Contact / ${label}`, label, 44, y, 300, 10, COLORS.graphite, { weight: 750, letterSpacing: 0.7, height: 18 });
    addLine(board, `Mobile / Contact / ${label} / Line`, 44, y + (index === 3 ? 100 : 52), 300, COLORS.graphite, 0.28);
  });
  addButton(board, 'Mobile / Contact submit', 'Send inquiry', 44, 10180, 302, COLORS.graphite, COLORS.ivory);

  addRect(board, 'Mobile / Footer', 0, 10450, 390, 300, COLORS.graphite);
  addText(board, 'Mobile / Footer brand', 'Sites\nBy\nLeon', 20, 10500, 100, 28, COLORS.ivory, { font: 'signature', align: 'center', lineHeight: 0.58, lines: 3 });
  addText(board, 'Mobile / Footer copy', 'Websites and managed hosting for photographers.', 150, 10510, 210, 12, COLORS.silver, { lineHeight: 1.4, lines: 3 });
  addText(board, 'Mobile / Footer email', 'sites.by.leon@gmail.com', 20, 10630, 350, 18, COLORS.ivory, { font: 'display', height: 28 });
  return board;
}

function buildComponents(page) {
  const board = penpot.createBoard();
  board.name = 'Components / Core';
  board.x = 2200;
  board.y = 0;
  board.resize(920, 1280);
  board.fills = [{ fillColor: COLORS.ivory, fillOpacity: 1 }];
  board.clipContent = true;
  page.root.appendChild(board);
  addText(board, 'Components / Title', 'sites.by.leon / Core components', 48, 48, 820, 54, COLORS.graphite, { font: 'display', height: 70 });
  addText(board, 'Components / Token note', 'Graphite · Warm ivory · Silver · Electric blue / Cormorant · Manrope · Allura', 48, 120, 820, 13, '#555961', { height: 22 });
  addLine(board, 'Components / Header divider', 48, 165, 824, '#5D6068', 0.25);
  addText(board, 'Components / Brand mark label', 'BRAND MARK', 48, 210, 160, 11, COLORS.blueDark, { weight: 750, letterSpacing: 1, height: 18 });
  const brandPlate = addRect(board, 'Component / Brand Mark', 48, 250, 300, 250, COLORS.graphite, 18);
  addText(board, 'Component / Brand Mark / Text', 'Sites\nBy\nLeon', 90, 290, 215, 68, COLORS.ivory, { font: 'signature', align: 'center', lineHeight: 0.56, lines: 3 });
  addText(board, 'Components / Buttons label', 'BUTTONS', 410, 210, 160, 11, COLORS.blueDark, { weight: 750, letterSpacing: 1, height: 18 });
  const primaryButton = addButton(board, 'Component / Button / Primary', 'Contact', 410, 250, 180, COLORS.blue, COLORS.graphite);
  const darkButton = addButton(board, 'Component / Button / Ink', 'Send inquiry', 610, 250, 210, COLORS.graphite, COLORS.ivory);
  addText(board, 'Components / Label label', 'CONCEPT LABEL', 410, 350, 200, 11, COLORS.blueDark, { weight: 750, letterSpacing: 1, height: 18 });
  const conceptLabel = addRect(board, 'Component / Concept Label', 410, 390, 180, 42, COLORS.ivory, 21);
  addText(board, 'Component / Concept Label / Text', 'CONCEPT PROJECT', 425, 402, 150, 10, COLORS.graphite, { weight: 750, align: 'center', letterSpacing: 0.7, height: 18 });
  addText(board, 'Components / Browser label', 'BROWSER MOCKUP', 48, 560, 220, 11, COLORS.blueDark, { weight: 750, letterSpacing: 1, height: 18 });
  addBrowser(board, 'Component / Browser Mockup', 48, 600, 520, 430, '#4A4038', 'Vow & Light');
  addText(board, 'Components / Price label', 'PRICING CARD', 620, 560, 180, 11, COLORS.blueDark, { weight: 750, letterSpacing: 1, height: 18 });
  addPricingCard(board, 620, 600, 252, 'Studio', 65, true);
  try {
    const library = penpot.library.local;
    if (!library.components.find((component) => component.name === 'Brand Mark')) library.createComponent([brandPlate]).name = 'Brand Mark';
    if (!library.components.find((component) => component.name === 'Button / Primary')) library.createComponent([primaryButton]).name = 'Button / Primary';
    if (!library.components.find((component) => component.name === 'Button / Ink')) library.createComponent([darkButton]).name = 'Button / Ink';
    if (!library.components.find((component) => component.name === 'Concept Label')) library.createComponent([conceptLabel]).name = 'Concept Label';
  } catch (error) {
    // The visual component board remains complete even if a library operation is unavailable.
  }
  return board;
}

const page = penpot.currentPage;
const file = penpot.currentFile;
if (!page || !file) throw new Error('Open a Penpot design file before running the builder.');

page.name = 'Homepage';
createTokens();

const existing = page.findShapes({ type: 'board' }).filter((shape) =>
  ['Homepage / Desktop / 1440', 'Homepage / Mobile / 390', 'Components / Core'].includes(shape.name),
);
existing.forEach((shape) => shape.remove());

const desktop = buildDesktop(page);
const mobile = buildMobile(page);
const components = buildComponents(page);

storage.sitesByLeonBoards = { desktop: desktop.id, mobile: mobile.id, components: components.id };
penpot.viewport.zoomToFitAll();

return {
  file: file.name,
  page: page.name,
  boards: storage.sitesByLeonBoards,
  tokens: penpotUtils.tokenOverview(),
  validation: file.validate().map((error) => String(error)),
};
