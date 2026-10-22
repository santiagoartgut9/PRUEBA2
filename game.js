'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#7986cb', // J - indigo
  '#ffb74d', // L - orange
];

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
];

const LINE_SCORES = [0, 100, 300, 500, 800];
const MAX_START_LEVEL = 10;

// ---- Skins ----
// Cada skin define su paleta (mismo orden que COLORS) y cómo se dibuja un bloque.
// drawBlock recibe coordenadas en píxeles; la opacidad la gestiona el llamador.
class Skin {
  constructor(id, name, colors) {
    this.id = id;
    this.name = name;
    this.colors = colors;
  }

  // color de la cuadrícula; null = usar la variable CSS del tema
  get gridColor() { return null; }

  drawBlock(context, px, py, size, color) {
    throw new Error(`drawBlock no implementado en el skin "${this.id}"`);
  }
}

class RetroSkin extends Skin {
  constructor() { super('retro', 'Retro', COLORS); }

  drawBlock(context, px, py, size, color) {
    context.fillStyle = color;
    context.fillRect(px + 1, py + 1, size - 2, size - 2);
    // highlight
    context.fillStyle = 'rgba(255,255,255,0.12)';
    context.fillRect(px + 1, py + 1, size - 2, 4);
  }
}

class NeonSkin extends Skin {
  constructor() {
    super('neon', 'Neon', [
      null,
      '#00f0ff', // I
      '#fff200', // O
      '#ff00ff', // T
      '#39ff14', // S
      '#ff073a', // Z
      '#4d6bff', // J
      '#ff9f00', // L
    ]);
  }

  get gridColor() { return '#10101e'; }

  drawBlock(context, px, py, size, color) {
    const inset = 3;
    const s = size - inset * 2;
    // relleno tenue + borde brillante con resplandor
    context.shadowColor = color;
    context.shadowBlur = size * 0.5;
    const alpha = context.globalAlpha;
    context.fillStyle = color;
    context.globalAlpha = alpha * 0.25;
    context.fillRect(px + inset, py + inset, s, s);
    context.globalAlpha = alpha;
    context.strokeStyle = color;
    context.lineWidth = 2;
    context.strokeRect(px + inset, py + inset, s, s);
  }
}

class PastelSkin extends Skin {
  constructor() {
    super('pastel', 'Pastel', [
      null,
      '#a8e6ef', // I
      '#fff1a8', // O
      '#dcc6f0', // T
      '#c5ebc3', // S
      '#f7c5c5', // Z
      '#c3cbf2', // J
      '#ffd8b1', // L
    ]);
  }

  drawBlock(context, px, py, size, color) {
    const r = size * 0.25;
    roundRectPath(context, px + 2, py + 2, size - 4, size - 4, r);
    context.fillStyle = color;
    context.fill();
    context.strokeStyle = 'rgba(255,255,255,0.55)';
    context.lineWidth = 1.5;
    context.stroke();
    // brillo suave
    roundRectPath(context, px + size * 0.2, py + size * 0.17, size * 0.4, size * 0.14, size * 0.07);
    context.fillStyle = 'rgba(255,255,255,0.45)';
    context.fill();
  }
}

class PixelSkin extends Skin {
  constructor() {
    super('pixel', 'Pixel art', [
      null,
      '#00c8d8', // I
      '#f8b800', // O
      '#b844fc', // T
      '#58d854', // S
      '#e40058', // Z
      '#0070ec', // J
      '#fc7460', // L
    ]);
  }

  drawBlock(context, px, py, size, color) {
    const pattern = PixelSkin.PATTERN;
    const p = size / pattern.length;
    context.fillStyle = color;
    context.fillRect(px, py, size, size);
    for (let r = 0; r < pattern.length; r++)
      for (let c = 0; c < pattern[r].length; c++) {
        const shade = PixelSkin.SHADES[pattern[r][c]];
        if (!shade) continue;
        context.fillStyle = shade;
        context.fillRect(px + c * p, py + r * p, p, p);
      }
  }
}

// textura 6x6: 1 = luz, 2 = sombra, 3 = brillo puntual
PixelSkin.PATTERN = [
  [1, 1, 1, 1, 1, 2],
  [1, 3, 0, 0, 0, 2],
  [1, 0, 0, 3, 0, 2],
  [1, 0, 0, 0, 0, 2],
  [1, 0, 3, 0, 0, 2],
  [2, 2, 2, 2, 2, 2],
];
PixelSkin.SHADES = [null, 'rgba(255,255,255,0.35)', 'rgba(0,0,0,0.35)', 'rgba(255,255,255,0.2)'];

// rectángulo con esquinas redondeadas (sin depender de context.roundRect)
function roundRectPath(context, x, y, w, h, r) {
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + w, y, x + w, y + h, r);
  context.arcTo(x + w, y + h, x, y + h, r);
  context.arcTo(x, y + h, x, y, r);
  context.arcTo(x, y, x + w, y, r);
  context.closePath();
}

const SKINS = [new RetroSkin(), new NeonSkin(), new PastelSkin(), new PixelSkin()];
let currentSkin = SKINS[0];

const DEFAULT_NAME = 'Anónimo';
const NAME_MAX = 12;

// ---- Records: persistencia en localStorage ----
class RecordStore {
  static KEY = 'tetris-records';
  static MAX = 5;

  constructor() {
    this.data = RecordStore.normalize(this.read());
  }

  read() {
    try {
      return JSON.parse(localStorage.getItem(RecordStore.KEY));
    } catch (e) {
      return null; // almacenamiento no disponible o JSON corrupto
    }
  }

  write() {
    try {
      localStorage.setItem(RecordStore.KEY, JSON.stringify(this.data));
    } catch (e) { /* almacenamiento no disponible */ }
  }

  // Valida lo leído de localStorage: puede haber sido editado a mano
  static normalize(raw) {
    const count = v => (Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);
    const data = { entries: [], bestCombo: 0, bestLines: 0 };
    if (!raw || typeof raw !== 'object') return data;
    if (Array.isArray(raw.entries)) {
      data.entries = raw.entries
        .filter(e => e && Number.isFinite(e.score))
        .map(e => ({
          name: RecordStore.cleanName(e.name),
          score: count(e.score),
          lines: count(e.lines),
          combo: count(e.combo),
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, RecordStore.MAX);
    }
    data.bestCombo = count(raw.bestCombo);
    data.bestLines = count(raw.bestLines);
    return data;
  }

  static cleanName(name) {
    return String(name ?? '').trim().slice(0, NAME_MAX) || DEFAULT_NAME;
  }

  get entries() { return this.data.entries.slice(); }
  get bestCombo() { return this.data.bestCombo; }
  get bestLines() { return this.data.bestLines; }

  // Posición (0-based) que ocuparía una puntuación; ante empate gana el récord antiguo
  rankFor(score) {
    const idx = this.data.entries.findIndex(e => score > e.score);
    return idx === -1 ? this.data.entries.length : idx;
  }

  qualifies(score) {
    return score > 0 && this.rankFor(score) < RecordStore.MAX;
  }

  // Top resultante si se añadiera `entry`, sin guardar
  preview(entry) {
    const list = this.entries;
    list.splice(this.rankFor(entry.score), 0, entry);
    return list.slice(0, RecordStore.MAX);
  }

  // Mejor combo y líneas máximas cuentan para todas las partidas, entren o no en el top
  registerGame(lines, combo) {
    this.data.bestLines = Math.max(this.data.bestLines, lines);
    this.data.bestCombo = Math.max(this.data.bestCombo, combo);
    this.write();
  }

  add(entry) {
    const rank = this.rankFor(entry.score);
    this.data.entries = this.preview({ ...entry, name: RecordStore.cleanName(entry.name) });
    this.write();
    return rank;
  }

  reset() {
    this.data = RecordStore.normalize(null);
    this.write();
  }
}

// ---- Records: renderizado de la tabla ----
class RecordsView {
  constructor(body, bestsEl) {
    this.body = body;
    this.bestsEl = bestsEl;
  }

  render(entries, bestCombo, bestLines, highlightIndex = -1) {
    this.body.replaceChildren();
    if (!entries.length) {
      const row = this.body.insertRow();
      const cell = row.insertCell();
      cell.colSpan = 5;
      cell.className = 'records-empty';
      cell.textContent = 'Sin récords todavía';
    }
    entries.forEach((e, i) => {
      const row = this.body.insertRow();
      if (i === highlightIndex) row.className = 'highlight';
      // textContent evita inyectar HTML desde el nombre del jugador
      [i + 1, e.name, e.score.toLocaleString(), e.lines, e.combo]
        .forEach(v => { row.insertCell().textContent = v; });
    });
    this.bestsEl.textContent = `Mejor combo: ${bestCombo} · Líneas máx: ${bestLines}`;
  }
}

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const pauseMenu = document.getElementById('pause-menu');
const menuMain = document.getElementById('menu-main');
const menuControls = document.getElementById('menu-controls');
const startLevelSelect = document.getElementById('start-level');
const recordForm = document.getElementById('record-form');
const recordMsg = document.getElementById('record-msg');
const recordName = document.getElementById('record-name');
const recordsSection = document.getElementById('records');
const recordsResetBtn = document.getElementById('records-reset');

const records = new RecordStore();
const recordsView = new RecordsView(
  document.getElementById('records-body'),
  document.getElementById('records-bests'),
);

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
// combo: piezas consecutivas que limpian líneas tras la primera (-1 = sin cadena activa)
let combo, maxCombo;
// Puntuación de la partida terminada que entra en el top y aún no tiene nombre
let pendingRecord = null;
let startLevel = 1;

// Teclas físicamente pulsadas, y las que se ignoran hasta que se suelten
// (las que seguían pulsadas al cerrar el menú de pausa).
const heldKeys = new Set();
const lockedKeys = new Set();

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece() {
  const type = Math.floor(Math.random() * 7) + 1;
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (!cleared) {
    combo = -1;
  } else {
    combo++;
    maxCombo = Math.max(maxCombo, combo);
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = startLevel + Math.floor(lines / 10);
    dropInterval = dropIntervalFor(level);
    updateHUD();
  }
}

function dropIntervalFor(lvl) {
  return Math.max(100, 1000 - (lvl - 1) * 90);
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  merge();
  clearLines();
  spawn();
}

function spawn() {
  current = next;
  next = randomPiece();
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  // save/restore evita que shadowBlur, alpha, etc. de un skin se filtren al resto del dibujo
  context.save();
  context.globalAlpha = alpha ?? 1;
  currentSkin.drawBlock(context, x * size, y * size, size, currentSkin.colors[colorIndex]);
  context.restore();
}

function drawGrid() {
  ctx.strokeStyle = currentSkin.gridColor
    ?? getComputedStyle(document.documentElement).getPropertyValue('--grid');
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  if (!current) return; // pantalla de inicio: aún no hay pieza

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
}

function renderRecords(highlightIndex = -1) {
  if (pendingRecord) {
    recordsView.render(records.preview(pendingRecord), records.bestCombo, records.bestLines,
      records.rankFor(pendingRecord.score));
  } else {
    recordsView.render(records.entries, records.bestCombo, records.bestLines, highlightIndex);
  }
}

// Configura el overlay compartido por inicio, pausa y game over
function showOverlay(title, { scoreText = '', showRecords = false, buttonText = 'Reiniciar' } = {}) {
  overlayTitle.textContent = title;
  overlayTitle.classList.toggle('start', title === 'TETRIS');
  overlayScore.textContent = scoreText;
  recordsSection.hidden = !showRecords;
  recordForm.hidden = !pendingRecord;
  restartBtn.textContent = buttonText;
  overlay.classList.remove('hidden');
}

function showStartScreen() {
  board = createBoard();
  gameOver = true; // bloquea los controles hasta pulsar Jugar
  draw();
  renderRecords();
  showOverlay('TETRIS', { showRecords: true, buttonText: 'Jugar' });
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  records.registerGame(lines, maxCombo);
  if (records.qualifies(score)) {
    pendingRecord = { name: '', score, lines, combo: maxCombo };
    recordMsg.textContent = `¡Nuevo récord! Puesto #${records.rankFor(score) + 1}`;
  }
  renderRecords();
  showOverlay('GAME OVER', {
    scoreText: `Puntuación: ${score.toLocaleString()} · Líneas: ${lines} · Combo máx: ${maxCombo}`,
    showRecords: true,
  });
  if (pendingRecord) {
    recordName.value = loadLastName();
    recordName.focus();
    recordName.select();
  }
}

function savePendingRecord() {
  if (!pendingRecord) return;
  const name = RecordStore.cleanName(recordName.value);
  const rank = records.add({ ...pendingRecord, name });
  pendingRecord = null;
  saveLastName(name);
  recordForm.hidden = true;
  renderRecords(rank);
}

function loadLastName() {
  try { return localStorage.getItem('tetris-last-name') || ''; } catch (e) { return ''; }
}

function saveLastName(name) {
  try { localStorage.setItem('tetris-last-name', name); } catch (e) { /* almacenamiento no disponible */ }
}

function showMenuView(view) {
  menuMain.classList.toggle('hidden', view !== menuMain);
  menuControls.classList.toggle('hidden', view !== menuControls);
  view.querySelector('button').focus();
}

function openPauseMenu() {
  paused = true;
  cancelAnimationFrame(animId);
  pauseMenu.classList.remove('hidden');
  showMenuView(menuMain);
}

function closePauseMenu() {
  pauseMenu.classList.add('hidden');
  // Sin foco en un botón oculto, Space/Enter no pueden reactivarlo
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  // Lo que siga pulsado al volver no debe mover la pieza
  heldKeys.forEach(code => lockedKeys.add(code));
}

function resume() {
  closePauseMenu();
  paused = false;
  lastTime = performance.now();
  animId = requestAnimationFrame(loop);
}

function restart() {
  closePauseMenu();
  init();
}

function togglePause() {
  if (gameOver) return;
  if (paused) resume();
  else openPauseMenu();
}

function loop(ts) {
  const dt = ts - lastTime;
  lastTime = ts;
  dropAccum += dt;
  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
    }
  }
  draw();
  animId = requestAnimationFrame(loop);
}

function init() {
  savePendingRecord(); // no perder un récord si se reinicia sin pulsar Guardar
  board = createBoard();
  score = 0;
  lines = 0;
  level = startLevel;
  combo = -1;
  maxCombo = 0;
  paused = false;
  gameOver = false;
  dropInterval = dropIntervalFor(level);
  dropAccum = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  pauseMenu.classList.add('hidden');
  restartBtn.blur(); // evita que Enter reinicie la partida en curso
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

const skinSelect = document.getElementById('skin-select');
const GAME_KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space', 'KeyX', 'KeyP', 'Escape'];

document.addEventListener('keydown', e => {
  // si el selector de skin tiene el foco, las teclas del juego no deben cambiar su valor
  if (e.target === skinSelect && GAME_KEYS.includes(e.code)) {
    e.preventDefault();
    skinSelect.blur();
  }
  heldKeys.add(e.code);
  if (e.code === 'KeyP' || e.code === 'Escape') {
    e.preventDefault();
    if (e.repeat) return;
    // Esc dentro de "Ver controles" vuelve al menú en lugar de reanudar
    if (e.code === 'Escape' && paused && !menuControls.classList.contains('hidden')) {
      showMenuView(menuMain);
    } else {
      togglePause();
    }
    return;
  }
  // Con el menú abierto las teclas solo navegan por él (Tab/Enter/Space nativos)
  if (paused || gameOver || lockedKeys.has(e.code)) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

document.addEventListener('keyup', e => {
  heldKeys.delete(e.code);
  lockedKeys.delete(e.code);
});

// Si la ventana pierde el foco no recibiremos los keyup: se olvida todo
window.addEventListener('blur', () => {
  heldKeys.clear();
  lockedKeys.clear();
});

restartBtn.addEventListener('click', () => {
  restartBtn.blur(); // evita que Space/Enter vuelvan a pulsar el botón
  init();
});

recordForm.addEventListener('submit', e => {
  e.preventDefault();
  savePendingRecord();
  restartBtn.focus(); // Enter de nuevo reinicia la partida
});

recordsResetBtn.addEventListener('click', () => {
  recordsResetBtn.blur();
  if (!confirm('¿Borrar todos los récords?')) return;
  records.reset();
  if (pendingRecord) recordMsg.textContent = '¡Nuevo récord! Puesto #1';
  renderRecords();
});

const menuActions = {
  resume,
  restart,
  controls: () => showMenuView(menuControls),
  back: () => showMenuView(menuMain),
};

pauseMenu.addEventListener('click', e => {
  const btn = e.target.closest('[data-action]');
  if (btn) menuActions[btn.dataset.action]();
});

document.getElementById('menu-controls-list').replaceChildren(
  ...document.querySelector('.controls ul').cloneNode(true).children
);

for (let lvl = 1; lvl <= MAX_START_LEVEL; lvl++) {
  startLevelSelect.add(new Option(lvl, lvl));
}

startLevelSelect.addEventListener('change', () => {
  startLevel = Number(startLevelSelect.value);
  try { localStorage.setItem('startLevel', startLevel); } catch (e) { /* almacenamiento no disponible */ }
});

let savedLevel = null;
try { savedLevel = Number(localStorage.getItem('startLevel')); } catch (e) { /* ignorar */ }
if (Number.isInteger(savedLevel) && savedLevel >= 1 && savedLevel <= MAX_START_LEVEL) startLevel = savedLevel;
startLevelSelect.value = startLevel;

const themeBtn = document.getElementById('theme-btn');

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  themeBtn.textContent = theme === 'light' ? '🌙 Oscuro' : '☀️ Claro';
  try { localStorage.setItem('theme', theme); } catch (e) { /* almacenamiento no disponible */ }
}

themeBtn.addEventListener('click', () => {
  applyTheme(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light');
  draw();
  themeBtn.blur(); // evita que Space/Enter vuelvan a pulsar el botón
});

let savedTheme = null;
try { savedTheme = localStorage.getItem('theme'); } catch (e) { /* ignorar */ }
applyTheme(savedTheme === 'light' ? 'light' : 'dark');

for (const skin of SKINS) skinSelect.add(new Option(skin.name, skin.id));

function applySkin(id) {
  currentSkin = SKINS.find(s => s.id === id) ?? SKINS[0];
  document.documentElement.dataset.skin = currentSkin.id;
  skinSelect.value = currentSkin.id;
  try { localStorage.setItem('skin', currentSkin.id); } catch (e) { /* almacenamiento no disponible */ }
}

skinSelect.addEventListener('change', () => {
  applySkin(skinSelect.value);
  draw();
  drawNext();
  skinSelect.blur(); // devuelve el teclado al juego
});

let savedSkin = null;
try { savedSkin = localStorage.getItem('skin'); } catch (e) { /* ignorar */ }
applySkin(savedSkin);

showStartScreen();
