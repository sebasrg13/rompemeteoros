/* entities/Meteor.js — meteoritos 3D con vida, rebote, rotación, división y tipos especiales */
(function (BB) {
  'use strict';
  const U = BB.U;
  const TIER_R = [0, 0.62, 0.95, 1.35, 1.95];
  const TIER_BOUNCE = [null, [5.5, 8], [7, 10.5], [9, 12.5], [11, 14]];
  const TIER_SCORE = [0, 100, 250, 500, 1000];
  const TIER_COINS = [0, 1, 2, 4, 8];

  BB.METEOR_INFO = {
    normal: { name: 'Normal', armor: 1 },
    armored: { name: 'Blindado', armor: 0.55 },
    explosive: { name: 'Explosivo', armor: 1 },
    electric: { name: 'Eléctrico', armor: 1 },
    crystal: { name: 'Cristal', armor: 1 },
    giant: { name: 'Gigante', armor: 1 },
  };
  const DEATH_COL = {
    normal: [1, 0.6, 0.3], armored: [0.7, 0.85, 1], explosive: [1, 0.45, 0.1], electric: [0.35, 0.95, 1], crystal: [0.75, 0.5, 1], giant: [1, 0.4, 0.15],
  };

  class Meteor {
    constructor(game, root) {
      this.game = game;
      this.node = new BB.Node(null, null);
      this.node.visible = false;
      this.node.boundR = 2;
      root.add(this.node);
      this.alive = false;
      this.kind = 'meteor';
    }

    spawn(o) {
      const Mo = BB.Models;
      this.type = o.type || 'normal';
      this.tier = o.tier || 2;
      this.r = TIER_R[this.tier] * (this.type === 'crystal' ? 0.95 : 1);
      this.x = o.x; this.y = o.y; this.vx = o.vx || 0; this.vy = o.vy || 0;
      this.hp = this.maxHp = Math.max(1, Math.round(o.hp));
      this.g = o.g || 7.5;
      const bh = TIER_BOUNCE[Math.min(4, this.tier)];
      this.bounceH = U.rand(bh[0], bh[1]) * (o.bounceK || 1);
      this.alive = true; this.flash = 0; this.pulse = 0; this.t = Math.random() * 10; this.frozenT = 0;
      this.wr = [U.rand(-1.2, 1.2), U.rand(-1.2, 1.2), U.rand(-1, 1)];
      this.entering = this.y > BB.ARENA.top;
      this.noSplit = !!o.noSplit;
      this.hover = false; this.pvpId = null;
      this.fromBoss = !!o.fromBoss;
      this.arcT = Math.random();
      const n = this.node;
      n.geo = U.pick(Mo.geo.meteor[this.type]);
      n.mat = Mo.mat['meteor_' + this.type];
      n.visible = true; n.flash = 0; n.opacity = 1; n.tint = null;
      n.rx = Math.random() * 6; n.ry = Math.random() * 6; n.rz = Math.random() * 6;
      n.boundR = this.r * 1.5;
      this.updateNode();
      return this;
    }

    update(dt) {
      const A = BB.ARENA;
      this.t += dt;
      const r = this.r;
      if (this.hover) {
        // obstáculo flotante del duelo: se desplaza de lado a lado
        this.x += this.vx * dt;
        this.y = this.baseY + Math.sin(this.t * 0.7) * 0.7;
        if (this.x - r < -A.halfW) { this.x = -A.halfW + r; this.vx = Math.abs(this.vx); }
        if (this.x + r > A.halfW) { this.x = A.halfW - r; this.vx = -Math.abs(this.vx); }
        const n = this.node;
        n.rx += this.wr[0] * dt * 0.5; n.ry += this.wr[1] * dt * 0.5;
        this.flash = Math.max(0, this.flash - dt * 7); this.pulse = Math.max(0, this.pulse - dt * 6);
        n.flash = this.flash;
        if (this.type === 'explosive') n.glow = 0.75 + Math.sin(this.t * 7) * 0.45;
        this.updateNode();
        return;
      }
      this.vy -= this.g * dt;
      this.x += this.vx * dt; this.y += this.vy * dt;
      if (this.x - r < -A.halfW) { this.x = -A.halfW + r; this.vx = Math.abs(this.vx); }
      if (this.x + r > A.halfW) { this.x = A.halfW - r; this.vx = -Math.abs(this.vx); }
      if (this.y - r < 0 && this.vy < 0) {
        this.y = r;
        this.vy = Math.sqrt(2 * this.g * Math.max(2, this.bounceH - r));
        // polvo al rebotar
        if (this.tier >= 3) { this.game.fx.smoke(this.x, this.y, 0.2, 2, r * 0.7, [0.4, 0.45, 0.6]); this.game.world.addShake(0.08 * this.tier); }
      }
      if (this.y < A.top) this.entering = false;
      // techo: nunca escapan demasiado lejos por encima de la arena
      if (!this.entering && this.y > A.top + 1.5 && this.vy > 2.5) this.vy = 2.5;
      const n = this.node;
      n.rx += this.wr[0] * dt; n.ry += this.wr[1] * dt; n.rz += this.wr[2] * dt;
      this.flash = Math.max(0, this.flash - dt * 7);
      this.pulse = Math.max(0, this.pulse - dt * 6);
      n.flash = this.flash;
      if (this.type === 'explosive') n.glow = 0.75 + Math.sin(this.t * 7) * 0.45;
      if (this.type === 'electric') {
        n.glow = 0.9 + Math.random() * 0.4;
        this.arcT -= dt;
        if (this.arcT <= 0) {
          this.arcT = 0.25 + Math.random() * 0.5;
          const a = Math.random() * 6.28;
          const fx = this.game.fx, z = this.z;
          fx.arc(this.x + Math.cos(a) * r * 0.5, this.y + Math.sin(a) * r * 0.5, z, this.x + Math.cos(a) * r * 1.5, this.y + Math.sin(a) * r * 1.5, z + (Math.random() - 0.5), [0.4, 0.9, 1], 0.15);
        }
      }
      this.updateNode();
    }

    updateNode() {
      const n = this.node;
      this.z = this.r + 0.25 + Math.sin(this.t * 2.2) * 0.12;
      n.px = this.x; n.py = this.y; n.pz = this.z;
      const s = this.r * (1 + this.pulse * 0.08);
      n.setScale(s);
    }

    // devuelve true si muere
    damage(d) {
      if (!this.alive) return false;
      const info = BB.METEOR_INFO[this.type];
      this.hp -= d * (info ? info.armor : 1);
      this.flash = 0.4; this.pulse = 1;
      if (this.hp <= 0) { this.hp = 0; return true; }
      return false;
    }

    kill() {
      const g = this.game, fx = g.fx;
      this.alive = false;
      this.node.visible = false;
      const col = DEATH_COL[this.type] || [1, 0.6, 0.3];
      fx.explode(this.x, this.y, this.z, this.r, col, this.tier >= 3 ? 1.3 : 1);
      g.world.addShake(0.12 + this.tier * 0.1);
      g.audio.sfx(this.tier >= 3 ? 'explodeBig' : 'explode');
      if (this.tier >= 3) g.vibrate(25);
      // efectos especiales por tipo
      if (this.type === 'explosive') {
        const R = this.r * 3.4;
        fx.shock(this.x, this.y, R * 1.3, [1, 0.5, 0.1], 0.6);
        fx.burst(this.x, this.y, this.z, [1, 0.55, 0.15], 26, 10, 0.8, 0.6);
        g.world.addShake(0.4);
        g.areaDamage(this.x, this.y, R, Math.max(4, this.maxHp * 0.6), this);
        g.audio.sfx('explodeBig');
      } else if (this.type === 'electric') {
        const targets = g.nearestTargets(this.x, this.y, 3, 9, this);
        for (const t of targets) {
          fx.arc(this.x, this.y, this.z, t.x, t.y, t.z || 1, [0.5, 0.95, 1], 0.35);
          g.damageTarget(t, Math.max(3, this.maxHp * 0.45), 'arc');
        }
        g.audio.sfx('zap');
      }
      // división en piezas 3D independientes
      if (!this.noSplit && this.tier >= 2) {
        const pieces = this.type === 'crystal' || this.type === 'giant' ? 3 : 2;
        const childTier = this.tier - 1;
        const childType = this.type === 'giant' ? U.pick(['normal', 'normal', 'explosive']) : this.type === 'explosive' ? 'normal' : this.type;
        const hp = Math.max(1, Math.round(this.maxHp * (pieces === 3 ? 0.36 : 0.48)));
        for (let i = 0; i < pieces; i++) {
          const dir = pieces === 2 ? (i === 0 ? -1 : 1) : i - 1;
          g.spawnMeteor({
            type: childType, tier: childTier, x: this.x + dir * this.r * 0.4, y: this.y, vx: dir * U.rand(1.8, 2.8) + (dir === 0 ? U.rand(-0.6, 0.6) : 0),
            vy: U.rand(5, 8), hp, g: this.g, fromBoss: this.fromBoss,
          });
        }
      }
    }

    get score() { return TIER_SCORE[this.tier] || 100; }
    get coins() { return TIER_COINS[this.tier] || 1; }
  }
  BB.Meteor = Meteor;
  BB.METEOR_TIER_R = TIER_R;
})(window.BB);
