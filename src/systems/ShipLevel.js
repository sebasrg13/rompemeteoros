/* systems/ShipLevel.js — NIVEL DE NAVE (gratis para todos, permanente)
 *  - La nave gana experiencia en la campaña destruyendo meteoros, aliens y bosses. Nunca se pierde.
 *  - Cada nivel de nave da +4% de daño al Lanzallamas Zigzag (premium).
 *  - A ciertos niveles se desbloquean PASIVAS que se activan solas (solo en la campaña):
 *    Esquivar, Destello, Parpadeo, Imán, Segunda llama, Blindaje, Última chance, Destello helado.
 */
(function (BB) {
  'use strict';
  const U = BB.U;
  const $ = (id) => document.getElementById(id);

  const S = BB.SHIP = {
    MAX: 30,
    need: (l) => Math.round((30 + 30 * Math.pow(l, 1.7)) / 10) * 10,   // XP para pasar del nivel l al l+1
    XP_METEOR: [0, 1, 2, 4, 8], XP_ALIEN: 6, XP_BOSS: 150, XP_LEVEL: 20,
    ZIG_PER_LEVEL: 0.04,
    DODGE_MIN: 0.08, DODGE_STEP: 0.005, DODGE_MAX: 0.15,
    FLASH_CD: 20, FLASH_R: 4.6, FLASH_TRIGGER: 1.5, FLASH_FREEZE: 2,
    BLINK_CD: 45,
    MAGNET_R: 4.5,
    passives: [
      { id: 'dodge', lvl: 3, ic: '≋', name: 'Esquivar', desc: 'Probabilidad de que un golpe no te toque: 8% y sube con el nivel hasta 15%.' },
      { id: 'flash', lvl: 6, ic: '✦', name: 'Destello', desc: 'Cuando un enemigo se te viene encima, la nave suelta un destello que hace explotar lo que tiene cerca. Recarga: 20 s.', cd: true },
      { id: 'blink', lvl: 10, ic: '↯', name: 'Parpadeo', desc: 'Cuando un golpe te va a dar, la nave se teletransporta al lugar más seguro. Recarga: 45 s.', cd: true },
      { id: 'magnet', lvl: 14, ic: '⊛', name: 'Imán', desc: 'Las monedas cercanas vienen solas hacia la nave.' },
      { id: 'twin', lvl: 18, ic: '♆', name: 'Segunda llama', desc: 'El Lanzallamas Zigzag tira dos bolas de fuego cruzadas. Necesita el Núcleo de Poder (★ PREMIUM).', core: true },
      { id: 'armor', lvl: 22, ic: '⬢', name: 'Blindaje', desc: '+1 escudo máximo en la campaña.' },
      { id: 'last', lvl: 26, ic: '♥', name: 'Última chance', desc: 'Una vez por recorrido, el golpe que te destruiría te deja con tu último escudo.' },
      { id: 'frost', lvl: 30, ic: '❄', name: 'Destello helado', desc: 'El Destello también congela 2 s a lo que no destruye.' },
    ],
  };

  class ShipLevel {
    constructor(game) {
      this.game = game;
      this.flashCd = 0; this.blinkCd = 0; this.lastUsed = false;
      this.runXp = 0; this.levelXp = 0; this.ups = [];
    }
    get data() {
      const d = this.game.save.data;
      if (!d.ship || typeof d.ship !== 'object') d.ship = {};
      const s = d.ship;
      if (!(s.lvl >= 1)) s.lvl = 1;
      if (!(s.xp >= 0)) s.xp = 0;
      s.lvl = Math.min(S.MAX, Math.floor(s.lvl));
      return s;
    }
    get lvl() { return this.data.lvl; }
    need() { return S.need(this.lvl); }
    frac() { return this.lvl >= S.MAX ? 1 : U.clamp(this.data.xp / this.need(), 0, 1); }
    passive(id) { return S.passives.find((p) => p.id === id); }
    // ¿aplican las pasivas ahora? solo en la campaña (ni copa ni duelo)
    on() { const g = this.game; return !!g.inCampaign && !g.cupMode; }
    // desbloqueada por nivel (para la pantalla de la nave)
    unlocked(id) { const p = this.passive(id); return !!p && this.lvl >= p.lvl; }
    // activa en esta partida
    has(id) {
      if (!this.on() || !this.unlocked(id)) return false;
      if (this.passive(id).core) return !!(this.game.premium && this.game.premium.hasCore());
      return true;
    }
    zigMult() { return 1 + S.ZIG_PER_LEVEL * (this.lvl - 1); }
    dodgeChance() { return this.has('dodge') ? Math.min(S.DODGE_MAX, S.DODGE_MIN + (this.lvl - 3) * S.DODGE_STEP) : 0; }
    magnetR() { return this.has('magnet') ? S.MAGNET_R : 0; }
    extraShields() { return this.has('armor') ? 1 : 0; }

    // ---------- experiencia ----------
    addXp(n) {
      if (!this.on() || !(n > 0)) return;
      const d = this.data;
      this.runXp += n; this.levelXp += n;
      if (d.lvl >= S.MAX) { d.xp = 0; return; }
      d.xp += n;
      while (d.lvl < S.MAX && d.xp >= S.need(d.lvl)) { d.xp -= S.need(d.lvl); d.lvl++; this.levelUp(d.lvl); }
      if (d.lvl >= S.MAX) d.xp = 0;
      this.renderHud();
    }
    xpForKill(t) { return t.kind === 'alien' ? S.XP_ALIEN : (S.XP_METEOR[t.tier] || 1); }
    levelUp(l) {
      const g = this.game, p = g.player;
      this.ups.push(l);
      const np = S.passives.filter((x) => x.lvl === l);
      g.ui.toast('NAVE NIVEL ' + l, '#ffc83d');
      for (const x of np) g.ui.toast('NUEVA PASIVA · ' + x.name.toUpperCase() + (x.core && !g.premium.hasCore() ? ' (falta el Núcleo)' : ''), '#5cff9d');
      g.audio.sfx('levelUp');
      if (p && g.isPlaying()) { g.fx.shock(p.x, p.y, 3.5, [1, 0.8, 0.3], 0.6); g.fx.burst(p.x, p.y, 0.9, [1, 0.85, 0.35], 22, 6, 0.4, 0.7); }
      g.vibrate(40);
      g.save.save();
    }

    // ---------- pasivas ----------
    resetRun() { this.flashCd = 0; this.blinkCd = 0; this.lastUsed = false; this.runXp = 0; this.levelXp = 0; this.ups = []; this.renderHud(); }

    // Esquivar: el golpe no te toca
    tryDodge() {
      const c = this.dodgeChance();
      if (!(c > 0) || Math.random() >= c) return false;
      const g = this.game, p = g.player;
      p.invuln = Math.max(p.invuln, 0.6);
      g.fx.text(p.x, p.y + 0.6, 1.6, '!', [0.5, 1, 0.9], 1.5);
      g.fx.burst(p.x, p.y, 0.8, [0.5, 1, 0.9], 10, 5, 0.3, 0.35);
      g.ui.toast('ESQUIVA', '#5cff9d');
      g.audio.sfx('boost');
      return true;
    }
    // lugar más seguro de la franja del jugador
    safeX() {
      const g = this.game, p = g.player, A = BB.ARENA;
      let bx = p.x, bs = -1;
      for (let i = 0; i < 9; i++) {
        const x = -A.halfW + 0.8 + i * ((2 * A.halfW - 1.6) / 8);
        let near = 99;
        g.meteors.forEachAlive((m) => { if (m.y < 9) near = Math.min(near, Math.abs(m.x - x) - m.r); });
        g.aliens.forEachAlive((a) => { if (a.y < 7) near = Math.min(near, Math.abs(a.x - x) - a.r); });
        for (const b of g.bullets.eb) if (b.alive && b.y < 8) near = Math.min(near, Math.abs(b.x - x));
        if (near > bs) { bs = near; bx = x; }
      }
      return bx;
    }
    // Parpadeo: teletransporte en vez del golpe
    tryBlink() {
      if (!this.has('blink') || this.blinkCd > 0) return false;
      const g = this.game, p = g.player;
      this.blinkCd = S.BLINK_CD;
      g.fx.burst(p.x, p.y, 0.8, [0.7, 0.5, 1], 20, 6, 0.4, 0.5);
      p.x = p.targetX = this.safeX();
      p.invuln = Math.max(p.invuln, 1.5);
      g.fx.shock(p.x, p.y, 3, [0.7, 0.5, 1], 0.5);
      g.fx.burst(p.x, p.y, 0.8, [0.8, 0.6, 1], 20, 6, 0.4, 0.5);
      g.ui.toast('PARPADEO', '#b36bff');
      g.audio.sfx('boost');
      g.vibrate(25);
      this.renderHud();
      return true;
    }
    // Última chance: una vez por recorrido
    tryLast() {
      if (!this.has('last') || this.lastUsed) return false;
      const g = this.game, p = g.player;
      this.lastUsed = true;
      p.invuln = Math.max(p.invuln, 3);
      g.fx.shock(p.x, p.y, 6, [1, 0.4, 0.5], 0.7);
      g.fx.burst(p.x, p.y, 0.8, [1, 0.5, 0.6], 30, 7, 0.45, 0.7);
      g.world.addShake(0.6);
      g.ui.toast('ÚLTIMA CHANCE', '#ff6b80');
      g.audio.sfx('shieldBlock');
      g.vibrate([60, 40, 60]);
      this.renderHud();
      return true;
    }
    // Destello: explota lo que está cerca de la nave
    flash() {
      const g = this.game, p = g.player, R = S.FLASH_R;
      this.flashCd = S.FLASH_CD;
      const dmg = Math.max(20, g.levelHp || 20) * 4 * Math.sqrt(g.stats.dmg || 1);
      g.fx.shock(p.x, p.y, R, [1, 0.95, 0.7], 0.5);
      g.fx.emit(p.x, p.y, 0.9, 0, 0, 0, 0.28, 1.6, R * 1.5, [1, 0.9, 0.6], 0.55, 0, true, 0, 0);
      g.fx.burst(p.x, p.y, 0.9, [1, 0.9, 0.5], 26, 9, 0.4, 0.5);
      g.areaDamage(p.x, p.y, R, dmg, null);
      if (this.has('frost')) {
        const fr = (e) => { if (Math.hypot(e.x - p.x, e.y - p.y) < R + e.r) e.frozenT = Math.max(e.frozenT || 0, S.FLASH_FREEZE); };
        g.meteors.forEachAlive(fr); g.aliens.forEachAlive(fr);
        if (g.boss && g.boss.alive && Math.hypot(g.boss.x - p.x, g.boss.y - p.y) < R + 3) g.boss.frozenT = Math.max(g.boss.frozenT || 0, S.FLASH_FREEZE * 0.4);
      }
      p.invuln = Math.max(p.invuln, 0.6);   // respiro: los pedazos que salen no te pegan al instante
      g.world.addShake(0.35);
      g.audio.sfx('explodeBig');
      g.vibrate(30);
      this.renderHud();
    }
    update(dt) {
      if (!this.on()) return;
      const g = this.game, p = g.player;
      const f0 = Math.ceil(this.flashCd), b0 = Math.ceil(this.blinkCd);
      if (this.flashCd > 0) this.flashCd = Math.max(0, this.flashCd - dt);
      if (this.blinkCd > 0) this.blinkCd = Math.max(0, this.blinkCd - dt);
      if (this.has('flash') && this.flashCd <= 0 && !g.playerDead && !g.levelEnding) {
        let near = false;
        const chk = (e) => { if (!near && Math.hypot(e.x - p.x, e.y - p.y) - e.r < S.FLASH_TRIGGER) near = true; };
        g.meteors.forEachAlive(chk); g.aliens.forEachAlive(chk);
        if (near) this.flash();
      }
      if ((f0 > 0) !== (this.flashCd > 0) || (b0 > 0) !== (this.blinkCd > 0)) this.renderHud();
    }

    // ---------- interfaz ----------
    renderHud() {
      const el = $('h-xp'); if (!el) return;
      const on = this.on();
      el.hidden = !on;
      if (!on) return;
      $('h-xplv').textContent = 'NV ' + this.lvl;
      $('h-xpbar').style.width = Math.round(this.frac() * 100) + '%';
      let h = '';
      for (const p of S.passives) {
        if (!p.cd && p.id !== 'last') continue;
        if (!this.has(p.id)) continue;
        const off = p.id === 'flash' ? this.flashCd > 0 : p.id === 'blink' ? this.blinkCd > 0 : this.lastUsed;
        h += '<i class="' + (off ? 'off' : '') + '" title="' + p.name + '">' + p.ic + '</i>';
      }
      $('h-pas').innerHTML = h;
    }
    renderMenu() {
      const el = $('m-ship'); if (!el) return;
      const max = this.lvl >= S.MAX;
      $('m-shiplv').textContent = this.lvl;
      $('m-shipbar').style.width = Math.round(this.frac() * 100) + '%';
      const nxt = S.passives.find((p) => p.lvl > this.lvl);
      $('m-shipnext').textContent = max ? 'NIVEL MÁXIMO' : nxt ? 'NV ' + nxt.lvl + ': ' + nxt.name.toUpperCase() : '';
    }
    open() {
      const g = this.game, d = this.data, max = this.lvl >= S.MAX, core = g.premium.hasCore();
      let h = '<div class="shipcard"><div class="shiplv"><small>NIVEL</small><b>' + this.lvl + '</b></div><div class="shipxp">' +
        '<div class="xpbar"><i style="width:' + Math.round(this.frac() * 100) + '%"></i></div>' +
        '<span>' + (max ? 'NIVEL MÁXIMO' : U.fmt(Math.floor(d.xp)) + ' / ' + U.fmt(this.need()) + ' XP') + '</span>' +
        '<p>Tu nave gana experiencia destruyendo meteoros, aliens y bosses en la campaña. La experiencia nunca se pierde, aunque pierdas la bolsa.</p></div></div>';
      const zp = Math.round((this.zigMult() - 1) * 100);
      h += '<div class="zigline' + (core ? ' on' : '') + '"><b>LANZALLAMAS ZIGZAG</b> +' + zp + '% de daño por el nivel de tu nave (+' + Math.round(S.ZIG_PER_LEVEL * 100) + '% por nivel)' +
        (core ? '' : '<small>Se activa con el Núcleo de Poder en TIENDA → ★ PREMIUM</small>') + '</div>';
      h += '<div class="pashead">PASIVAS · SE ACTIVAN SOLAS EN LA CAMPAÑA</div>';
      for (const p of S.passives) {
        const un = this.lvl >= p.lvl, needCore = p.core && !core;
        let extra = '';
        if (p.id === 'dodge' && un) extra = ' Ahora: ' + Math.round(Math.min(S.DODGE_MAX, S.DODGE_MIN + (this.lvl - 3) * S.DODGE_STEP) * 1000) / 10 + '%.';
        h += '<div class="item pas' + (un && !needCore ? ' eq' : '') + (un ? '' : ' lock') + '"><div class="sw">' + p.ic + '</div><div class="inf"><div class="nm">' + p.name + '</div><div class="ds">' + p.desc + extra + '</div></div>' +
          '<em>' + (un ? (needCore ? 'FALTA NÚCLEO' : 'ACTIVA') : 'NIVEL ' + p.lvl) + '</em></div>';
      }
      $('ship-body').innerHTML = h;
      g.ui.show('s-ship');
    }
    initUI() {
      const g = this.game;
      const on = (id, fn) => { const el = $(id); if (el) el.addEventListener('click', (e) => { e.stopPropagation(); g.audio.unlock(); g.audio.sfx('click'); try { fn(); } catch (err) { BB.reportError('ship-ui', err); } }); };
      on('m-ship', () => this.open());
      on('ship-back', () => g.ui.back());
    }
  }
  BB.ShipLevel = ShipLevel;
})(window.BB);
