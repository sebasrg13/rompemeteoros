/* managers/PerformanceManager.js — calidad adaptativa (resolución, sombras, partículas) según FPS */
(function (BB) {
  'use strict';
  const TIERS = [
    { tier: 0, name: 'Baja', dpr: 1.0, particles: 320, debris: 10, shadows: false },
    { tier: 1, name: 'Media', dpr: 1.5, particles: 700, debris: 22, shadows: true },
    { tier: 2, name: 'Alta', dpr: 2.0, particles: 1200, debris: 36, shadows: true },
  ];

  class PerformanceManager {
    constructor(game) {
      this.game = game;
      this.mode = 'auto';
      this.tier = this.detect();
      this.dprScale = 1;
      this.samples = [];
      this.acc = 0; this.frames = 0;
      this.lowTime = 0; this.highTime = 0;
      this.fps = 60;
      this.onChange = null;
    }

    detect() {
      try {
        const ua = navigator.userAgent || '';
        const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua) || (navigator.maxTouchPoints > 1 && /Mac/.test(ua));
        const mem = navigator.deviceMemory || 4, cores = navigator.hardwareConcurrency || 4;
        if (!mobile) return cores >= 4 ? 2 : 1;
        if (mem <= 2 || cores <= 4) return 0;
        return 1;
      } catch (e) { return 1; }
    }

    setMode(m) {
      this.mode = m;
      if (m === 'high') this.tier = 2; else if (m === 'medium') this.tier = 1; else if (m === 'low') this.tier = 0; else this.tier = this.detect();
      this.dprScale = 1;
      this.apply();
    }

    get q() { return TIERS[this.tier]; }

    pixelRatio() {
      const dev = window.devicePixelRatio || 1;
      const q = this.q;
      let r = Math.min(dev, q.dpr) * this.dprScale;
      // limitar píxeles totales para GPUs móviles
      const w = window.innerWidth, h = window.innerHeight;
      const maxPx = this.tier === 2 ? 2.6e6 : this.tier === 1 ? 1.5e6 : 0.8e6;
      if (w * h * r * r > maxPx) r = Math.sqrt(maxPx / (w * h));
      return Math.max(0.6, r);
    }

    apply() { if (this.onChange) this.onChange(this.q); }

    // Llamado cada frame con dt real (segundos)
    sample(dt) {
      if (dt <= 0 || dt > 0.5) return;
      this.acc += dt; this.frames++;
      if (this.acc < 1) return;
      this.fps = this.frames / this.acc;
      this.acc = 0; this.frames = 0;
      if (this.mode !== 'auto' || !this.game.isPlaying()) return;
      if (this.fps < 45) { this.lowTime++; this.highTime = 0; } else if (this.fps > 58) { this.highTime++; this.lowTime = 0; } else { this.lowTime = 0; this.highTime = 0; }
      if (this.lowTime >= 2) {
        this.lowTime = 0;
        if (this.dprScale > 0.72) { this.dprScale -= 0.14; this.apply(); }
        else if (this.tier > 0) { this.tier--; this.dprScale = 1; this.apply(); }
      } else if (this.highTime >= 10 && this.dprScale < 1) {
        this.highTime = 0;
        this.dprScale = Math.min(1, this.dprScale + 0.07);
        this.apply();
      }
    }
  }
  BB.PerformanceManager = PerformanceManager;
  BB.QUALITY_TIERS = TIERS;
})(window.BB);
