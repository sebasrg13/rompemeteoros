/* entities/Alien.js — aliens 3D (normal, rápido, tanque, tirador) con animación y comportamiento propio */
(function (BB) {
  'use strict';
  const U = BB.U;

  BB.ALIEN_INFO = {
    normal: { name: 'Alien', hp: 14, r: 0.95, speed: 1.8, score: 750, coins: 5, color: [0.4, 1, 0.5] },
    fast: { name: 'Alien rápido', hp: 9, r: 0.8, speed: 4.2, score: 750, coins: 5, color: [1, 0.75, 0.2] },
    tank: { name: 'Alien tanque', hp: 42, r: 1.2, speed: 0.9, score: 1200, coins: 10, color: [0.7, 0.4, 1] },
    shooter: { name: 'Alien tirador', hp: 20, r: 0.95, speed: 2.2, score: 900, coins: 7, color: [1, 0.3, 0.35] },
  };

  class Alien {
    constructor(game, root) {
      this.game = game;
      this.matBody = BB.mat({ spec: 0.8, shin: 32, rim: [0.6, 1, 0.8, 0.5], glow: 1.3 });
      this.node = new BB.Node(null, this.matBody);
      this.node.visible = false;
      this.node.boundR = 2;
      this.limbs = this.node.add(new BB.Node(null, this.matBody));
      root.add(this.node);
      this.alive = false;
      this.kind = 'alien';
    }

    spawn(type, x, hpScale, speedScale, opts) {
      opts = opts || {};
      const info = BB.ALIEN_INFO[type] || BB.ALIEN_INFO.normal;
      const parts = BB.Models.geo.alien[type] || BB.Models.geo.alien.normal;
      this.type = type; this.info = info;
      this.node.geo = parts.body; this.limbs.geo = parts.limbs;
      this.x = x; this.y = opts.y !== undefined ? opts.y : BB.ARENA.spawnY;
      this.r = info.r * (opts.scale || 1);
      this.hp = this.maxHp = Math.max(1, Math.round(info.hp * hpScale * (opts.hpK || 1)));
      this.speed = info.speed * speedScale;
      this.targetY = opts.targetY || U.rand(10.5, 16);
      this.state = 'enter';
      this.t = Math.random() * 10; this.fireT = U.rand(1.2, 2.6); this.diveT = U.rand(2.5, 4);
      this.dir = Math.random() < 0.5 ? -1 : 1;
      this.vx = 0; this.vy = 0;
      this.flash = 0;
      this.alive = true; this.frozenT = 0;
      this.scale = opts.scale || 1;
      this.node.visible = true; this.node.opacity = 1;
      this.node.setScale(this.scale);
      this.matBody.rim = [info.color[0], info.color[1], info.color[2], 0.55];
      this.z = 1.4;
      this.update(0);
      return this;
    }

    update(dt) {
      const A = BB.ARENA, g = this.game, p = g.player;
      this.t += dt;
      const lim = A.halfW - this.r;
      if (this.state === 'enter') {
        this.y = U.damp(this.y, this.targetY, 2.2, dt);
        if (Math.abs(this.y - this.targetY) < 0.3) this.state = 'patrol';
      } else if (this.state === 'patrol') {
        switch (this.type) {
          case 'fast':
            this.x += this.dir * this.speed * dt;
            this.y = this.targetY + Math.sin(this.t * 3) * 0.8;
            this.diveT -= dt;
            if (this.diveT <= 0 && p) { this.state = 'dive'; this.diveX = p.x; this.vy = -9 * (this.speed / 4.2); g.audio.sfx('dive'); }
            break;
          case 'tank':
            this.x += this.dir * this.speed * dt;
            this.y = this.targetY + Math.sin(this.t * 0.8) * 0.5;
            this.fireT -= dt;
            if (this.fireT <= 0) { this.fireT = 3.2; this.shoot('big'); }
            break;
          case 'shooter':
            this.x += this.dir * this.speed * dt * 0.8;
            this.y = this.targetY + Math.sin(this.t * 1.5) * 0.6;
            this.fireT -= dt;
            if (this.fireT <= 0) { this.fireT = 2.3; this.shoot('burst'); }
            break;
          default:
            this.x += this.dir * this.speed * dt;
            this.targetY -= dt * 0.35;
            if (this.targetY < 5) this.targetY = U.rand(12, 16);
            this.y = U.damp(this.y, this.targetY + Math.sin(this.t * 2) * 1.2, 3, dt);
            this.fireT -= dt;
            if (this.fireT <= 0) { this.fireT = U.rand(3.5, 5.5); if (g.level && g.level.num >= 6) this.shoot('single'); }
        }
        if (this.x < -lim) { this.x = -lim; this.dir = 1; }
        if (this.x > lim) { this.x = lim; this.dir = -1; }
      } else if (this.state === 'dive') {
        this.x = U.damp(this.x, this.diveX, 3, dt);
        this.y += this.vy * dt;
        if (this.y < 0.6) { this.state = 'return'; this.vy = 7; }
      } else if (this.state === 'return') {
        this.y += this.vy * dt;
        if (this.y > this.targetY) { this.state = 'patrol'; this.diveT = U.rand(2.5, 4.5); }
      }
      // animación
      const n = this.node;
      this.flash = Math.max(0, this.flash - dt * 7);
      n.flash = this.flash;
      this.z = 1.4 + Math.sin(this.t * 3.1) * 0.18 + (this.state === 'dive' ? -0.4 : 0);
      n.px = this.x; n.py = this.y; n.pz = this.z;
      n.ry = Math.sin(this.t * 2) * 0.18 + (this.type === 'fast' ? -this.dir * 0.3 : 0);
      n.rx = this.state === 'dive' ? -0.5 : Math.sin(this.t * 1.7) * 0.1;
      n.rz = this.type === 'normal' ? this.t * 0.8 : Math.sin(this.t) * 0.15;
      this.limbs.rz = this.type === 'normal' ? Math.sin(this.t * 5) * 0.3 : 0;
      this.limbs.rx = this.type !== 'normal' ? Math.sin(this.t * 6) * 0.12 : 0;
      this.limbs.pz = Math.sin(this.t * 6) * 0.05;
      n.glow = 1 + Math.sin(this.t * 5) * 0.3;
    }

    shoot(kind) {
      const g = this.game, p = g.player;
      if (!p || this.y > BB.ARENA.top) return;
      const dx = p.x - this.x, dy = p.y - this.y, l = Math.hypot(dx, dy) || 1;
      const sp = 6 + (g.level ? Math.min(4, g.level.num * 0.12) : 0);
      if (kind === 'big') {
        g.bullets.fireEnemy(this.x, this.y - 0.8, (dx / l) * sp * 0.7, (dy / l) * sp * 0.7, 'big', { col: [0.75, 0.4, 1] });
      } else if (kind === 'burst') {
        for (let i = -1; i <= 1; i++) {
          const a = Math.atan2(dy, dx) + i * 0.18;
          g.bullets.fireEnemy(this.x, this.y - 0.6, Math.cos(a) * sp, Math.sin(a) * sp, 'orb');
        }
      } else {
        g.bullets.fireEnemy(this.x, this.y - 0.6, (dx / l) * sp * 0.8, (dy / l) * sp * 0.8, 'acid');
      }
      g.fx.emit(this.x, this.y - 0.6, this.z, 0, 0, 0, 0.12, 0.6, 1.1, this.info.color, 1, 0, true, 0, 0);
      g.audio.sfx('enemyShoot');
    }

    damage(d) {
      if (!this.alive) return false;
      this.hp -= d;
      this.flash = 0.6;
      if (this.hp <= 0) { this.hp = 0; return true; }
      return false;
    }

    kill() {
      const g = this.game;
      this.alive = false;
      this.node.visible = false;
      g.fx.explode(this.x, this.y, this.z, this.r, this.info.color, 1.2);
      g.fx.burst(this.x, this.y, this.z, [0.6, 1, 0.6], 10, 5, 0.35, 0.5, 11);
      g.world.addShake(0.25);
      g.audio.sfx('alienDie');
    }

    get score() { return this.info.score; }
    get coins() { return this.info.coins; }
  }
  BB.Alien = Alien;
})(window.BB);
