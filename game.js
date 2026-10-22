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
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    updateHUD();
  }
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
  const color = COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  context.globalAlpha = 1;
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

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    overlay.classList.add('hidden');
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    showOverlay('PAUSA');
  }
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
  level = 1;
  combo = -1;
  maxCombo = 0;
  paused = false;
  gameOver = false;
  dropInterval = 1000;
  dropAccum = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (e.code === 'KeyP') { togglePause(); return; }
  if (paused || gameOver) return;
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

showStartScreen();
