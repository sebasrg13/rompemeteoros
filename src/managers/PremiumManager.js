/* managers/PremiumManager.js — PREMIUM de campaña (se activa solo con Monedas Lunares, es permanente)
 *  - Escolta permanente: mini naves que te acompañan toda la campaña (1 a 3).
 *  - Escudo de emergencia: botón extra; escudo total 15 s, se recarga en 60 s.
 *  - Núcleo de Poder: Potencia y Cadencia hasta nivel 50 + Lanzallamas Zigzag automático.
 * Todo esto vale SOLO en la campaña (no en la Copa Semanal ni en el duelo).
 */
(function (BB) {
  'use strict';
  const U = BB.U;
  const $ = (id) => document.getElementById(id);

  const P = BB.PREMIUM = {
    SHIELD_DUR: 15, SHIELD_CD: 60,
    CORE_MAX: 50,
    items: [
      { id: 'escort', name: 'Escolta permanente', ic: '▲', max: 3, cost: (l) => [600, 900, 1500][l],
        desc: 'Mini naves que te defienden y disparan durante toda la campaña. +1 nave por nivel (máx. 3). Se suman al boost MINI SQUAD.' },
      { id: 'shield', name: 'Escudo de emergencia', ic: '◍', max: 1, cost: () => 1200,
        desc: 'Botón extra en la partida: escudo total durante 15 segundos. Se recarga en 1 minuto.' },
      { id: 'core', name: 'Núcleo de Poder', ic: '✺', max: 1, cost: () => 3000,
        desc: 'Desbloquea las mejoras de Potencia y Cadencia hasta el nivel 50 y suma el Lanzallamas Zigzag: fuego en zigzag que sale solo mientras disparás.' },
    ],
  };

  class PremiumManager {
    constructor(game) {
      this.game = game;
      this.cd = 0;
    }
    get data() {
      const d = this.game.save.data;
      if (!d.premium || typeof d.premium !== 'object') d.premium = {};
      return d.premium;
    }
    get ml() { return this.game.cup ? this.game.cup.data.ml : 0; }
    set ml(v) { if (this.game.cup) this.game.cup.data.ml = v; }
    level(id) { return this.data[id] || 0; }
    item(id) { return P.items.find((i) => i.id === id); }
    state(it) {
      const l = this.level(it.id), maxed = l >= it.max, price = maxed ? 0 : it.cost(l);
      return { level: l, max: it.max, maxed, price, affordable: !maxed && this.ml >= price };
    }
    buy(id) {
      const it = this.item(id); if (!it) return false;
      const st = this.state(it);
      if (st.maxed || !st.affordable) return false;
      this.ml -= st.price;
      this.data[id] = st.level + 1;
      this.game.save.save(true);
      this.game.onLoadoutChanged();
      return true;
    }
    // ¿aplica el premium ahora? solo en la campaña
    on() { const g = this.game; return !!g.inCampaign && !g.cupMode; }
    escort() { return this.on() ? this.level('escort') : 0; }
    zigOn() { return this.on() && this.level('core') > 0; }
    hasCore() { return this.level('core') > 0; }
    shieldOn() { return this.on() && this.level('shield') > 0; }

    // ---------- escudo de emergencia ----------
    resetRun() { this.cd = 0; this.game.premShieldT = 0; this.renderHud(); }
    useShield() {
      const g = this.game, S = BB.STATES;
      if (!this.shieldOn() || this.cd > 0 || g.playerDead || !(g.state === S.PLAYING || g.state === S.BOSS_FIGHT || g.state === S.BOSS_INTRO)) { g.audio.sfx('deny'); return false; }
      g.premShieldT = P.SHIELD_DUR;
      this.cd = P.SHIELD_CD;
      const p = g.player;
      g.fx.shock(p.x, p.y, 4, [0.4, 0.8, 1], 0.6);
      g.fx.burst(p.x, p.y, 0.8, [0.5, 0.85, 1], 24, 6, 0.45, 0.6);
      g.audio.sfx('shieldBlock');
      g.ui.toast('ESCUDO DE EMERGENCIA · 15 s', '#5ca8ff');
      g.vibrate(30);
      this.renderHud();
      return true;
    }
    update(dt) {
      const g = this.game;
      if (g.premShieldT > 0) { g.premShieldT -= dt; if (g.premShieldT <= 0) { g.premShieldT = 0; g.ui.toast('ESCUDO AGOTADO', '#9aa6d6'); } }
      if (this.cd > 0) this.cd = Math.max(0, this.cd - dt);
      const sec = Math.ceil(this.cd), act = Math.ceil(g.premShieldT || 0);
      if (sec !== this._sec || act !== this._act) { this._sec = sec; this._act = act; this.renderHud(); }
    }
    renderHud() {
      const el = $('h-pshield'); if (!el) return;
      const on = this.shieldOn();
      el.hidden = !on;
      if (!on) return;
      const g = this.game, active = g.premShieldT > 0, ready = this.cd <= 0;
      el.classList.toggle('ready', ready && !active);
      el.classList.toggle('active', active);
      el.style.setProperty('--p', active ? (g.premShieldT / P.SHIELD_DUR) : (1 - this.cd / P.SHIELD_CD));
      $('h-pshield-t').textContent = active ? Math.ceil(g.premShieldT) : ready ? 'LISTO' : Math.ceil(this.cd);
    }
    initUI() {
      const g = this.game;
      const el = $('h-pshield');
      el.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); this.useShield(); });
      window.addEventListener('keydown', (e) => { if ((e.key === 'e' || e.key === 'E' || e.key === '4') && this.shieldOn()) this.useShield(); });
    }
  }
  BB.PremiumManager = PremiumManager;
})(window.BB);
