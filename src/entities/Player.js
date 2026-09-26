/* entities/Player.js — cañón/nave 3D del jugador: movimiento, disparo automático, retroceso, escudo */
(function (BB) {
  'use strict';
  const U = BB.U;
  const MULTI = [1, 2, 3, 5, 7];

  class Player {
    constructor(game) {
      this.game = game;
      this.node = new BB.Node();
      this.node.boundR = 1.5;
      this.matHull = BB.mat({ spec: 0.9, shin: 38, rim: [0.4, 0.8, 1, 0.55], glow: 1.2 });
      this.matCore = BB.mat({ spec: 0, glow: 1.5, rim: [1, 1, 1, 0.5] });
      this.base = this.node.add(new BB.Node(null, this.matHull));
      this.turret = this.node.add(new BB.Node(null, this.matHull));
      this.barrel = this.node.add(new BB.Node(null, this.matHull));
      this.barrel.pz = 0.72; this.barrel.py = 0.25;
      this.core = this.node.add(new BB.Node(null, this.matCore));
      this.core.setPos(0, -0.28, 1.08);
      this.matBubble = BB.mat({ color: [0.3, 0.6, 1], spec: 0, glow: 0, rim: [0.4, 0.8, 1, 1.6], blend: 2, opacity: 0.35, depthWrite: false });
      this.bubble = this.node.add(new BB.Node(BB.Models.geo.bubble, this.matBubble));
      this.bubble.setScale(1.45); this.bubble.pz = 0.6; this.bubble.visible = false; this.bubble.castShadow = false;
      this.skin = null; this.cannon = null;
      this.reset();
    }

    rebuild(skinId, cannonId) {
      if (skinId === this.skin && cannonId === this.cannon) return;
      const parts = BB.Models.playerParts(skinId, cannonId);
      this.base.geo = parts.base; this.turret.geo = parts.turret; this.barrel.geo = parts.barrel; this.core.geo = parts.core;
      this.core.tint = parts.skin.accent;
      this.accent = parts.skin.accent;
      this.skin = skinId; this.cannon = cannonId;
    }

    reset() {
      this.x = 0; this.y = BB.ARENA.playerY; this.targetX = 0; this.vx = 0;
      this.fireT = 0; this.recoil = 0; this.invuln = 0; this.engineT = 0;
      this.r = 0.72; this.alive = true; this.t = 0;
      this.node.visible = true;
      this.node.setPos(0, this.y, 0);
      this.node.rx = this.node.ry = this.node.rz = 0;
    }

    update(dt, firing) {
      const A = BB.ARENA, g = this.game;
      this.t += dt;
      const lim = A.halfW - 0.8;
      this.targetX = U.clamp(this.targetX + (g.playerPull || 0) * dt, -lim, lim);
      let nx = U.damp(this.x, this.targetX, 20, dt);
      if (this.maxSpeed) nx = this.x + U.clamp(nx - this.x, -this.maxSpeed * dt, this.maxSpeed * dt);
      this.vx = (nx - this.x) / Math.max(dt, 1e-4);
      this.x = U.clamp(nx, -lim, lim);
      const n = this.node;
      n.px = this.x; n.py = this.y; n.pz = 0.05 + Math.sin(this.t * 3) * 0.05;
      n.ry = U.clamp(-this.vx * 0.035, -0.4, 0.4);
      n.rz = U.clamp(-this.vx * 0.01, -0.12, 0.12);
      this.recoil = Math.max(0, this.recoil - dt * 7);
      this.barrel.py = 0.25 - this.recoil * 0.22;
      this.core.glow = 0.8 + Math.sin(this.t * 6) * 0.35;
      this.core.setScale(1 + Math.sin(this.t * 6) * 0.12);
      // invulnerabilidad: parpadeo
      if (this.invuln > 0) {
        this.invuln -= dt;
        const on = Math.floor(this.invuln * 14) % 2 === 0;
        this.base.visible = this.turret.visible = this.barrel.visible = on || this.invuln <= 0;
      } else {
        this.base.visible = this.turret.visible = this.barrel.visible = true;
      }
      const shieldOn = g.boosts && g.boosts.isActive('shield');
      this.bubble.visible = !!shieldOn;
      if (shieldOn) { this.bubble.ry += dt; this.bubble.opacity = 0.8 + Math.sin(this.t * 8) * 0.2; }

      // propulsores
      this.engineT -= dt;
      if (this.engineT <= 0) {
        this.engineT = 0.045;
        const ac = this.accent || [0.3, 0.9, 1];
        for (const s of [-1, 1]) g.fx.emit(this.x + s * 0.98, this.y - 0.7, 0.36, (Math.random() - 0.5) * 0.4, -2.5 - Math.random(), 0.2, 0.3, 0.32, 0.05, ac, 0.8, 0, true, 1, 0);
      }

      if (firing) {
        this.fireT -= dt;
        if (this.fireT <= 0) {
          const st = g.stats;
          const rapid = g.boosts.isActive('rapid') ? 2.0 : 1;
          this.fireT += 1 / (st.rate * rapid);
          if (this.fireT < -0.1) this.fireT = 0;
          this.fire();
        }
      }
    }

    fire() {
      const g = this.game, st = g.stats, bt = g.bullets.ptype || BB.BULLET_TYPES.plasma;
      const tier = g.boosts.multiTier();
      const N = MULTI[tier] || 1;
      const big = g.boosts.isActive('big');
      const dmg = st.dmg * bt.dmg * (g.boosts.isActive('damage') ? 1.7 : 1) * (big ? 1.5 : 1);
      const r = bt.r * (big ? 2.0 : 1);
      const sp = bt.speed;
      const z = 0.78, y0 = this.y + 1.3;
      const cannonTwin = this.cannon === 'twin' && g.state !== 'PVP';
      // en el duelo el daño total de la ráfaga está acotado (x7 no multiplica x7)
      const pvpK = g.state === 'PVP' ? BB.volleyFactor(N) / N : 1;
      for (const pt of BB.firePattern(N)) {
        const ang = pt.ang, ox = pt.ox;
        const dmgB = dmg * pvpK;
        if (cannonTwin && N === 1) {
          g.bullets.firePlayer(this.x - 0.17, y0, z, 0, sp, dmg * 0.6, r);
          g.bullets.firePlayer(this.x + 0.17, y0, z, 0, sp, dmg * 0.6, r);
        } else {
          g.bullets.firePlayer(this.x + ox, y0, z, Math.sin(ang) * sp, Math.cos(ang) * sp, dmgB, r);
        }
      }
      this.recoil = 1;
      this.shots = (this.shots || 0) + 1;
      const c = bt.color;
      g.fx.emit(this.x, y0 + 0.05, z, 0, 2, 0, 0.07, 0.55 * (big ? 1.6 : 1), 0.9, c, 1, 3, true, 0, 0);
      g.audio.sfx('shoot');
    }
  }
  // Patrón de disparo compartido (jugador y simulación del rival en el duelo)
  BB.firePattern = function (N) {
    const T = { 2: [0.03, 0.26], 3: [0.1, 0.26], 5: [0.36, 0.18], 7: [0.56, 0.16] }[N] || [0, 0];
    const out = [];
    for (let i = 0; i < N; i++) {
      const f = N === 1 ? 0 : i / (N - 1) - 0.5;
      out.push({ ang: f * T[0], ox: f * T[1] * (N - 1) });
    }
    return out;
  };
  BB.volleyFactor = (N) => ({ 1: 1, 2: 1.5, 3: 1.9, 5: 2.4, 7: 2.8 }[N] || 1);
  BB.Player = Player;
  BB.MULTI_LEVELS = MULTI;
})(window.BB);
