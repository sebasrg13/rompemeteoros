/* Rompemeteoros — ¿Seguís o aterrizás?
 * core/namespace.js — espacio de nombres global, utilidades y reporte de errores.
 */
(function () {
  'use strict';
  const BB = (window.BB = window.BB || {});
  BB.VERSION = '1.0.0';

  const U = {
    clamp: (v, a, b) => (v < a ? a : v > b ? b : v),
    lerp: (a, b, t) => a + (b - a) * t,
    rand: (a, b) => a + Math.random() * (b - a),
    randi: (a, b) => Math.floor(a + Math.random() * (b - a + 1)),
    pick: (arr) => arr[Math.floor(Math.random() * arr.length)],
    chance: (p) => Math.random() < p,
    damp: (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt)),
    smooth: (t) => t * t * (3 - 2 * t),
    // 12540 -> "12.540"
    fmt: (n) => Math.floor(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.'),
    // Número corto para etiquetas 3D de vida
    short: (n) => {
      n = Math.ceil(n);
      if (n >= 100000) return Math.round(n / 1000) + 'K';
      if (n >= 10000) return (n / 1000).toFixed(1).replace('.0', '') + 'K';
      return '' + n;
    },
    hex: (h) => [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255],
    mixc: (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t],
    // generador pseudoaleatorio con semilla (geometrías reproducibles)
    seeded: (seed) => {
      let s = seed >>> 0 || 1;
      return () => {
        s ^= s << 13; s >>>= 0;
        s ^= s >> 17;
        s ^= s << 5; s >>>= 0;
        return (s % 100000) / 100000;
      };
    },
    nextFrame: () => new Promise((r) => (window.requestAnimationFrame ? requestAnimationFrame(() => r()) : setTimeout(r, 16))),
  };
  BB.U = U;

  // ---- Registro de errores (nunca destruye el loop) ----
  BB.errors = [];
  BB.reportError = function (where, err) {
    try {
      const msg = (err && (err.stack || err.message)) || String(err);
      BB.errors.push({ where, msg, t: Date.now() });
      if (BB.errors.length > 60) BB.errors.shift();
      if (window.console) console.warn('[BB:' + where + ']', msg);
    } catch (e) { /* nada */ }
  };
  BB.recentErrorCount = function (ms) {
    const now = Date.now();
    let n = 0;
    for (let i = BB.errors.length - 1; i >= 0; i--) {
      if (now - BB.errors[i].t < ms) n++; else break;
    }
    return n;
  };

  // Pool genérico de objetos reutilizables
  class Pool {
    constructor(factory, size) {
      this.items = [];
      for (let i = 0; i < size; i++) this.items.push(factory(i));
    }
    get() {
      for (let i = 0; i < this.items.length; i++) if (!this.items[i].alive) return this.items[i];
      return null;
    }
    forEachAlive(fn) {
      const it = this.items;
      for (let i = 0; i < it.length; i++) if (it[i].alive) fn(it[i], i);
    }
    countAlive() {
      let n = 0;
      for (let i = 0; i < this.items.length; i++) if (this.items[i].alive) n++;
      return n;
    }
  }
  BB.Pool = Pool;
})();
