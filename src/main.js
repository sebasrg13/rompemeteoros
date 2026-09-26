/* main.js — arranque seguro: detección de WebGL, errores globales y pantalla de error visible (nunca pantalla negra) */
(function (BB) {
  'use strict';

  window.addEventListener('error', (e) => { BB.reportError('window', e.error || e.message); });
  window.addEventListener('unhandledrejection', (e) => { BB.reportError('promise', e.reason); });

  function hasWebGL() {
    try {
      const c = document.createElement('canvas');
      return !!(c.getContext('webgl2') || c.getContext('webgl') || c.getContext('experimental-webgl'));
    } catch (e) { return false; }
  }

  function fail(title, msg) {
    const el = document.getElementById('s-error');
    for (const s of document.querySelectorAll('.scr,.view')) s.hidden = true;
    if (el) {
      el.hidden = false;
      if (title) document.getElementById('err-title').textContent = title;
      if (msg) document.getElementById('err-msg').textContent = msg;
      const b = document.getElementById('err-retry');
      if (b) b.onclick = () => window.location.reload();
    }
  }

  async function start() {
    const canvas = document.getElementById('gl');
    if (!hasWebGL()) {
      fail('Gráficos 3D no disponibles', 'Este navegador no ofrece WebGL. Actualizá Safari o Chrome, o activá la aceleración por hardware, y volvé a intentar.');
      return;
    }
    const game = new BB.Game(canvas);
    BB.game = game;
    try {
      await game.boot();
    } catch (e) {
      BB.reportError('boot', e);
      const msg = String(e && e.message || e);
      if (msg.indexOf('NO_WEBGL') >= 0) fail('Gráficos 3D no disponibles', 'No se pudo crear el contexto WebGL. Cerrá otras pestañas o apps con gráficos y recargá.');
      else fail('No se pudo iniciar el juego', 'Ocurrió un problema al preparar la escena 3D. Tocá REINTENTAR para recargar.');
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})(window.BB);
