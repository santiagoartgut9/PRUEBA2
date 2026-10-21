'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

// Los colores y la forma de dibujar cada bloque los define la skin activa (skins.js).
const SKIN_STORAGE_KEY = 'tetris.skin';

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

// Teclas que mueven la pieza (también las usa pause-menu.js para bloquearlas).
const GAME_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyX', 'Space']);

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
const skinSelect = document.getElementById('skin-select');

let activeSkin = SKINS[DEFAULT_SKIN];
let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;

// Tras reanudar/reiniciar se ignoran los keydown con e.repeat hasta que llegue
// una pulsación nueva, para que una tecla mantenida no mueva la pieza.
let ignoreRepeat = false;

// ---- Nivel inicial (persistido en localStorage) ----
const START_LEVEL_KEY = 'tetris.startLevel';
const MIN_START_LEVEL = 1;
const MAX_START_LEVEL = 10;

function clampStartLevel(n) {
  if (!Number.isFinite(n)) return MIN_START_LEVEL;
  return Math.min(MAX_START_LEVEL, Math.max(MIN_START_LEVEL, Math.trunc(n)));
}

function loadStartLevel() {
  try {
    return clampStartLevel(parseInt(localStorage.getItem(START_LEVEL_KEY), 10));
  } catch (_) {
    return MIN_START_LEVEL;
  }
}

// Cambia el nivel con el que empezará la PRÓXIMA partida (se aplica en init()).
function setStartLevel(n) {
  startLevel = clampStartLevel(n);
  try {
    localStorage.setItem(START_LEVEL_KEY, String(startLevel));
  } catch (_) {
    // Sin almacenamiento disponible: el valor vale solo para esta sesión.
  }
}

let startLevel = loadStartLevel();
// Copia de startLevel tomada en init(): cambiar el selector a mitad de partida
// no debe alterar el nivel de la partida en curso.
let startLevelOfGame = startLevel;

function computeDropInterval(lvl) {
  return Math.max(100, 1000 - (lvl - 1) * 90);
}

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
    level = startLevelOfGame + Math.floor(lines / 10);
    dropInterval = computeDropInterval(level);
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
  // Delegación en la estrategia de la skin activa
  activeSkin.drawBlock(context, x, y, activeSkin.colors[colorIndex], size, alpha);
}

// Lee una variable CSS del tema activo (claro/oscuro)
function themeColor(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

// Pinta el fondo del canvas con el color de la skin; si la skin no define uno
// (boardBg null), usa el del tema para que siga el modo claro/oscuro.
function fillBackground(context, target) {
  context.fillStyle = activeSkin.boardBg ?? themeColor('--surface');
  context.fillRect(0, 0, target.width, target.height);
}

function drawGrid() {
  ctx.strokeStyle = activeSkin.gridColor ?? themeColor('--grid');
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
  fillBackground(ctx, canvas);
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
  fillBackground(nextCtx, nextCanvas);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
}

// ---- Skins ----

function loadSkinId() {
  try {
    return localStorage.getItem(SKIN_STORAGE_KEY);
  } catch (err) {
    return null; // almacenamiento bloqueado (modo privado, políticas, etc.)
  }
}

function saveSkinId(id) {
  try {
    localStorage.setItem(SKIN_STORAGE_KEY, id);
  } catch (err) {
    // sin persistencia: la skin se aplica igualmente en esta sesión
  }
}

// Cambia la skin sin recargar: valida el id, persiste la preferencia y redibuja al momento
// (también en pausa o game over, cuando el bucle de animación está detenido).
function applySkin(id) {
  const skinId = Object.prototype.hasOwnProperty.call(SKINS, id) ? id : DEFAULT_SKIN;
  activeSkin = SKINS[skinId];
  saveSkinId(skinId);
  document.body.dataset.skin = skinId;
  if (skinSelect && skinSelect.value !== skinId) skinSelect.value = skinId;
  if (board && current) draw();
  if (next) drawNext();
}

function initSkinSelector() {
  if (!skinSelect) return;
  // Opciones generadas desde SKINS: añadir una skin nueva no requiere tocar el HTML
  skinSelect.innerHTML = '';
  for (const [id, skin] of Object.entries(SKINS)) {
    const option = document.createElement('option');
    option.value = id;
    option.textContent = skin.name;
    skinSelect.appendChild(option);
  }
  skinSelect.addEventListener('change', () => {
    applySkin(skinSelect.value);
    // Devolver el foco al documento para que las flechas controlen el juego y no el select
    skinSelect.blur();
  });
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlay.classList.remove('hidden');
}

// Pausa/reanuda solo el bucle del juego. La interfaz del menú de pausa vive en
// pause-menu.js, que llama a esta función.
function setPaused(value) {
  if (gameOver || paused === value) return;
  paused = value;
  cancelAnimationFrame(animId);
  if (!paused) {
    // Reanudar sin "saltos": al reiniciar lastTime, el tiempo en pausa no cuenta
    // para la caída. dropAccum se conserva a propósito: ponerlo a 0 permitiría
    // congelar la pieza pausando/reanudando antes de cada caída.
    lastTime = performance.now();
    ignoreRepeat = true;
    animId = requestAnimationFrame(loop);
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
      // Si el spawn provocó game over, no reprogramar el bucle (endGame ya lo canceló).
      if (gameOver) return;
    }
  }
  draw();
  animId = requestAnimationFrame(loop);
}

function init() {
  board = createBoard();
  score = 0;
  lines = 0;
  startLevelOfGame = startLevel;
  level = startLevelOfGame;
  paused = false;
  gameOver = false;
  dropInterval = computeDropInterval(level);
  dropAccum = 0;
  ignoreRepeat = true;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  // Mientras el selector de skin tenga el foco, las teclas son para él, no para el juego
  if (e.target === skinSelect) return;
  // P/Escape los gestiona pause-menu.js. Con el menú abierto (paused) se
  // ignoran todas las teclas de juego.
  if (paused || gameOver) return;
  if (ignoreRepeat && GAME_KEYS.has(e.code)) {
    if (e.repeat) {
      e.preventDefault();
      return;
    }
    // Solo una pulsación nueva de una tecla de juego desactiva el filtro.
    ignoreRepeat = false;
  }
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
  // El canvas no lee el CSS solo: hay que repintar tablero y "next" con los colores nuevos
  draw();
  drawNext();
  themeBtn.blur(); // evita que Space/Enter vuelvan a pulsar el botón
});

let savedTheme = null;
try { savedTheme = localStorage.getItem('theme'); } catch (e) { /* ignorar */ }
applyTheme(savedTheme === 'light' ? 'light' : 'dark');

initSkinSelector();
applySkin(loadSkinId());
init();
