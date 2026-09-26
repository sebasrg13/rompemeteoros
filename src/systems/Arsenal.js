/* systems/Arsenal.js — ARSENAL: armas especiales equipables (set de 3)
 * Cada arma se usa 1 vez por tramo (hasta el próximo boss). Al vencer al boss se recargan las 3.
 * Tipos: ofensiva, control, defensa y economía. Se compran y mejoran solo con monedas del juego.
 */
(function (BB) {
  'use strict';
  const U = BB.U;
  const $ = (id) => document.getElementById(id);

  const TYPES = {
    off: { name: 'OFENSIVA', col: '#ff6a4d' },
    ctl: { name: 'CONTROL', col: '#5cc8ff' },
    def: { name: 'DEFENSA', col: '#5cff9d' },
    eco: { name: 'ECONOMÍA', col: '#ffc83d' },
  };
  // price: monedas (0 = gratis). ml: solo con Monedas Lunares.
  const W = [
    { id: 'nova', type: 'off', ic: '✸', name: 'Misil Nova', desc: 'Misil teledirigido: gran explosión en área.', price: 0 },
    { id: 'rain', type: 'off', ic: '⁘', name: 'Lluvia de Plasma', desc: '12 rayos caen sobre los enemigos.', price: 1500 },
    { id: 'beam', type: 'off', ic: '‖', name: 'Rayo Perforante', desc: 'Rayo continuo de 3 s que atraviesa todo tu carril.', price: 3000 },
    { id: 'swarm', type: 'off', ic: '➤', name: 'Enjambre Kamikaze', desc: '4 drones buscan enemigos y explotan (+1 en nivel 3 y 5).', price: 4000 },
    { id: 'overload', type: 'off', ic: '⚡', name: 'Sobrecarga', desc: 'Doble cadencia y +70% de daño por unos segundos.', price: 2500 },
    { id: 'cryo', type: 'ctl', ic: '❄', name: 'Misil Criogénico', desc: 'Congela todo en el área 4 s. Lo congelado recibe +50% de daño.', price: 0 },
    { id: 'gravity', type: 'ctl', ic: '⇡', name: 'Pulso Gravitacional', desc: 'Empuja los meteoros hacia arriba y los frena.', price: 1500 },
    { id: 'hole', type: 'ctl', ic: '◉', name: 'Agujero Negro de Bolsillo', desc: 'Traga meteoros chicos y daña todo lo que atrapa.', price: 4500 },
    { id: 'emp', type: 'ctl', ic: '⌁', name: 'Pulso EMP', desc: 'Borra las balas enemigas y paraliza a los aliens.', price: 2000 },
    { id: 'slowmo', type: 'ctl', ic: '⧗', name: 'Tiempo Bala', desc: 'Los enemigos van a mitad de velocidad. Vos no.', price: 5000 },
    { id: 'dome', type: 'def', ic: '◠', name: 'Domo de Energía', desc: 'Nada te hace daño durante 5 s.', price: 3500 },
    { id: 'mirror', type: 'def', ic: '◈', name: 'Casco Espejo', desc: 'Devuelve las balas enemigas contra ellos.', price: 4000 },
    { id: 'repair', type: 'def', ic: '✚', name: 'Reparación', desc: 'Recuperás 1 escudo (2 desde nivel 4).', price: 0 },
    { id: 'jump', type: 'def', ic: '↯', name: 'Salto Cuántico', desc: 'Saltás al lugar más seguro, invulnerable unos segundos.', price: 2000 },
    { id: 'magnet', type: 'eco', ic: '⊛', name: 'Imán Galáctico', desc: 'Junta todas las monedas y las duplica por 8 s.', price: 0 },
    { id: 'loot', type: 'eco', ic: '✦', name: 'Saqueo', desc: 'Los próximos enemigos sueltan el triple de monedas.', price: 3000 },
  ];
  const MAXLVL = 5;
  const DEFAULT_SETS = [['nova', 'cryo', 'repair'], ['nova', 'repair', 'magnet'], ['cryo', 'repair', 'magnet']];

  class Arsenal {
    constructor(game) {
      this.game = game;
      this.defs = W; this.types = TYPES;
      this.charges = [true, true, true];
      this.proj = []; this.strikes = []; this.wells = [];
      this.beamT = 0; this.slowT = 0; this.mirrorT = 0; this.domeT = 0; this.coinX2T = 0; this.lootN = 0;
      this.selSlot = 0; this.filter = 'all';
    }
    get data() {
      const d = this.game.save.data;
      if (!d.arsenal || typeof d.arsenal !== 'object') d.arsenal = {};
      const a = d.arsenal;
      if (!a.owned || typeof a.owned !== 'object') a.owned = {};
      for (const w of W) if (!w.price && !a.owned[w.id]) a.owned[w.id] = 1;
      if (!Array.isArray(a.sets) || a.sets.length !== 3) a.sets = DEFAULT_SETS.map((s) => s.slice());
      if (typeof a.cur !== 'number') a.cur = 0;
      return a;
    }
    def(id) { return W.find((w) => w.id === id); }
    lvl(id) { return this.data.owned[id] || 0; }
    set() { return this.data.sets[this.data.cur]; }
    enabled() { const g = this.game; return !!(g.inCampaign || g.cupMode); }

    // ---------- economía ----------
    buyCost(w) { return { coins: w.price }; }
    upCost(w, l) { return { coins: Math.round(300 * Math.pow(1.9, l - 1) / 10) * 10 }; }
    // devuelve el precio efectivo según el medio de pago elegido (ML si el arma es exclusiva)
    priceOf(c) { return { coins: c.coins }; }   // solo monedas del juego (nada con dinero real)
    canPay(p) { return this.game.save.data.coins >= p.coins; }
    pay(p) { this.game.save.data.coins -= p.coins; }
    buy(id) {
      const w = this.def(id); if (!w || this.lvl(id)) return false;
      const p = this.priceOf(this.buyCost(w));
      if (!this.canPay(p)) return false;
      this.pay(p); this.data.owned[id] = 1; this.game.save.save(true);
      return true;
    }
    upgrade(id) {
      const w = this.def(id), l = this.lvl(id); if (!w || !l || l >= MAXLVL) return false;
      const p = this.priceOf(this.upCost(w, l));
      if (!this.canPay(p)) return false;
      this.pay(p); this.data.owned[id] = l + 1; this.game.save.save(true);
      return true;
    }
    equip(id, slot) {
      if (!this.lvl(id)) return false;
      const s = this.set();
      const other = s.indexOf(id);
      if (other >= 0 && other !== slot) s[other] = s[slot];   // intercambio si ya estaba en otro casillero
      s[slot] = id;
      this.game.save.save(true);
      return true;
    }

    // ---------- partida ----------
    recharge(silent) {
      const was = this.charges.some((c) => !c);
      this.charges = [true, true, true];
      if (was && !silent) this.game.ui.toast('ARSENAL RECARGADO', '#5cc8ff');
      this.renderHud();
    }
    resetRun() {
      this.proj.length = 0; this.strikes.length = 0; this.clearWells();
      this.beamT = this.slowT = this.mirrorT = this.domeT = this.coinX2T = 0; this.lootN = 0;
      this.recharge(true);
    }
    clearWells() { const gw = this.game.gravityWells; for (const w of this.wells) { const i = gw.indexOf(w); if (i >= 0) gw.splice(i, 1); } this.wells.length = 0; }
    canFire() {
      const g = this.game, S = BB.STATES;
      return this.enabled() && !g.playerDead && !g.levelEnding && (g.state === S.PLAYING || g.state === S.BOSS_FIGHT);
    }
    use(slot) {
      const g = this.game;
      const id = this.set()[slot];
      if (!id || !this.charges[slot] || !this.canFire()) { g.audio.sfx('deny'); return false; }
      const w = this.def(id), l = Math.max(1, this.lvl(id));
      this.charges[slot] = false;
      g.stats_arsenal = (g.stats_arsenal || 0) + 1;
      g.ui.toast(w.name.toUpperCase(), TYPES[w.type].col);
      g.vibrate(30);
      try { this.fire(id, l); } catch (e) { BB.reportError('arsenal-' + id, e); }
      this.renderHud();
      return true;
    }
    // daño base: escala con la vida de los meteoritos del nivel y con el nivel del arma
    D(l) { return Math.max(20, this.game.levelHp || 20) * (1 + 0.25 * (l - 1)) * Math.sqrt(this.game.stats.dmg || 1); }
    bestTarget() {
      const g = this.game, p = g.player;
      if (g.boss && g.boss.alive && g.boss.dying <= 0 && !g.boss.intro) return g.boss.hits[0];
      const T = g.collision.buildTargets().filter((t) => (t.owner ? t.owner.alive : t.alive) && t.kind !== 'rival' && t.y > p.y);
      if (!T.length) return null;
      T.sort((a, b) => (b.r - a.r) || (a.y - b.y));
      return T[0];
    }
    fire(id, l) {
      const g = this.game, p = g.player, fx = g.fx, top = BB.ARENA.top;
      const D = this.D(l);
      switch (id) {
        case 'nova': this.launch('nova', this.bestTarget(), { dmg: 3.5 * D, R: 2.6 + 0.15 * l, speed: 15, col: [1, 0.55, 0.2] }); g.audio.sfx('laserCharge'); break;
        case 'cryo': this.launch('cryo', this.bestTarget(), { dmg: D, R: 3 + 0.3 * l, freeze: 4 + 0.5 * (l - 1), speed: 15, col: [0.5, 0.85, 1] }); g.audio.sfx('laserCharge'); break;
        case 'swarm': {
          const n = 4 + (l >= 3 ? 1 : 0) + (l >= 5 ? 1 : 0);
          const T = g.nearestTargets(p.x, p.y, n, 60, null);
          for (let i = 0; i < n; i++) this.launch('drone', T[i % Math.max(1, T.length)] || null, { dmg: 1.8 * D, R: 1.3, speed: 12 + i, col: [1, 0.35, 0.6], delay: i * 0.12, ang: -1 + i * (2 / Math.max(1, n - 1)) });
          g.audio.sfx('boost');
          break;
        }
        case 'rain': {
          const n = 12, T = g.collision.buildTargets().filter((t) => t.kind !== 'rival' && (t.owner ? t.owner.alive : t.alive));
          for (let i = 0; i < n; i++) {
            const t = T.length ? T[Math.floor(Math.random() * T.length)] : null;
            this.strikes.push({ t: 0.12 * i, x: t ? t.x : U.rand(-BB.ARENA.halfW + 0.5, BB.ARENA.halfW - 0.5), y: t ? t.y : U.rand(5, top - 2), target: t, dmg: 1.3 * D, R: 1.2 });
          }
          break;
        }
        case 'beam': this.beamT = 3 + 0.3 * (l - 1); this.beamDps = 3 * D; g.audio.sfx('laserCharge'); break;
        case 'overload': {
          const B = g.boosts;
          B.activate('rapid', true); B.activate('damage', true);
          const dur = 6 + 0.75 * (l - 1);
          B.active.rapid.t = B.active.rapid.max = dur; B.active.damage.t = B.active.damage.max = dur;
          fx.shock(p.x, p.y, 4, [1, 0.8, 0.3], 0.6); g.audio.sfx('boost');
          break;
        }
        case 'gravity': {
          g.meteors.forEachAlive((m) => { m.vy = Math.max(m.vy, 10 + l); m.vx *= 0.4; m.frozenT = Math.max(m.frozenT || 0, 0); });
          g.aliens.forEachAlive((a) => { a.y = Math.min(top, a.y + 3); });
          for (const b of g.bullets.eb) if (b.alive && Math.abs(b.y - p.y) < 7) { b.alive = false; fx.burst(b.x, b.y, 1, [0.6, 0.8, 1], 3, 3, 0.3, 0.3); }
          fx.shock(p.x, p.y, 10, [0.6, 0.8, 1], 0.8); fx.shock(p.x, p.y, 6, [0.8, 0.9, 1], 0.6);
          g.world.addShake(0.4); g.audio.sfx('shieldBlock');
          break;
        }
        case 'hole': {
          const w = { x: 0, y: 11, strength: 16 + 2 * l, t: 4 + 0.4 * (l - 1), dps: 2 * D, arsenal: true };
          this.wells.push(w); g.gravityWells.push(w);
          fx.shock(w.x, w.y, 4, [0.6, 0.3, 1], 0.8); g.audio.sfx('roar');
          break;
        }
        case 'emp': {
          for (const b of g.bullets.eb) if (b.alive && !b.pvp) { b.alive = false; fx.burst(b.x, b.y, 1, [0.5, 0.9, 1], 4, 4, 0.3, 0.3); }
          g.aliens.forEachAlive((a) => { a.frozenT = 3 + 0.5 * l; });
          if (g.boss && g.boss.alive) g.boss.frozenT = 1 + 0.3 * l;
          fx.shock(p.x, p.y, 14, [0.4, 0.9, 1], 0.7); g.ui.whiteFlash && g.ui.whiteFlash();
          g.audio.sfx('shieldBlock');
          break;
        }
        case 'slowmo': this.slowT = 5 + 0.5 * (l - 1); fx.shock(p.x, p.y, 12, [0.8, 0.6, 1], 1); g.audio.sfx('warp'); break;
        case 'dome': { const t = 5 + 0.5 * (l - 1); p.invuln = Math.max(p.invuln, t); this.domeT = t; g.audio.sfx('shieldBlock'); break; }
        case 'mirror': this.mirrorT = 5 + 0.5 * (l - 1); this.mirrorDmg = 0.8 * D; g.audio.sfx('shieldBlock'); break;
        case 'repair': {
          const n = l >= 4 ? 2 : 1;
          g.shields = Math.min(g.stats.maxShields, g.shields + n);
          fx.burst(p.x, p.y, 0.8, [0.4, 1, 0.6], 26, 6, 0.4, 0.7); fx.shock(p.x, p.y, 3, [0.4, 1, 0.6], 0.5);
          g.audio.sfx('levelUp');
          break;
        }
        case 'jump': {
          const A = BB.ARENA; let bx = p.x, bs = -1;
          for (let i = 0; i < 9; i++) {
            const x = -A.halfW + 0.8 + i * ((2 * A.halfW - 1.6) / 8);
            let near = 99;
            g.meteors.forEachAlive((m) => { if (m.y < 9) near = Math.min(near, Math.abs(m.x - x) - m.r); });
            for (const b of g.bullets.eb) if (b.alive && b.y < 8) near = Math.min(near, Math.abs(b.x - x));
            if (near > bs) { bs = near; bx = x; }
          }
          fx.burst(p.x, p.y, 0.8, [0.7, 0.5, 1], 20, 6, 0.4, 0.5);
          p.x = p.targetX = bx;
          p.invuln = Math.max(p.invuln, 2.5 + 0.25 * (l - 1));
          fx.shock(bx, p.y, 3, [0.7, 0.5, 1], 0.5); g.audio.sfx('warp');
          break;
        }
        case 'magnet': g.pickups.collectAll(); this.coinX2T = 8 + (l - 1); fx.shock(p.x, p.y, 12, [1, 0.8, 0.3], 0.8); g.audio.sfx('coin'); break;
        case 'loot': this.lootN = 3 + l; fx.shock(p.x, p.y, 5, [1, 0.8, 0.3], 0.6); g.audio.sfx('coin'); break;
      }
    }
    launch(kind, target, o) {
      const p = this.game.player;
      this.proj.push(Object.assign({ kind, target, x: p.x, y: p.y + 0.8, vx: (o.ang || 0) * 6, vy: 6, t: -(o.delay || 0) }, o));
    }
    // multiplicadores de monedas
    coinMult() { return this.coinX2T > 0 ? 2 : 1; }
    lootMult() { if (this.lootN > 0) { this.lootN--; return 3; } return 1; }
    enemyScale() { return this.slowT > 0 ? 0.45 : 1; }

    update(dt) {
      const g = this.game, p = g.player, fx = g.fx;
      if (this.coinX2T > 0) this.coinX2T -= dt;
      if (this.slowT > 0) { this.slowT -= dt; if (Math.random() < 0.3) fx.emit(U.rand(-4, 4), U.rand(2, 18), U.rand(0.5, 3), 0, -1, 0, 0.8, 0.2, 0.05, [0.8, 0.6, 1], 0.6, 2, true, 0, 0); }
      if (!this.enabled() || g.playerDead) { if (this.proj.length || this.beamT > 0) { this.proj.length = 0; this.beamT = 0; } return; }
      // proyectiles guiados
      for (let i = this.proj.length - 1; i >= 0; i--) {
        const m = this.proj[i];
        m.t += dt;
        if (m.t < 0) continue;
        const alive = (t) => t && (t.owner ? t.owner.alive && t.owner.dying <= 0 : t.alive);
        if (!alive(m.target)) m.target = this.bestTarget();
        const tx = m.target ? m.target.x : m.x, ty = m.target ? m.target.y : BB.ARENA.top;
        const dx = tx - m.x, dy = ty - m.y, d = Math.hypot(dx, dy) || 1;
        const sp = m.speed * Math.min(1.6, 0.6 + m.t);
        m.vx = U.damp(m.vx, (dx / d) * sp, 6, dt); m.vy = U.damp(m.vy, (dy / d) * sp, 6, dt);
        m.x += m.vx * dt; m.y += m.vy * dt;
        fx.emit(m.x, m.y, 1.1, -m.vx * 0.1, -m.vy * 0.1, 0.3, 0.35, 0.35, 0.05, m.col, 0.9, 2, true, 1, 0);
        if (d < (m.target ? m.target.r : 0) + 0.4 || m.t > 3.5 || m.y > BB.ARENA.top + 2) { this.detonate(m); this.proj.splice(i, 1); }
      }
      // lluvia de plasma
      for (let i = this.strikes.length - 1; i >= 0; i--) {
        const s = this.strikes[i];
        s.t -= dt;
        if (s.t > 0) continue;
        if (s.target && (s.target.owner ? s.target.owner.alive : s.target.alive)) { s.x = s.target.x; s.y = s.target.y; }
        fx.arc(s.x + U.rand(-0.4, 0.4), BB.ARENA.top + 3, 6, s.x, s.y, 1, [0.5, 0.8, 1], 0.25);
        fx.burst(s.x, s.y, 1, [0.5, 0.85, 1], 10, 5, 0.35, 0.4);
        g.areaDamage(s.x, s.y, s.R, s.dmg, null);
        g.audio.sfx('zap');
        this.strikes.splice(i, 1);
      }
      // rayo perforante
      if (this.beamT > 0) {
        this.beamT -= dt;
        const x = p.x;
        fx.arc(x, p.y + 0.9, 1, x + U.rand(-0.1, 0.1), BB.ARENA.top + 2, 1.2, [1, 0.5, 0.9], 0.06);
        fx.arc(x, p.y + 0.9, 1, x, BB.ARENA.top + 2, 1, [1, 0.9, 1], 0.05);
        for (const t of g.collision.buildTargets()) {
          if (t.kind === 'rival' || t.y < p.y) continue;
          if (Math.abs(t.x - x) < t.r + 0.45) { g.damageTarget(t, this.beamDps * dt, 'beam'); if (Math.random() < 0.3) fx.sparks(t.x, t.y, 1, [1, 0.6, 0.9], 2, 5); }
        }
      }
      // agujero negro
      for (let i = this.wells.length - 1; i >= 0; i--) {
        const w = this.wells[i];
        w.t -= dt;
        for (let k = 0; k < 3; k++) { const a = Math.random() * 6.28, r = U.rand(1, 3.2); fx.emit(w.x + Math.cos(a) * r, w.y + Math.sin(a) * r, 1, -Math.cos(a) * r * 2, -Math.sin(a) * r * 2, 0, 0.5, 0.25, 0.05, [0.6, 0.35, 1], 0.9, 2, true, 0, 0); }
        g.meteors.forEachAlive((m) => {
          const d = Math.hypot(m.x - w.x, m.y - w.y);
          if (d < 1.4 + m.r && m.tier <= 1) { m.noSplit = true; if (m.damage(1e9)) g.onKill(m); }
          else if (d < 2.6 + m.r) { if (m.damage(w.dps * dt)) g.onKill(m); }
        });
        if (w.t <= 0) { const gw = g.gravityWells, j = gw.indexOf(w); if (j >= 0) gw.splice(j, 1); this.wells.splice(i, 1); fx.shock(w.x, w.y, 3, [0.6, 0.35, 1], 0.4); }
      }
      // casco espejo
      if (this.mirrorT > 0) {
        this.mirrorT -= dt;
        if (Math.random() < 0.4) fx.shock(p.x, p.y, 2.4, [0.8, 0.9, 1], 0.25);
        for (const b of g.bullets.eb) {
          if (!b.alive || b.pvp || Math.hypot(b.x - p.x, b.y - p.y) > 2.6) continue;
          b.alive = false;
          const t = g.nearestTarget(b.x, b.y, 40, null, false);
          if (t) { fx.arc(b.x, b.y, 1, t.x, t.y, 1, [0.8, 0.95, 1], 0.2); g.damageTarget(t, this.mirrorDmg, 'mirror'); }
          fx.burst(b.x, b.y, 1, [0.8, 0.95, 1], 5, 4, 0.3, 0.3);
        }
      }
      if (this.domeT > 0) { this.domeT -= dt; if (Math.random() < 0.35) fx.shock(p.x, p.y, 2.2, [0.4, 1, 0.7], 0.3); }
      // enemigos congelados: brillo helado
      if (Math.random() < 0.5) {
        const frost = (e) => { if (e.frozenT > 0 && Math.random() < 0.2) fx.emit(e.x + U.rand(-e.r, e.r), e.y + U.rand(-e.r, e.r), (e.z || 1), 0, 0, 0.6, 0.5, 0.25, 0.05, [0.7, 0.9, 1], 0.9, 2, true, 0, 0); };
        g.meteors.forEachAlive(frost); g.aliens.forEachAlive(frost);
      }
    }
    detonate(m) {
      const g = this.game, fx = g.fx;
      fx.explode(m.x, m.y, 1, m.R * 0.6, m.col, 1.2);
      fx.shock(m.x, m.y, m.R, m.col, 0.5);
      g.world.addShake(m.kind === 'drone' ? 0.15 : 0.5);
      g.audio.sfx(m.kind === 'drone' ? 'explode' : 'explodeBig');
      if (m.freeze) {
        const fr = (e) => { if (Math.hypot(e.x - m.x, e.y - m.y) < m.R + e.r) e.frozenT = m.freeze; };
        g.meteors.forEachAlive(fr); g.aliens.forEachAlive(fr);
        if (g.boss && g.boss.alive && Math.hypot(g.boss.x - m.x, g.boss.y - m.y) < m.R + 3) g.boss.frozenT = m.freeze * 0.4;
      }
      g.areaDamage(m.x, m.y, m.R, m.dmg, null);
    }

    // ---------- HUD ----------
    renderHud() {
      const el = $('h-arsenal'); if (!el) return;
      const on = this.enabled();
      el.hidden = !on;
      if (!on) return;
      const s = this.set();
      el.innerHTML = s.map((id, i) => {
        const w = this.def(id); if (!w) return '';
        const used = !this.charges[i];
        return '<button class="ars' + (used ? ' used' : '') + '" data-ars="' + i + '" style="--c:' + TYPES[w.type].col + '" aria-label="' + w.name + '"><b>' + w.ic + '</b><small>' + (used ? 'BOSS' : (i + 1)) + '</small></button>';
      }).join('');
    }

    // ---------- pantalla ARSENAL ----------
    initUI() {
      const g = this.game;
      const on = (id, fn) => { const el = $(id); if (el) el.addEventListener('click', (e) => { e.preventDefault(); g.audio.unlock(); g.audio.sfx('click'); fn(e); }); };
      on('btn-arsenal', () => this.open());
      on('ars-back', () => g.ui.showMenu());
      $('h-arsenal').addEventListener('pointerdown', (e) => { const b = e.target.closest('button[data-ars]'); if (!b) return; e.preventDefault(); e.stopPropagation(); this.use(+b.dataset.ars); });
      window.addEventListener('keydown', (e) => { if (e.key === '1' || e.key === '2' || e.key === '3') { if (this.canFire()) this.use(+e.key - 1); } });
      $('ars-sets').addEventListener('click', (e) => { const b = e.target.closest('button[data-set]'); if (!b) return; g.audio.sfx('click'); this.data.cur = +b.dataset.set; g.save.save(true); this.render(); });
      $('ars-slots').addEventListener('click', (e) => { const b = e.target.closest('[data-slot]'); if (!b) return; g.audio.sfx('click'); this.selSlot = +b.dataset.slot; this.render(); });
      $('ars-filter').addEventListener('click', (e) => { const b = e.target.closest('button[data-f]'); if (!b) return; g.audio.sfx('click'); this.filter = b.dataset.f; this.render(); });
      $('ars-list').addEventListener('click', (e) => {
        const b = e.target.closest('button[data-act]'); if (!b) return;
        const id = b.dataset.id, act = b.dataset.act;
        let ok = false;
        if (act === 'buy') ok = this.buy(id);
        else if (act === 'up') ok = this.upgrade(id);
        else if (act === 'eq') { ok = this.equip(id, this.selSlot); if (ok) this.selSlot = (this.selSlot + 1) % 3; }
        g.audio.sfx(ok ? (act === 'eq' ? 'click' : 'buy') : 'deny');
        if (ok && act !== 'eq') g.vibrate(20);
        this.render();
      });
    }
    open() { this.game.ui.show('s-arsenal'); this.render(); }
    price(p) {
      return '<svg viewBox="0 0 24 24"><use href="#i-coin"/></svg>' + U.fmt(p.coins);
    }
    render() {
      if (!$('s-arsenal') || $('s-arsenal').hidden) return;
      const g = this.game, a = this.data, s = this.set();
      $('ars-coins').textContent = U.fmt(g.save.data.coins);
      for (const b of $('ars-sets').children) b.classList.toggle('on', +b.dataset.set === a.cur);
      for (const b of $('ars-filter').children) b.classList.toggle('on', b.dataset.f === this.filter);
      $('ars-slots').innerHTML = s.map((id, i) => {
        const w = this.def(id);
        return '<div class="aslot' + (i === this.selSlot ? ' sel' : '') + '" data-slot="' + i + '" style="--c:' + (w ? TYPES[w.type].col : '#667') + '"><small>' + (i + 1) + '</small><b>' + (w ? w.ic : '+') + '</b><span>' + (w ? w.name : 'VACÍO') + '</span><em>' + (w ? 'NV ' + this.lvl(id) : '') + '</em></div>';
      }).join('');
      const counts = { off: 0, ctl: 0, def: 0, eco: 0 };
      for (const id of s) { const w = this.def(id); if (w) counts[w.type]++; }
      const build = counts.off >= 2 ? 'OFENSIVO' : counts.def >= 2 ? 'DEFENSIVO' : counts.ctl >= 2 ? 'CONTROL' : counts.eco >= 2 ? 'FARMEO' : 'MIXTO';
      $('ars-build').textContent = 'BUILD ' + build;
      $('ars-list').innerHTML = W.filter((w) => this.filter === 'all' || w.type === this.filter).map((w) => {
        const l = this.lvl(w.id), T = TYPES[w.type];
        const pips = '<div class="pips">' + Array.from({ length: MAXLVL }, (_, i) => '<i class="' + (i < l ? 'on' : '') + '"></i>').join('') + '</div>';
        let btns = '';
        if (!l) {
          const p = this.priceOf(this.buyCost(w));
          btns = '<button class="buy' + (this.canPay(p) ? '' : ' no') + '" data-act="buy" data-id="' + w.id + '">' + this.price(p) + '</button>';
        } else {
          const inSet = s.indexOf(w.id);
          btns = '<button class="buy eqb' + (inSet >= 0 ? ' done' : '') + '" data-act="eq" data-id="' + w.id + '">' + (inSet >= 0 ? 'EN ' + (inSet + 1) : 'EQUIPAR') + '</button>';
          if (l < MAXLVL) { const p = this.priceOf(this.upCost(w, l)); btns += '<button class="buy up' + (this.canPay(p) ? '' : ' no') + '" data-act="up" data-id="' + w.id + '">▲ ' + this.price(p) + '</button>'; }
          else btns += '<button class="buy done up">MÁX</button>';
        }
        return '<div class="item ars-item' + (s.indexOf(w.id) >= 0 ? ' eq' : '') + '"><div class="sw" style="color:' + T.col + ';border:1.5px solid ' + T.col + ';background:rgba(255,255,255,.05)">' + w.ic + '</div>' +
          '<div class="inf"><div class="nm">' + w.name + '</div><div class="tp" style="color:' + T.col + '">' + T.name + '</div><div class="ds">' + w.desc + '</div>' + pips + '</div><div class="abtns">' + btns + '</div></div>';
      }).join('');
    }
  }
  BB.Arsenal = Arsenal;
})(window.BB);
