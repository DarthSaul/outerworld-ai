// Character sprites for Crew Select — ported verbatim from the design prototype.
// Each character is a 20×26 pixel grid generated procedurally from a spec.
// Render with <canvas> (see renderSpriteToCanvas) or use the pre-exported PNGs in /sprites.
/* eslint-disable */
// @ts-nocheck — pixel-drawing code kept identical to the prototype for fidelity

export const SPRITE_W = 20;
export const SPRITE_H = 26;
export const OUTLINE = '#14121c';

export type CharacterSpec = {
  name: string; role: string; skin: string; suit: string;
  hair?: string; hairStyle?: 'short'|'spiky'|'long'|'bun'|'mohawk'|'bald'|'afro'|'ponytail'|'bob'|'pigtails'|'cap'|'capback'|'beanie'|'helmet'|'hood';
  cap?: string; acc?: string; alt?: string; belt?: string; scarf?: string; cape?: string; visor?: string; glow?: string; screen?: string;
  fit?: 'labcoat'|'overalls'|'jacket'|'armor';
  eyes?: 'dots'|'sleepy'|'glasses'|'visor'|'shades'|'patch'|'hoodglow';
  mouth?: 'smile'|'grin'|'flat'|'beard'|'mustache'|'none';
  item?: 'wrench'|'tablet'|'mug'|'staff'|'clipboard'|'scanner';
  robot?: 'twin'|'mono'; animal?: 'cat'|'fox'; antenna?: 1|2;
  emblem?: 1; brows?: 1; blush?: 1; headset?: 1; gogglesUp?: 1; ears?: false;
};

function dk(hex, f) { const n = parseInt(hex.slice(1), 16); return '#' + [n >> 16 & 255, n >> 8 & 255, n & 255].map(v => Math.max(0, Math.min(255, Math.round(v * f))).toString(16).padStart(2, '0')).join(''); }

export const CHARACTERS: CharacterSpec[] = [
  { name: 'NOVA', role: 'Pilot', skin: '#eab38a', hair: '#e0662c', hairStyle: 'ponytail', suit: '#3d6fd0', emblem: 1, belt: '#2a2f3a', gogglesUp: 1 },
  { name: 'BOLT', role: 'Utility Bot', skin: '#b8c0cc', robot: 'twin', glow: '#6ff0ff', suit: '#7a8494', acc: '#ff5a4a', antenna: 1, ears: false, emblem: 1 },
  { name: 'PIP', role: 'Xeno Liaison', skin: '#8fd46a', suit: '#8a4ad0', acc: '#ffd84a', antenna: 2, mouth: 'grin', ears: false },
  { name: 'KESTREL', role: 'Commander', skin: '#f7d4b4', hair: '#6a4a30', hairStyle: 'cap', cap: '#5f6b3a', suit: '#6f7a44', mouth: 'mustache', brows: 1, emblem: 1 },
  { name: 'DR. ISO', role: 'Scientist', skin: '#c98c5e', hair: '#c8c8d0', hairStyle: 'bun', suit: '#3aa0a0', fit: 'labcoat', eyes: 'glasses', item: 'clipboard' },
  { name: 'RIVET', role: 'Mechanic', skin: '#f7d4b4', hair: '#3a2a20', hairStyle: 'beanie', cap: '#d04a3a', suit: '#e8d6b0', fit: 'overalls', alt: '#3a5aa0', item: 'wrench', mouth: 'grin', blush: 1 },
  { name: 'ZEPHYR', role: 'Comms Officer', skin: '#8e5b3b', hair: '#1e1610', hairStyle: 'afro', suit: '#f0c040', fit: 'jacket', alt: '#2a2f3a', headset: 1, acc: '#ff5a4a' },
  { name: 'GLITCH', role: 'Netrunner', skin: '#3a3650', hairStyle: 'hood', cap: '#2a2838', suit: '#2a2838', acc: '#5affb0', eyes: 'hoodglow', visor: '#5affb0', mouth: 'none', emblem: 1 },
  { name: 'MOSS', role: 'Botanist', skin: '#c98c5e', hair: '#7a5a3a', hairStyle: 'bald', mouth: 'beard', suit: '#4a7a3a', fit: 'jacket', alt: '#e8e0c8', item: 'mug' },
  { name: 'LUMEN', role: 'Spacewalker', skin: '#f7d4b4', hairStyle: 'helmet', cap: '#e8ecf2', acc: '#4aa0ff', eyes: 'visor', visor: '#4aa0ff', mouth: 'none', suit: '#e8ecf2', belt: '#4aa0ff', emblem: 1 },
  { name: 'CRUX', role: 'Vanguard', skin: '#eab38a', hair: '#1a1820', hairStyle: 'spiky', suit: '#c83a3a', fit: 'jacket', alt: '#1a1820', scarf: '#f2c14e', brows: 1, mouth: 'flat' },
  { name: 'SABLE', role: 'Strategist', skin: '#f7d4b4', hair: '#2a1e3a', hairStyle: 'long', suit: '#3a2a5a', cape: '#8a3ad0', acc: '#d0b0ff', emblem: 1, eyes: 'sleepy' },
  { name: 'TOCK', role: 'Clockwork Unit', skin: '#e08a3c', robot: 'mono', glow: '#ffec5a', suit: '#5a4a3a', acc: '#ffec5a', ears: false, item: 'scanner', antenna: 1 },
  { name: 'BRAMBLE', role: 'Mystic', skin: '#d9b07a', animal: 'cat', suit: '#3a7a6a', acc: '#9affd8', item: 'staff', blush: 1, ears: false },
  { name: 'ECHO', role: 'Analyst', skin: '#f7d4b4', hair: '#d8dce8', hairStyle: 'bob', suit: '#2aa0a0', item: 'tablet', screen: '#ffe680', emblem: 1 },
  { name: 'HAWK', role: 'Security', skin: '#c98c5e', hair: '#e03a3a', hairStyle: 'mohawk', suit: '#4a4f5a', fit: 'armor', acc: '#e0a030', eyes: 'patch', mouth: 'flat' },
  { name: 'MARLOW', role: 'Archivist', skin: '#eab38a', hair: '#9a9aa4', hairStyle: 'short', eyes: 'glasses', suit: '#a0603a', fit: 'jacket', alt: '#e8e0c8', item: 'mug' },
  { name: 'VEGA', role: 'Navigator', skin: '#7fb4f0', hair: '#f4f1ea', hairStyle: 'long', suit: '#2a3a7a', cape: '#e0b040', acc: '#f4f1ea', emblem: 1 },
  { name: 'SPROCKET', role: 'Apprentice', skin: '#eab38a', hair: '#e0a040', hairStyle: 'capback', cap: '#3a7ad0', suit: '#e05a3a', acc: '#ffffff', emblem: 1, mouth: 'grin', blush: 1 },
  { name: 'ONYX', role: 'Operative', skin: '#5c3a27', hairStyle: 'bald', eyes: 'shades', suit: '#1e1e28', belt: '#e0b040', acc: '#e0b040', emblem: 1, mouth: 'flat' },
  { name: 'FENNEC', role: 'Pathfinder', skin: '#e0803a', animal: 'fox', suit: '#4a5a3a', scarf: '#3a8ad0', ears: false },
  { name: 'QUILL', role: 'Scribe', skin: '#8e5b3b', hair: '#2a1e18', hairStyle: 'bun', suit: '#e07aa0', item: 'clipboard', blush: 1 },
  { name: 'ATLAS', role: 'Heavy Lifter', skin: '#c98c5e', hairStyle: 'helmet', cap: '#8a929e', acc: '#e05a3a', suit: '#6a727e', fit: 'armor', eyes: 'visor', visor: '#ffb040', mouth: 'none' },
  { name: 'JUNO', role: 'Dispatcher', skin: '#c98c5e', hair: '#4a2a1a', hairStyle: 'pigtails', suit: '#40b070', acc: '#ffd84a', headset: 1, mouth: 'grin' },
];

export function characterGrid(c: CharacterSpec): (string | null)[][] {
  const W = SPRITE_W, H = SPRITE_H, O = OUTLINE, D = dk;
  const g = [...Array(H)].map(() => Array(W).fill(null));
  const P = (x, y, k) => { if (x >= 0 && x < W && y >= 0 && y < H) g[y][x] = k; };
  const R = (x0, y0, x1, y1, k) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) P(x, y, k); };
  const sk = c.skin, h = c.hair || O, su = c.suit, ac = c.acc || '#f2c14e', sl = D(su, 0.82), pa = D(su, 0.62), bo = '#3a2c2a', cap = c.cap || ac;
  if (c.cape) { R(4, 14, 15, 22, c.cape); R(3, 19, 16, 22, c.cape); R(15, 14, 16, 22, D(c.cape, .8)); }
  R(7, 20, 12, 20, pa); R(7, 21, 8, 22, pa); R(11, 21, 12, 22, pa); R(6, 23, 8, 23, bo); R(11, 23, 13, 23, bo);
  R(6, 14, 13, 19, su); R(13, 14, 13, 19, D(su, .8)); R(4, 15, 5, 18, sl); R(14, 15, 15, 18, sl); P(5, 14, sl); P(14, 14, sl); R(4, 19, 5, 19, sk); R(14, 19, 15, 19, sk);
  if (c.fit === 'labcoat') { const w = '#eef0f2', w2 = '#d6dbe2'; R(6, 14, 13, 19, w); R(13, 14, 13, 19, w2); R(4, 15, 5, 18, w2); R(14, 15, 15, 18, w2); P(5, 14, w2); P(14, 14, w2); R(8, 14, 11, 17, su); R(9, 15, 10, 17, D(su, .7)); }
  if (c.fit === 'overalls') { R(7, 16, 12, 19, c.alt); R(7, 14, 7, 15, c.alt); R(12, 14, 12, 15, c.alt); P(8, 17, ac); P(11, 17, ac); R(7, 20, 12, 20, c.alt); R(7, 21, 8, 22, c.alt); R(11, 21, 12, 22, c.alt); }
  if (c.fit === 'jacket') { R(9, 14, 10, 19, c.alt); P(8, 14, D(su, .7)); P(11, 14, D(su, .7)); }
  if (c.fit === 'armor') { R(3, 14, 6, 15, ac); R(13, 14, 16, 15, D(ac, .85)); R(8, 16, 11, 17, D(su, 1.3)); }
  if (c.emblem) R(9, 16, 10, 17, ac);
  if (c.belt) { R(6, 19, 13, 19, c.belt); R(9, 19, 10, 19, ac); }
  if (c.scarf) { R(6, 14, 13, 14, c.scarf); R(12, 15, 13, 17, c.scarf); R(13, 15, 13, 17, D(c.scarf, .8)); }
  R(5, 5, 14, 13, sk); [[5, 5], [14, 5], [5, 13], [14, 13]].forEach(([x, y]) => P(x, y, null)); R(14, 6, 14, 12, D(sk, .86));
  if (c.ears !== false) { R(4, 9, 4, 10, sk); R(15, 9, 15, 10, D(sk, .86)); }
  if (c.animal === 'cat') { P(5, 3, sk); R(5, 4, 6, 4, sk); P(14, 3, sk); R(13, 4, 14, 4, sk); P(6, 4, '#f0a0a8'); P(13, 4, '#f0a0a8'); R(4, 11, 4, 11, O); R(15, 11, 15, 11, O); }
  if (c.animal === 'fox') { P(5, 1, sk); R(5, 2, 6, 2, sk); R(5, 3, 7, 3, sk); R(5, 4, 8, 4, sk); P(14, 1, sk); R(13, 2, 14, 2, sk); R(12, 3, 14, 3, sk); R(11, 4, 14, 4, sk); P(6, 3, '#f4f1ea'); P(13, 3, '#f4f1ea'); R(7, 11, 12, 13, '#f4f1ea'); R(9, 11, 10, 11, O); }
  const top = () => { R(5, 4, 14, 6, h); P(5, 4, null); P(14, 4, null); R(5, 7, 5, 8, h); R(14, 7, 14, 8, h); };
  const hs = c.hairStyle;
  if (hs === 'short') { top(); R(6, 7, 8, 7, h); }
  if (hs === 'spiky') { top(); [[5, 3], [6, 2], [7, 3], [8, 1], [8, 2], [9, 3], [10, 2], [11, 1], [11, 2], [11, 3], [12, 3], [13, 2], [14, 3]].forEach(([x, y]) => P(x, y, h)); R(6, 7, 7, 8, h); P(12, 7, h); }
  if (hs === 'long') { top(); R(4, 6, 5, 16, h); R(14, 6, 15, 16, h); R(6, 7, 8, 7, h); }
  if (hs === 'bun') { top(); R(8, 1, 11, 3, h); P(8, 1, null); P(11, 1, null); R(6, 7, 7, 7, h); }
  if (hs === 'mohawk') { R(9, 1, 10, 7, h); R(10, 1, 10, 7, D(h, .8)); }
  if (hs === 'bald') R(7, 6, 8, 6, D(sk, 1.18));
  if (hs === 'afro') { R(3, 2, 16, 8, h); [[3, 2], [16, 2], [3, 3], [16, 3], [4, 2], [15, 2]].forEach(([x, y]) => P(x, y, null)); R(3, 9, 4, 11, h); R(15, 9, 16, 11, h); }
  if (hs === 'ponytail') { top(); R(15, 5, 16, 7, h); R(16, 8, 17, 13, h); R(6, 7, 8, 7, h); }
  if (hs === 'bob') { top(); R(4, 5, 5, 12, h); R(14, 5, 15, 12, h); R(6, 7, 10, 7, h); }
  if (hs === 'pigtails') { top(); R(2, 7, 4, 11, h); R(15, 7, 17, 11, h); P(4, 7, ac); P(15, 7, ac); R(6, 7, 8, 7, h); }
  if (hs === 'cap') { R(5, 3, 14, 6, cap); P(5, 3, null); P(14, 3, null); R(3, 7, 9, 7, D(cap, .7)); R(10, 4, 10, 5, ac); R(14, 7, 14, 8, h); R(10, 7, 13, 7, h); }
  if (hs === 'capback') { R(5, 3, 14, 6, cap); P(5, 3, null); P(14, 3, null); R(14, 6, 17, 6, D(cap, .7)); R(5, 7, 8, 7, h); P(5, 8, h); }
  if (hs === 'beanie') { R(5, 3, 14, 7, cap); P(5, 3, null); P(14, 3, null); R(5, 7, 14, 7, D(cap, .75)); R(9, 1, 10, 2, ac); }
  if (hs === 'helmet') { R(4, 3, 15, 9, cap); P(4, 3, null); P(15, 3, null); R(4, 10, 4, 13, cap); R(15, 10, 15, 13, D(cap, .85)); R(9, 3, 10, 7, ac); }
  if (hs === 'hood') { R(4, 3, 15, 14, cap); P(4, 3, null); P(15, 3, null); R(6, 8, 13, 13, sk); R(6, 8, 13, 8, D(sk, .6)); }
  if (c.robot) {
    R(6, 8, 13, 12, '#16202c'); P(4, 10, ac); P(15, 10, ac);
    if (c.robot === 'mono') { R(9, 9, 10, 11, c.glow); P(9, 9, '#ffffff'); }
    else { R(7, 10, 8, 10, c.glow); R(11, 10, 12, 10, c.glow); R(8, 12, 11, 12, D(c.glow, .55)); }
  } else {
    const ey = c.eyes || 'dots';
    if (ey === 'dots') { R(7, 10, 7, 11, O); R(12, 10, 12, 11, O); }
    if (ey === 'sleepy') { R(6, 11, 8, 11, O); R(11, 11, 13, 11, O); }
    if (ey === 'glasses') { R(6, 9, 8, 11, O); R(11, 9, 13, 11, O); P(7, 10, '#bfe0ff'); P(12, 10, '#bfe0ff'); R(9, 10, 10, 10, O); }
    if (ey === 'visor') { R(5, 9, 14, 11, c.visor); R(6, 9, 8, 9, '#ffffff'); R(13, 9, 14, 11, D(c.visor, .75)); }
    if (ey === 'shades') { R(5, 9, 14, 9, O); R(6, 10, 8, 11, O); R(11, 10, 13, 11, O); P(7, 10, '#6a7a9a'); P(12, 10, '#6a7a9a'); }
    if (ey === 'patch') { R(7, 10, 7, 11, O); R(5, 8, 10, 8, O); R(11, 9, 13, 11, O); }
    if (ey === 'hoodglow') { R(7, 10, 8, 10, c.visor); R(11, 10, 12, 10, c.visor); }
    if (c.brows) { R(6, 8, 8, 8, D(h, .8)); R(11, 8, 13, 8, D(h, .8)); }
    if (c.gogglesUp) { R(5, 7, 14, 7, '#4a3a32'); R(6, 6, 8, 8, '#d9963a'); R(11, 6, 13, 8, '#d9963a'); P(7, 7, '#9fe8ff'); P(12, 7, '#9fe8ff'); }
    const mo = c.mouth || 'smile', m = '#8a3a3a';
    if (mo === 'smile') R(9, 12, 10, 12, m);
    if (mo === 'grin') { R(8, 12, 11, 12, '#ffffff'); R(8, 13, 11, 13, m); }
    if (mo === 'flat') R(8, 12, 11, 12, O);
    if (mo === 'beard') { R(5, 11, 14, 13, h); P(5, 13, null); P(14, 13, null); R(7, 14, 12, 14, h); R(9, 12, 10, 12, D(h, .5)); }
    if (mo === 'mustache') { R(7, 12, 12, 12, h); R(9, 13, 10, 13, m); }
    if (c.blush) { P(6, 12, '#f08a8a'); P(13, 12, '#e07a7a'); }
  }
  if (c.antenna === 1) { R(9, 1, 9, 4, '#8a8f9a'); R(9, 0, 10, 1, ac); }
  if (c.antenna === 2) { R(7, 2, 7, 4, D(sk, .7)); R(12, 2, 12, 4, D(sk, .7)); R(6, 1, 7, 1, ac); R(12, 1, 13, 1, ac); }
  if (c.headset) { R(3, 9, 4, 11, '#333a48'); R(5, 12, 7, 12, '#333a48'); P(7, 12, ac); }
  const it = c.item;
  if (it === 'wrench') { R(16, 13, 16, 20, '#a9b0bb'); R(17, 13, 17, 20, '#7d8590'); R(15, 11, 18, 12, '#a9b0bb'); R(16, 11, 17, 11, null); }
  if (it === 'tablet') { R(16, 14, 18, 20, '#2a2f3a'); R(16, 15, 17, 19, c.screen || '#7fe0ff'); }
  if (it === 'mug') { R(16, 17, 17, 20, '#f4f1ea'); R(18, 18, 18, 19, '#f4f1ea'); R(16, 17, 17, 17, '#7a4a2a'); }
  if (it === 'staff') { R(17, 7, 17, 23, '#8a5a32'); R(16, 4, 18, 6, ac); P(16, 4, '#ffffff'); }
  if (it === 'clipboard') { R(16, 14, 18, 20, '#b07a44'); R(16, 15, 18, 19, '#f4f1ea'); P(17, 14, '#9aa0aa'); R(16, 16, 17, 16, '#9aa0aa'); R(16, 18, 17, 18, '#9aa0aa'); }
  if (it === 'scanner') { R(16, 17, 18, 18, '#5a6070'); R(16, 19, 16, 20, '#5a6070'); P(18, 17, ac); }
  const out = g.map(r => r.slice());
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (!g[y][x] && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => g[y + dy] && g[y + dy][x + dx])) out[y][x] = O;
      return out;
}

export function renderSpriteToCanvas(c: CharacterSpec, canvas: HTMLCanvasElement) {
  const grid = characterGrid(c);
  canvas.width = SPRITE_W; canvas.height = SPRITE_H;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, SPRITE_W, SPRITE_H);
  grid.forEach((row, y) => row.forEach((k, x) => { if (k) { ctx.fillStyle = k; ctx.fillRect(x, y, 1, 1); } }));
}

/** Returns a blob: URL (memoize per character; revoke on unmount if regenerating). */
export async function spriteObjectURL(c: CharacterSpec): Promise<string> {
  const cv = document.createElement('canvas');
  renderSpriteToCanvas(c, cv);
  const blob: Blob = await new Promise(r => cv.toBlob(b => r(b!), 'image/png'));
  return URL.createObjectURL(blob);
}
