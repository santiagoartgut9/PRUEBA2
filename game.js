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

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;

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
  if (cleared) {
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

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlay.classList.remove('hidden');
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    overlay.classList.remove('hidden');
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
  board = createBoard();
  score = 0;
  lines = 0;
  level = 1;
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

const skinSelect = document.getElementById('skin-select');
const GAME_KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space', 'KeyX', 'KeyP'];

document.addEventListener('keydown', e => {
  // si el selector de skin tiene el foco, las teclas del juego no deben cambiar su valor
  if (e.target === skinSelect && GAME_KEYS.includes(e.code)) {
    e.preventDefault();
    skinSelect.blur();
  }
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

restartBtn.addEventListener('click', init);

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

init();
