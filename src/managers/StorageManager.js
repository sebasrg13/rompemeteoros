/* managers/StorageManager.js — guardado seguro en localStorage con respaldo en memoria */
(function (BB) {
  'use strict';
  const KEY = 'ballblast3d_save_v1';

  function defaults() {
    return {
      v: 1, coins: 0, best: 0, unlocked: 1, selected: 1,
      stats: { kills: 0, bosses: 0, coinsTotal: 0, maxLevel: 1, games: 0 },
      settings: { sound: true, music: true, vibration: true, quality: 'auto', sensitivity: 1.0 },
      shop: {
        owned: { cannon_blaster: 1, bullet_plasma: 1, skin_cobalt: 1 },
        equipped: { cannon: 'blaster', bullet: 'plasma', skin: 'cobalt' },
        up: { power: 0, rate: 0, shield: 0, invuln: 0, bubble: 0, squadCount: 0, squadTime: 0, squadBounce: 0 },
      },
      tutorialDone: false,
    };
  }

  function merge(base, src) {
    if (!src || typeof src !== 'object') return base;
    for (const k of Object.keys(base)) {
      if (src[k] === undefined) continue;
      if (base[k] && typeof base[k] === 'object' && !Array.isArray(base[k])) base[k] = merge(base[k], src[k]);
      else if (typeof src[k] === typeof base[k]) base[k] = src[k];
    }
    // claves extra (p.ej. items comprados)
    for (const k of Object.keys(src)) if (base[k] === undefined) base[k] = src[k];
    return base;
  }

  class StorageManager {
    constructor() {
      this.available = false;
      this.data = defaults();
      this._t = null;
      try {
        const t = '__bb_test__';
        window.localStorage.setItem(t, '1');
        window.localStorage.removeItem(t);
        this.available = true;
      } catch (e) { this.available = false; }
    }
    load() {
      if (!this.available) return this.data;
      try {
        const raw = window.localStorage.getItem(KEY);
        if (raw) this.data = merge(defaults(), JSON.parse(raw));
      } catch (e) { BB.reportError('storage-load', e); this.data = defaults(); }
      return this.data;
    }
    save(now) {
      if (!this.available) return;
      clearTimeout(this._t);
      const write = () => {
        try { window.localStorage.setItem(KEY, JSON.stringify(this.data)); } catch (e) { BB.reportError('storage-save', e); }
      };
      if (now) write(); else this._t = setTimeout(write, 250);
    }
    reset() {
      this.data = defaults();
      this.save(true);
    }
  }
  BB.StorageManager = StorageManager;
})(window.BB);
