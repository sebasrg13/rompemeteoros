/* entities/PowerUp.js — boosts (activos, inventario, cápsulas 3D) y monedas 3D animadas */
(function (BB) {
  'use strict';
  const U = BB.U;

  BB.BOOSTS = {
    multi: { name: 'MULTI SHOT', desc: 'Más proyectiles por disparo (x2 → x3 → x5 → x7)', dur: 12 },
    rapid: { name: 'RAPID FIRE', desc: 'Duplica la cadencia de disparo', dur: 10 },
    big: { name: 'BIG BULLET', desc: 'Proyectiles gigantes y más fuertes', dur: 10 },
    damage: { name: 'DAMAGE', desc: '+70% de daño', dur: 10 },
    shield: { name: 'SHIELD', desc: 'Burbuja que absorbe un impacto', dur: 12 },
    magnet: { name: 'MAGNET', desc: 'Atrae monedas y boosts', dur: 12 },
    coin: { name: 'COIN BOOST', desc: 'Monedas x2', dur: 15 },
    squad: { name: 'MINI SQUAD', desc: 'Mini naves con balas rebotadoras', dur: 14 },
  };
  BB.BOOST_KEYS = Object.keys(BB.BOOSTS);

  // ---------------- Gestor de boosts ----------------
  class BoostManager {
    constructor(game) {
      this.game = game;
      this.active = {};
      this.tier = 0;
      this.inventory = [];
      this.changed = true;
    }
    reset(keepInventory) {
      this.active = {}; this.tier = 0; this.changed = true;
      if (!keepInventory) this.inventory = [];
    }
    isActive(k) { const a = this.active[k]; return !!(a && a.t > 0); }
    multiTier() { return this.isActive('multi') ? this.tier : 0; }
    activate(k, silent) {
      const g = this.game, st = g.stats;
      const def = BB.BOOSTS[k];
      if (!def) return;
      let dur = def.dur;
      if (k === 'shield') dur += st.shieldBonus;
      if (k === 'squad') dur = st.squadDur;
      if (k === 'multi') this.tier = Math.min(4, (this.isActive('multi') ? this.tier : 0) + 1);
      this.active[k] = { t: dur, max: dur };
      if (k === 'squad') g.squad.activate(st.squadCount, dur);
      this.changed = true;
      if (!silent) {
        const p = g.player;
        const label = k === 'multi' ? 'MULTI x' + BB.MULTI_LEVELS[this.tier] : def.name;
        g.ui.toast(label, BB.Tex.BOOST_COLORS[k]);
        g.audio.sfx('boost');
        g.fx.burst(p.x, p.y, 0.8, U.hex(parseInt(BB.Tex.BOOST_COLORS[k].slice(1), 16)), 22, 6, 0.45, 0.6);
        g.fx.shock(p.x, p.y, 3.5, U.hex(parseInt(BB.Tex.BOOST_COLORS[k].slice(1), 16)), 0.5);
        g.vibrate(15);
      }
    }
    consume(k) { if (this.active[k]) { this.active[k].t = 0; this.changed = true; } }
    addInventory(k) {
      if (this.inventory.length >= 3) return false;
      this.inventory.push(k); this.changed = true; return true;
    }
    useInventory(i) {
      const k = this.inventory[i];
      if (!k) return;
      this.inventory.splice(i, 1);
      this.activate(k);
      this.changed = true;
    }
    update(dt) {
      for (const k in this.active) {
        const a = this.active[k];
        if (a.t > 0) {
          a.t -= dt;
          if (a.t <= 0) { a.t = 0; this.changed = true; if (k === 'multi') this.tier = 0; if (k === 'squad') this.game.squad.endBoost(); }
        }
      }
    }
  }
  BB.BoostManager = BoostManager;

  // ---------------- Cápsulas de boost y monedas ----------------
  class Pickups {
    constructor(game, root) {
      this.game = game;
      this.caps = [];
      for (let i = 0; i < 8; i++) {
        const mat = BB.mat({ spec: 0, glow: 1.4, rim: [1, 1, 1, 0.6] });
        const n = new BB.Node(BB.Models.geo.puRing, mat);
        n.visible = false; n.castShadow = true;
        root.add(n);
        this.caps.push({ alive: false, node: n, mat });
      }
      this.coins = [];
      for (let i = 0; i < 140; i++) this.coins.push({ alive: false });
      this.coinMat = BB.mat({ color: [1, 0.85, 0.35], spec: 1.4, shin: 36, rim: [1, 0.85, 0.3, 0.8], glow: 0.6 });
      this.coinBatch = new BB.InstBatch(BB.Models.geo.coin, this.coinMat, 140);
      this.uvGlow = BB.Tex.cellUV(0); this.uvStar = BB.Tex.cellUV(3);
      this.vacuum = false;
    }

    clear() {
      for (const c of this.caps) { c.alive = false; c.node.visible = false; }
      for (const c of this.coins) c.alive = false;
      this.vacuum = false;
    }

    spawnBoost(x, y, type) {
      const c = this.caps.find((o) => !o.alive);
      if (!c) return;
      type = type || U.pick(BB.BOOST_KEYS);
      c.alive = true; c.type = type; c.x = U.clamp(x, -BB.ARENA.halfW + 0.8, BB.ARENA.halfW - 0.8); c.y = y; c.z = 1.2; c.t = 0; c.wait = 0;
      c.mat.color = U.hex(parseInt(BB.Tex.BOOST_COLORS[type].slice(1), 16));
      c.node.visible = true;
    }

    spawnCoins(x, y, z, value, maxPieces) {
      if (value <= 0) return;
      const pieces = Math.min(value, maxPieces || 7);
      const per = Math.floor(value / pieces);
      let rest = value - per * pieces;
      for (let i = 0; i < pieces; i++) {
        const c = this.coins.find((o) => !o.alive);
        if (!c) { this.game.addCoins(per + rest); rest = 0; continue; }
        const a = Math.random() * Math.PI * 2, sp = U.rand(1, 3.2);
        c.alive = true; c.x = x; c.y = y; c.z = z || 1; c.vx = Math.cos(a) * sp; c.vy = Math.sin(a) * sp + 1; c.vz = U.rand(4, 7);
        c.value = per + (i === 0 ? rest : 0); c.t = 0; c.rest = 0; c.spin = Math.random() * 6; c.home = false;
      }
    }

    update(dt) {
      const g = this.game, p = g.player, A = BB.ARENA;
      const magnet = g.boosts.isActive('magnet') || this.vacuum;
      const mr = g.ship ? g.ship.magnetR() : 0;   // pasiva Imán de la nave
      for (const c of this.caps) {
        if (!c.alive) continue;
        c.t += dt;
        if (magnet) {
          const dx = p.x - c.x, dy = p.y - c.y, l = Math.hypot(dx, dy) || 1;
          c.x += (dx / l) * 10 * dt; c.y += (dy / l) * 10 * dt;
        } else if (c.y > 0.9) c.y -= 3.0 * dt;
        else { c.wait += dt; }
        c.z = 1.2 + Math.sin(c.t * 4) * 0.2;
        const n = c.node;
        n.px = c.x; n.py = c.y; n.pz = c.z; n.rz = c.t * 2.5; n.rx = c.t * 1.3;
        n.setScale(1 + Math.sin(c.t * 6) * 0.06);
        if (c.wait > 4) { n.visible = Math.floor(c.t * 8) % 2 === 0; }
        if (c.wait > 5.5) { c.alive = false; n.visible = false; continue; }
        if (Math.hypot(p.x - c.x, p.y - c.y) < 1.35) {
          c.alive = false; n.visible = false;
          g.boosts.activate(c.type);
        }
      }
      for (const c of this.coins) {
        if (!c.alive) continue;
        c.t += dt; c.spin += dt * 7;
        const dx = p.x - c.x, dy = p.y - c.y, dist = Math.hypot(dx, dy);
        if (mr > 0 && !c.home && c.t > 0.35 && dist < mr) c.home = true;
        if ((magnet && c.t > 0.35) || c.home) {
          const sp = 16 + c.t * 4;
          c.x += (dx / (dist || 1)) * sp * dt; c.y += (dy / (dist || 1)) * sp * dt;
          c.z = U.damp(c.z, 0.9, 6, dt);
        } else {
          c.vz -= 18 * dt;
          c.x += c.vx * dt; c.y += c.vy * dt; c.z += c.vz * dt;
          if (c.z < 0.35) { c.z = 0.35; c.vz = Math.abs(c.vz) * 0.35; c.vx *= 0.6; if (Math.abs(c.vz) < 1) c.vz = 0; }
          if (c.t > 0.5) c.vy = U.damp(c.vy, -6, 3, dt);
          c.vx *= Math.exp(-1.5 * dt);
          if (c.x < -A.halfW + 0.3) { c.x = -A.halfW + 0.3; c.vx = Math.abs(c.vx); }
          if (c.x > A.halfW - 0.3) { c.x = A.halfW - 0.3; c.vx = -Math.abs(c.vx); }
          if (c.y < 0.5) { c.y = 0.5; c.vy = 0; c.rest += dt; }
          if (c.rest > 2.8) { c.alive = false; continue; }
        }
        if (dist < 1.05) {
          c.alive = false;
          const v = c.value * (g.boosts.isActive('coin') ? 2 : 1);
          g.addCoins(v);
          g.fx.emit(c.x, c.y, c.z, 0, 0, 1.5, 0.3, 0.4, 0.9, [1, 0.85, 0.3], 1, 3, true, 0, 0);
          g.audio.sfx('coin');
        }
      }
    }

    collectAll() { this.vacuum = true; for (const c of this.coins) if (c.alive) c.home = true; }
    remaining() { let n = 0; for (const c of this.coins) if (c.alive) n++; return n; }

    render(add, alpha) {
      const b = this.coinBatch;
      b.reset();
      for (const c of this.coins) {
        if (!c.alive) continue;
        const fade = c.rest > 2.0 ? (Math.floor(c.t * 10) % 2 ? 0.3 : 1) : 1;
        b.push(c.x, c.y, c.z, 1, c.spin, 1, fade, 0);
        if ((c.spin | 0) % 5 === 0) add.bill(c.x, c.z + 0.1, -c.y, 0.35, 0.35, c.t * 3, this.uvStar, 1, 0.9, 0.5, 0.6);
      }
      for (const c of this.caps) {
        if (!c.alive || !c.node.visible) continue;
        const col = c.mat.color;
        add.bill(c.x, c.z, -c.y, 1.3, 1.3, 0, this.uvGlow, col[0], col[1], col[2], 0.6);
        alpha.bill(c.x, c.z, -c.y, 0.5, 0.5, 0, BB.Tex.cellUV(BB.Tex.ICON_CELL[c.type]), 1, 1, 1, 1);
      }
    }
  }
  BB.Pickups = Pickups;
})(window.BB);
