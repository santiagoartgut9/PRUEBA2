'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

// Traza un rectángulo con esquinas redondeadas usando arcTo (compatible con navegadores sin roundRect)
function roundedRectPath(context, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + w, y, x + w, y + h, r);
  context.arcTo(x + w, y + h, x, y + h, r);
  context.arcTo(x, y + h, x, y, r);
  context.arcTo(x, y, x + w, y, r);
  context.closePath();
}

// Textura de la skin pixel art: 0 = color base, 1 = brillo, 2 = sombra
const PIXEL_PATTERN = [
  '1111110',
  '1000002',
  '1010002',
  '1000002',
  '1000202',
  '1000002',
  '0222222',
];

// Cada skin define su paleta (índice = tipo de pieza) y cómo pintar un bloque.
// draw() recibe coordenadas en píxeles; drawBlock() envuelve la llamada en save/restore,
// así una skin puede tocar shadowBlur, globalAlpha, etc. sin afectar a las demás.
const SKINS = {
  retro: {
    label: 'Retro',
    colors: [
      null,
      '#4dd0e1', // I - cyan
      '#ffd54f', // O - yellow
      '#ba68c8', // T - purple
      '#81c784', // S - green
      '#e57373', // Z - red
      '#7986cb', // J - indigo
      '#ffb74d', // L - orange
    ],
    draw(context, px, py, size, color) {
      context.fillStyle = color;
      context.fillRect(px + 1, py + 1, size - 2, size - 2);
      // highlight
      context.fillStyle = 'rgba(255,255,255,0.12)';
      context.fillRect(px + 1, py + 1, size - 2, 4);
    },
  },
  neon: {
    label: 'Neon',
    colors: [null, '#00f0ff', '#fff200', '#ff00ff', '#39ff14', '#ff0040', '#3d7bff', '#ff8c00'],
    draw(context, px, py, size, color) {
      context.shadowColor = color;
      context.shadowBlur = size * 0.5;
      context.strokeStyle = color;
      context.lineWidth = 2;
      context.strokeRect(px + 3, py + 3, size - 6, size - 6);
      // relleno tenue sin glow
      context.shadowBlur = 0;
      context.globalAlpha *= 0.25;
      context.fillStyle = color;
      context.fillRect(px + 4, py + 4, size - 8, size - 8);
    },
  },
  pastel: {
    label: 'Pastel',
    colors: [null, '#a0e7e5', '#fdfd96', '#d7b4f3', '#b4f8c8', '#ffaebc', '#aec6ff', '#ffd8a8'],
    draw(context, px, py, size, color) {
      const r = size * 0.25;
      roundedRectPath(context, px + 2, py + 2, size - 4, size - 4, r);
      context.fillStyle = color;
      context.fill();
      context.strokeStyle = 'rgba(0,0,0,0.12)';
      context.lineWidth = 1;
      context.stroke();
      // brillo superior
      roundedRectPath(context, px + 5, py + 5, size - 10, (size - 10) * 0.35, r / 2);
      context.fillStyle = 'rgba(255,255,255,0.45)';
      context.fill();
    },
  },
  pixel: {
    label: 'Pixel art',
    colors: [null, '#00bcd4', '#ffeb3b', '#9c27b0', '#4caf50', '#f44336', '#3f51b5', '#ff9800'],
    draw(context, px, py, size, color) {
      context.fillStyle = color;
      context.fillRect(px + 1, py + 1, size - 2, size - 2);
      const n = PIXEL_PATTERN.length;
      const p = (size - 2) / n;
      for (let r = 0; r < n; r++) {
        for (let c = 0; c < n; c++) {
          const cell = PIXEL_PATTERN[r][c];
          if (cell === '0') continue;
          context.fillStyle = cell === '1' ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.3)';
          context.fillRect(Math.round(px + 1 + c * p), Math.round(py + 1 + r * p), Math.ceil(p), Math.ceil(p));
        }
      }
    },
  },
};

let skin = SKINS.retro;

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

const RECORDS_KEY = 'tetris-records';
const PLAYER_KEY = 'tetris-player';
const MAX_RECORDS = 5;
const NAME_MAX = 12;
const DEFAULT_NAME = 'Jugador';

function toCount(value) {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

function cleanName(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);
}

// Persistencia de récords en localStorage: top de puntuaciones y mejores marcas globales
class RecordStore {
  constructor(key, max) {
    this.key = key;
    this.max = max;
    this.data = this.load();
  }

  static empty() {
    return { scores: [], bestCombo: 0, maxLines: 0 };
  }

  load() {
    try {
      const raw = JSON.parse(localStorage.getItem(this.key));
      if (!raw || typeof raw !== 'object') return RecordStore.empty();
      // los datos vienen del navegador del usuario: se validan antes de usarlos
      const scores = (Array.isArray(raw.scores) ? raw.scores : [])
        .filter(s => s && typeof s === 'object' && toCount(s.score) > 0)
        .map(s => ({
          name: cleanName(s.name) || DEFAULT_NAME,
          score: toCount(s.score),
          lines: toCount(s.lines),
          combo: toCount(s.combo),
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, this.max);
      return { scores, bestCombo: toCount(raw.bestCombo), maxLines: toCount(raw.maxLines) };
    } catch (e) {
      return RecordStore.empty();
    }
  }

  save() {
    try { localStorage.setItem(this.key, JSON.stringify(this.data)); } catch (e) { /* almacenamiento no disponible */ }
  }

  // Posición (desde 0) que ocuparía la puntuación, o -1 si no entra en el top
  rankOf(score) {
    if (score <= 0) return -1;
    const i = this.data.scores.findIndex(s => score > s.score);
    if (i !== -1) return i;
    return this.data.scores.length < this.max ? this.data.scores.length : -1;
  }

  add(entry) {
    const i = this.rankOf(entry.score);
    if (i === -1) return -1;
    this.data.scores.splice(i, 0, entry);
    this.data.scores = this.data.scores.slice(0, this.max);
    this.save();
    return i;
  }

  // Actualiza mejor combo y líneas máximas; devuelve qué marcas se han superado
  updateStats(combo, lines) {
    const beaten = { combo: combo > this.data.bestCombo, lines: lines > this.data.maxLines };
    if (beaten.combo) this.data.bestCombo = combo;
    if (beaten.lines) this.data.maxLines = lines;
    if (beaten.combo || beaten.lines) this.save();
    return beaten;
  }

  reset() {
    this.data = RecordStore.empty();
    try { localStorage.removeItem(this.key); } catch (e) { /* almacenamiento no disponible */ }
  }
}

const records = new RecordStore(RECORDS_KEY, MAX_RECORDS);

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const comboEl = document.getElementById('combo');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const pauseMenu = document.getElementById('pause-menu');
const menuMain = document.getElementById('menu-main');
const menuControls = document.getElementById('menu-controls');
const startLevelSelect = document.getElementById('start-level');
const newRecordEl = document.getElementById('new-record');
const nameForm = document.getElementById('name-form');
const nameInput = document.getElementById('name-input');
const recordsEl = document.getElementById('records');
const recordsBody = document.getElementById('records-body');
const bestComboEl = document.getElementById('best-combo');
const maxLinesEl = document.getElementById('max-lines');
const bestComboStat = document.getElementById('best-combo-stat');
const maxLinesStat = document.getElementById('max-lines-stat');
const resetRecordsBtn = document.getElementById('reset-records-btn');

let board, current, next, score, lines, level, combo, maxCombo, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
let startLevel = 1;
let started = false;
// partida terminada que entra en el top y aún no tiene nombre guardado
let pendingRecord = null;
let highlightRank = -1;
let beatenStats = { combo: false, lines: false };

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
  // combo: piezas consecutivas que limpian al menos una línea
  combo = cleared ? combo + 1 : 0;
  maxCombo = Math.max(maxCombo, combo);
  if (cleared) {
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = startLevel + Math.floor(lines / 10);
    dropInterval = dropIntervalFor(level);
  }
  updateHUD(); // también al romperse el combo
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
  comboEl.textContent = combo;
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  context.save();
  context.globalAlpha = alpha ?? 1;
  skin.draw(context, x * size, y * size, size, skin.colors[colorIndex]);
  context.restore();
}

function drawGrid() {
  ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--grid');
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

function addCell(row, text, className) {
  const td = document.createElement('td');
  td.textContent = text; // textContent: el nombre lo escribe el usuario
  if (className) td.className = className;
  row.appendChild(td);
}

function renderRecords() {
  const list = records.data.scores.slice();
  if (pendingRecord) {
    list.splice(highlightRank, 0, { ...pendingRecord, name: cleanName(nameInput.value) || DEFAULT_NAME });
  }
  recordsBody.replaceChildren();
  list.slice(0, MAX_RECORDS).forEach((entry, i) => {
    const row = document.createElement('tr');
    if (i === highlightRank) row.className = 'highlight';
    addCell(row, i + 1);
    addCell(row, entry.name);
    addCell(row, entry.score.toLocaleString());
    addCell(row, entry.lines);
    addCell(row, entry.combo);
    recordsBody.appendChild(row);
  });
  if (!list.length) {
    const row = document.createElement('tr');
    addCell(row, 'Sin récords todavía', 'empty');
    row.firstChild.colSpan = 5;
    recordsBody.appendChild(row);
  }
  bestComboEl.textContent = records.data.bestCombo;
  maxLinesEl.textContent = records.data.maxLines;
  bestComboStat.classList.toggle('highlight', beatenStats.combo);
  maxLinesStat.classList.toggle('highlight', beatenStats.lines);
}

function renderNewRecordMessage() {
  const msgs = [];
  if (highlightRank !== -1) msgs.push(`¡Nuevo récord! Puesto #${highlightRank + 1}`);
  if (beatenStats.combo) msgs.push('¡Mejor combo!');
  if (beatenStats.lines) msgs.push('¡Máximo de líneas!');
  newRecordEl.textContent = msgs.join(' · ');
  newRecordEl.classList.toggle('hidden', !msgs.length);
}

// mode: 'start' | 'gameover' (la pausa tiene su propio menú: #pause-menu)
function showOverlay(mode, title, text) {
  overlayTitle.textContent = title;
  overlayScore.textContent = text;
  overlay.classList.toggle('start', mode === 'start');
  recordsEl.classList.remove('hidden');
  nameForm.classList.toggle('hidden', mode !== 'gameover' || !pendingRecord);
  renderNewRecordMessage();
  renderRecords();
  restartBtn.textContent = mode === 'start' ? 'Jugar' : 'Reiniciar';
  overlay.classList.remove('hidden');
}

function showStartScreen() {
  showOverlay('start', 'TETRIS', '');
  restartBtn.focus();
}

function savePendingRecord() {
  if (!pendingRecord) return;
  const name = cleanName(nameInput.value) || DEFAULT_NAME;
  highlightRank = records.add({ ...pendingRecord, name });
  pendingRecord = null;
  try { localStorage.setItem(PLAYER_KEY, name); } catch (e) { /* almacenamiento no disponible */ }
  nameForm.classList.add('hidden');
  renderRecords();
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  beatenStats = records.updateStats(maxCombo, lines);
  highlightRank = records.rankOf(score);
  pendingRecord = highlightRank === -1 ? null : { score, lines, combo: maxCombo };
  showOverlay('gameover', 'GAME OVER', `Puntuación: ${score.toLocaleString()}`);
  if (pendingRecord) {
    nameInput.focus();
    nameInput.select();
  }
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
  if (gameOver) return; // endGame() puede ejecutarse dentro de este mismo frame
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
  if (gameOver) return;
  animId = requestAnimationFrame(loop);
}

function resetState() {
  board = createBoard();
  score = 0;
  lines = 0;
  level = startLevel;
  combo = 0;
  maxCombo = 0;
  paused = false;
  gameOver = false;
  dropInterval = dropIntervalFor(level);
  dropAccum = 0;
  next = randomPiece();
  spawn();
  updateHUD();
}

function init() {
  savePendingRecord(); // si no pulsó Guardar, el récord se guarda con el nombre escrito
  resetState();
  started = true;
  highlightRank = -1;
  beatenStats = { combo: false, lines: false };
  overlay.classList.add('hidden');
  pauseMenu.classList.add('hidden');
  restartBtn.blur();
  lastTime = performance.now();
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  heldKeys.add(e.code);
  if (e.target === skinSelect) return; // las flechas y letras cambian la opción del selector, no la pieza
  // Antes de pulsar "Jugar" y mientras se escribe el nombre del récord, el teclado no es del juego
  if (!started || e.target === nameInput) return;
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

restartBtn.addEventListener('click', init);

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

nameForm.addEventListener('submit', e => {
  e.preventDefault();
  savePendingRecord();
  restartBtn.focus();
});

nameInput.addEventListener('input', renderRecords);

resetRecordsBtn.addEventListener('click', () => {
  if (!confirm('¿Borrar todos los récords?')) return;
  records.reset();
  beatenStats = { combo: false, lines: false };
  // una partida pendiente de guardar puede seguir entrando en el top vacío
  highlightRank = pendingRecord ? records.rankOf(pendingRecord.score) : -1;
  renderNewRecordMessage();
  renderRecords();
});

try { nameInput.value = cleanName(localStorage.getItem(PLAYER_KEY)); } catch (e) { /* ignorar */ }

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

const skinSelect = document.getElementById('skin-select');

for (const [name, s] of Object.entries(SKINS)) {
  skinSelect.add(new Option(s.label, name));
}

function applySkin(name) {
  skin = SKINS[name];
  document.documentElement.dataset.skin = name;
  skinSelect.value = name;
  try { localStorage.setItem('skin', name); } catch (e) { /* almacenamiento no disponible */ }
}

skinSelect.addEventListener('change', () => {
  applySkin(skinSelect.value);
  draw();
  drawNext();
  skinSelect.blur(); // devuelve el teclado al juego
});

let savedSkin = null;
try { savedSkin = localStorage.getItem('skin'); } catch (e) { /* ignorar */ }
applySkin(Object.hasOwn(SKINS, savedSkin ?? '') ? savedSkin : 'retro');

resetState();
draw();
showStartScreen();
