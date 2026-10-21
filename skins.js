'use strict';

/*
 * Skins (temas visuales) del Tetris.
 *
 * Patrón estrategia por objeto: todas las skins exponen la misma interfaz
 *   { name, colors, boardBg, gridColor, drawBlock(context, x, y, color, size, alpha) }
 * y game.js solo conoce esa interfaz, nunca la implementación concreta.
 *
 * - colors: índice 1–7 = tipo de pieza (I, O, T, S, Z, J, L); el índice 0 es null (celda vacía).
 * - drawBlock recibe el color ya resuelto (string) y coordenadas en celdas, no en píxeles.
 * - Cada drawBlock debe dejar el contexto como lo encontró (globalAlpha, sombras, etc.).
 */

// Traza un rectángulo con esquinas redondeadas usando arcTo
// (no se usa CanvasRenderingContext2D.roundRect para no depender de navegadores recientes).
function skinRoundedRectPath(context, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  context.beginPath();
  context.moveTo(x + radius, y);
  context.arcTo(x + w, y, x + w, y + h, radius);
  context.arcTo(x + w, y + h, x, y + h, radius);
  context.arcTo(x, y + h, x, y, radius);
  context.arcTo(x, y, x + w, y, radius);
  context.closePath();
}

const SKINS = {
  // Estilo original: bloques cuadrados, color plano y franja de brillo superior.
  retro: {
    name: 'Retro',
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
    boardBg: '#1a1a25',
    gridColor: '#22222e',
    drawBlock(context, x, y, color, size, alpha) {
      context.save();
      context.globalAlpha = alpha ?? 1;
      context.fillStyle = color;
      context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
      // highlight
      context.fillStyle = 'rgba(255,255,255,0.12)';
      context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
      context.restore();
    },
  },

  // Fondo negro y bloques con resplandor (shadowBlur). save/restore evita que
  // el glow se filtre a la grid o a otros dibujos posteriores.
  neon: {
    name: 'Neon',
    colors: [
      null,
      '#00f0ff', // I
      '#fff200', // O
      '#d400ff', // T
      '#39ff14', // S
      '#ff1744', // Z
      '#2979ff', // J
      '#ff9100', // L
    ],
    boardBg: '#000000',
    gridColor: '#0d0d16',
    drawBlock(context, x, y, color, size, alpha) {
      const a = alpha ?? 1;
      const px = x * size + 3;
      const py = y * size + 3;
      const s = size - 6;
      context.save();
      context.shadowColor = color;
      context.shadowBlur = size * 0.5;
      // relleno interior tenue
      context.globalAlpha = a * 0.25;
      context.fillStyle = color;
      context.fillRect(px, py, s, s);
      // contorno brillante
      context.globalAlpha = a;
      context.strokeStyle = color;
      context.lineWidth = 2;
      context.strokeRect(px, py, s, s);
      // núcleo claro para simular el tubo de neón
      context.shadowBlur = 0;
      context.globalAlpha = a * 0.6;
      context.strokeStyle = '#ffffff';
      context.lineWidth = 0.75;
      context.strokeRect(px + 2, py + 2, s - 4, s - 4);
      context.restore();
    },
  },

  // Colores suaves sobre un tablero claro, bloques con esquinas redondeadas.
  pastel: {
    name: 'Pastel',
    colors: [
      null,
      '#a0e7e5', // I
      '#fdf1a7', // O
      '#d7b9f0', // T
      '#b4f8c8', // S
      '#ffaebc', // Z
      '#a9c4f5', // J
      '#ffd3a5', // L
    ],
    boardBg: '#f7f2ec',
    gridColor: '#ebe3da',
    drawBlock(context, x, y, color, size, alpha) {
      const px = x * size + 2;
      const py = y * size + 2;
      const s = size - 4;
      const r = size * 0.25;
      context.save();
      context.globalAlpha = alpha ?? 1;
      skinRoundedRectPath(context, px, py, s, s, r);
      context.fillStyle = color;
      context.fill();
      // borde ligeramente más oscuro para que el bloque se distinga sobre fondo claro
      context.strokeStyle = 'rgba(0,0,0,0.12)';
      context.lineWidth = 1;
      context.stroke();
      // brillo interior en la mitad superior
      skinRoundedRectPath(context, px + 3, py + 3, s - 6, s * 0.4, r * 0.6);
      context.fillStyle = 'rgba(255,255,255,0.45)';
      context.fill();
      context.restore();
    },
  },

  // Bloques biselados con un patrón de píxeles claros/oscuros encima.
  pixel: {
    name: 'Pixel art',
    colors: [
      null,
      '#3ec6e0', // I
      '#f7d51d', // O
      '#a64ac9', // T
      '#4caf50', // S
      '#e53935', // Z
      '#3f51b5', // J
      '#fb8c00', // L
    ],
    boardBg: '#1b1b2f',
    gridColor: '#25253f',
    drawBlock(context, x, y, color, size, alpha) {
      const px = x * size;
      const py = y * size;
      // tamaño de "píxel": 1/10 del bloque, mínimo 1px, entero para bordes nítidos
      const u = Math.max(1, Math.floor(size / 10));
      context.save();
      context.globalAlpha = alpha ?? 1;
      // relleno base
      context.fillStyle = color;
      context.fillRect(px, py, size, size);
      // bisel: claro arriba/izquierda, oscuro abajo/derecha
      context.fillStyle = 'rgba(255,255,255,0.35)';
      context.fillRect(px, py, size, u);
      context.fillRect(px, py, u, size);
      context.fillStyle = 'rgba(0,0,0,0.35)';
      context.fillRect(px, py + size - u, size, u);
      context.fillRect(px + size - u, py, u, size);
      // contorno oscuro de 1px para separar bloques contiguos
      context.strokeStyle = 'rgba(0,0,0,0.5)';
      context.lineWidth = 1;
      context.strokeRect(px + 0.5, py + 0.5, size - 1, size - 1);
      // patrón 3x3 de píxeles en el interior (tonos claros y oscuros alternos)
      const pattern = [
        [1, 0, 0],
        [0, 0, -1],
        [0, -1, 0],
      ];
      const inner = size - 4 * u;
      const cell = Math.max(1, Math.floor(inner / 3));
      const startX = px + 2 * u;
      const startY = py + 2 * u;
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) {
          const tone = pattern[r][c];
          if (!tone) continue;
          context.fillStyle = tone > 0 ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.22)';
          context.fillRect(startX + c * cell + u, startY + r * cell + u, u * 2, u * 2);
        }
      }
      context.restore();
    },
  },
};

const DEFAULT_SKIN = 'retro';
