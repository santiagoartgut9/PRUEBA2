'use strict';

// Menú de pausa. Se carga DESPUÉS de game.js y usa su estado global
// (paused, gameOver, startLevel) y sus funciones (setPaused, init,
// setStartLevel). Va dentro de una IIFE para no chocar con los nombres
// globales de game.js (p. ej. restartBtn).
(function () {
  const menu = document.getElementById('pause-menu');
  const resumeBtn = document.getElementById('pm-resume');
  const restartBtn = document.getElementById('pm-restart');
  const controlsBtn = document.getElementById('pm-controls-btn');
  const controlsList = document.getElementById('pm-controls');
  const levelSelect = document.getElementById('pm-start-level');

  // Opciones del selector de nivel inicial.
  for (let n = MIN_START_LEVEL; n <= MAX_START_LEVEL; n++) {
    const opt = document.createElement('option');
    opt.value = String(n);
    opt.textContent = String(n);
    levelSelect.appendChild(opt);
  }

  function isOpen() {
    return !menu.classList.contains('hidden');
  }

  function setControlsVisible(visible) {
    controlsList.classList.toggle('hidden', !visible);
    controlsBtn.setAttribute('aria-expanded', String(visible));
    controlsBtn.textContent = visible ? 'Ocultar controles' : 'Ver controles';
  }

  function open() {
    if (gameOver || paused) return;
    setPaused(true);
    levelSelect.value = String(startLevel);
    setControlsVisible(false);
    menu.classList.remove('hidden');
    resumeBtn.focus();
  }

  // Oculta el menú y quita el foco de sus controles: así Space/Enter ya no
  // pueden activar un botón oculto durante la partida.
  function hide() {
    if (menu.contains(document.activeElement)) document.activeElement.blur();
    menu.classList.add('hidden');
  }

  function resume() {
    if (!isOpen()) return;
    hide();
    setPaused(false);
  }

  function restart() {
    hide();
    init();
  }

  resumeBtn.addEventListener('click', resume);
  restartBtn.addEventListener('click', restart);
  controlsBtn.addEventListener('click', () => {
    setControlsVisible(controlsList.classList.contains('hidden'));
  });
  levelSelect.addEventListener('change', () => {
    setStartLevel(parseInt(levelSelect.value, 10));
  });

  document.addEventListener('keydown', e => {
    if (e.code === 'KeyP' || e.code === 'Escape') {
      // Mantener P/Esc no debe abrir y cerrar el menú en bucle.
      if (e.repeat) return;
      // Esc sobre el <select> sirve para cerrar su lista, no para reanudar.
      if (e.code === 'Escape' && e.target === levelSelect) return;
      if (isOpen()) {
        e.preventDefault();
        resume();
      } else if (!gameOver) {
        e.preventDefault();
        open();
      }
      return;
    }

    if (!isOpen()) return;

    // Focus trap: Tab/Shift+Tab circulan solo por los controles del menú.
    if (e.key === 'Tab') {
      const focusables = [resumeBtn, restartBtn, controlsBtn, levelSelect];
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const inside = menu.contains(document.activeElement);
      if (e.shiftKey && (!inside || document.activeElement === first)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (!inside || document.activeElement === last)) {
        e.preventDefault();
        first.focus();
      }
      return;
    }

    if (!GAME_KEYS.has(e.code)) return;
    // Menú abierto: game.js ya ignora la tecla (paused). Aquí solo evitamos el
    // scroll de la página, salvo cuando la tecla tiene una función legítima en
    // el control enfocado: flechas en el <select> y Space sobre un botón.
    const target = e.target;
    if (target === levelSelect) return;
    if (e.code === 'Space' && target instanceof HTMLButtonElement && menu.contains(target)) return;
    e.preventDefault();
  });
})();
