'use strict';

/*
 * Tabla de records local (Top 5) persistida en localStorage.
 *
 * - `Records`: modelo/persistencia, sin dependencias del DOM.
 * - `RecordsView` (IIFE): render y flujo de UI (pantalla de inicio y game over).
 *
 * Se carga después de game.js y se comunica con él mediante los eventos
 * `tetris:start` y `tetris:gameover`. Para no duplicar el overlay reutiliza sus
 * elementos (`overlay`, `overlayTitle`, `overlayScore`, `restartBtn`) y la
 * función `init()` (a través del click de `restartBtn`).
 */

const Records = {
  KEY: 'tetris.records',
  LAST_NAME_KEY: 'tetris.lastName',
  MAX: 5,
  NAME_MAX: 12,
  DEFAULT_NAME: 'Anónimo',

  // Normaliza una entrada (leída o nueva); devuelve null si no es válida
  sanitize(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const score = Number(raw.score);
    if (!Number.isFinite(score) || score < 0) return null;
    const toInt = v => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Math.floor(Number(v)) : 0);
    const validDate = typeof raw.date === 'string' && !Number.isNaN(Date.parse(raw.date));
    return {
      name: String(raw.name ?? '').trim().slice(0, this.NAME_MAX) || this.DEFAULT_NAME,
      score: Math.floor(score),
      lines: toInt(raw.lines),
      maxCombo: toInt(raw.maxCombo),
      date: validDate ? raw.date : '',
    };
  },

  // Lee la lista ordenada por puntuación desc; tolerante a JSON corrupto
  load() {
    try {
      const parsed = JSON.parse(localStorage.getItem(this.KEY) || '[]');
      if (!Array.isArray(parsed)) return [];
      return parsed
        .map(e => this.sanitize(e))
        .filter(Boolean)
        .sort((a, b) => b.score - a.score)
        .slice(0, this.MAX);
    } catch (err) {
      return [];
    }
  },

  // Devuelve true si se ha podido persistir
  save(list) {
    try {
      localStorage.setItem(this.KEY, JSON.stringify(list.slice(0, this.MAX)));
      return true;
    } catch (err) {
      return false;
    }
  },

  // Calcula (sin persistir) cómo quedaría la tabla con la entrada nueva.
  // Única fuente de la regla "entra en el top": score > 0 y, con la tabla llena,
  // superar al último (ante empate la entrada nueva queda detrás: sort estable).
  // Devuelve { list, index, entry } con index -1 si no entra.
  insert(list, data) {
    const entry = this.sanitize({ ...data, date: new Date().toISOString() });
    if (!entry || !(entry.score > 0)) return { list, index: -1, entry };
    const next = [...list, entry].sort((a, b) => b.score - a.score).slice(0, this.MAX);
    return { list: next, index: next.indexOf(entry), entry };
  },

  qualifies(score, list = this.load()) {
    return this.insert(list, { score }).index !== -1;
  },

  // Inserta y persiste. Devuelve { list, index, saved }
  add(data, list = this.load()) {
    const result = this.insert(list, data);
    if (result.index === -1) return { list, index: -1, saved: false };
    return { list: result.list, index: result.index, saved: this.save(result.list) };
  },

  reset() {
    try {
      localStorage.removeItem(this.KEY);
    } catch (err) {
      // Sin acceso a localStorage: no hay nada que borrar
    }
  },

  // Mejores marcas históricas sobre las entradas guardadas
  best(list = this.load()) {
    return list.reduce(
      (acc, e) => ({
        maxCombo: Math.max(acc.maxCombo, e.maxCombo),
        maxLines: Math.max(acc.maxLines, e.lines),
      }),
      { maxCombo: 0, maxLines: 0 }
    );
  },

  getLastName() {
    try {
      return localStorage.getItem(this.LAST_NAME_KEY) || '';
    } catch (err) {
      return '';
    }
  },

  setLastName(name) {
    try {
      localStorage.setItem(this.LAST_NAME_KEY, name);
    } catch (err) {
      // Ignorado: recordar el nombre es solo una comodidad
    }
  },
};

const RecordsView = (() => {
  const panel = document.getElementById('records');
  const statsEl = document.getElementById('records-stats');
  const form = document.getElementById('records-form');
  const formLabel = document.getElementById('records-form-label');
  const nameInput = document.getElementById('records-name');
  const tbody = document.getElementById('records-body');
  const bestEl = document.getElementById('records-best');
  const resetBtn = document.getElementById('records-reset');

  nameInput.maxLength = Records.NAME_MAX;

  // Última partida terminada ({ score, lines, maxCombo }) mientras se muestra su
  // game over; `saved` indica si ya se ha guardado en la tabla
  let lastGame = null;
  let saved = false;
  // Índice de la fila a resaltar en la tabla (-1 = ninguna)
  let highlight = -1;

  function cell(text, className) {
    const td = document.createElement('td');
    td.textContent = text; // textContent: el nombre del usuario nunca se interpreta como HTML
    if (className) td.className = className;
    return td;
  }

  function renderTable(list) {
    tbody.replaceChildren();
    if (list.length === 0) {
      const tr = document.createElement('tr');
      const td = cell('Sin records todavía', 'empty');
      td.colSpan = 5;
      tr.appendChild(td);
      tbody.appendChild(tr);
    } else {
      list.forEach((e, i) => {
        const tr = document.createElement('tr');
        if (i === highlight) tr.className = 'is-new';
        if (e.date) tr.title = new Date(e.date).toLocaleString();
        tr.append(
          cell(String(i + 1), 'num'),
          cell(e.name, 'name'),
          cell(e.score.toLocaleString(), 'num'),
          cell(String(e.lines), 'num'),
          cell(String(e.maxCombo), 'num')
        );
        tbody.appendChild(tr);
      });
    }
    const best = Records.best(list);
    bestEl.textContent = `Mejor combo: ${best.maxCombo} · Líneas máx.: ${best.maxLines}`;
  }

  // Muestra el formulario de nombre si la última partida entra en el top y aún no se guardó
  function updateForm(list) {
    const rank = lastGame && !saved ? Records.insert(list, lastGame).index : -1;
    if (rank === -1) {
      form.classList.add('hidden');
      return false;
    }
    formLabel.textContent = `¡Nuevo récord! Entras en el top en el puesto #${rank + 1}`;
    form.classList.remove('hidden');
    return true;
  }

  function showStart() {
    lastGame = null;
    highlight = -1;
    overlay.dataset.mode = 'start';
    overlayTitle.textContent = 'TETRIS';
    overlayScore.textContent = '';
    statsEl.textContent = '';
    restartBtn.textContent = 'Jugar';
    const list = Records.load();
    updateForm(list);
    renderTable(list);
    panel.classList.remove('hidden');
    overlay.classList.remove('hidden');
  }

  function onGameOver(e) {
    const { score, lines, maxCombo } = e.detail;
    lastGame = { score, lines, maxCombo };
    saved = false;
    highlight = -1;
    overlay.dataset.mode = 'gameover';
    restartBtn.textContent = 'Reiniciar';
    statsEl.textContent = `Líneas: ${lines} · Combo máx.: ${maxCombo}`;

    const list = Records.load();
    const qualifies = updateForm(list);
    renderTable(list);
    panel.classList.remove('hidden');
    if (qualifies) {
      nameInput.value = Records.getLastName();
      nameInput.focus();
      nameInput.select();
    }
  }

  function onSubmit(e) {
    e.preventDefault();
    if (!lastGame || saved) return;
    const result = Records.add({ ...lastGame, name: nameInput.value });
    if (result.index === -1) return;
    Records.setLastName(Records.sanitize({ name: nameInput.value, score: 0 }).name);
    saved = true;
    highlight = result.index;
    form.classList.add('hidden');
    nameInput.blur();
    renderTable(result.list);
    if (!result.saved) {
      statsEl.textContent = 'No se pudo guardar: el almacenamiento local no está disponible';
    }
  }

  function onReset() {
    if (!confirm('¿Seguro que quieres borrar todos los records?')) return;
    Records.reset();
    highlight = -1;
    // Con la tabla vacía, una partida terminada y no guardada puede entrar ahora
    if (lastGame) saved = false;
    updateForm([]);
    renderTable([]);
  }

  // Al empezar partida se oculta el panel para que la pausa muestre el overlay limpio
  function onStart() {
    lastGame = null;
    delete overlay.dataset.mode;
    restartBtn.textContent = 'Reiniciar';
    form.classList.add('hidden');
    panel.classList.add('hidden');
  }

  form.addEventListener('submit', onSubmit);
  resetBtn.addEventListener('click', onReset);
  document.addEventListener('tetris:gameover', onGameOver);
  document.addEventListener('tetris:start', onStart);

  return { showStart };
})();

// Pantalla de inicio: la partida arranca al pulsar "Jugar" (restartBtn -> init)
RecordsView.showStart();
