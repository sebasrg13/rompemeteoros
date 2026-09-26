/* entities/Boss.js — bosses 3D con fases: TITAN METEOR, DESTROYER, ALIEN MOTHER, BLACK HOLE, METEOR KING */
(function (BB) {
  'use strict';
  const U = BB.U;

  BB.BOSS_DEFS = [
    { id: 'titan', name: 'TITAN METEOR', hp: 460, color: [1, 0.45, 0.15] },
    { id: 'destroyer', name: 'DESTROYER', hp: 850, color: [1, 0.25, 0.2] },
    { id: 'mother', name: 'ALIEN MOTHER', hp: 1250, color: [0.9, 0.35, 1] },
    { id: 'blackhole', name: 'BLACK HOLE', hp: 1700, color: [0.6, 0.35, 1] },
    { id: 'king', name: 'METEOR KING', hp: 2500, color: [1, 0.8, 0.3] },
  ];

  class Boss {
    constructor(game, root, def, level) {
      this.game = game;
      this.def = def;
      this.name = def.name;
      this.level = level;
      this.cycle = Math.floor((level - 1) / 25);
      this.node = root.add(new BB.Node());
      this.node.boundR = 6;
      this.parts = [];
      this.hits = [];
      this.lasers = [];
      this.x = 0; this.y = BB.ARENA.top + 9; this.z = 2.5;
      this.homeY = 14.5;
      this.t = 0; this.phase = 1; this.flash = 0;
      this.alive = true; this.dying = 0; this.intro = true; this.entered = false;
      this.speedK = 1 + this.cycle * 0.25;
      this.maxHp = this.hp = Math.round(def.hp * (1 + this.cycle * 1.1) * (1 + Math.max(0, level - 5) * 0.015));
      this.attacks = [];
      this.gap = 1.5;
      this.kind = 'boss';
      this.uv = { glow: BB.Tex.cellUV(0), warn: BB.Tex.cellUV(13), beam: BB.Tex.cellUV(12), ring: BB.Tex.cellUV(2), wide: BB.Tex.cellUV(14), shock: BB.Tex.cellUV(5) };
      this.mat = BB.mat({ spec: 0.3, shin: 20, rim: [def.color[0], def.color[1], def.color[2], 0.6], glow: 1.3 });
      this.build();
    }

    addPart(geo, mat) {
      const n = this.node.add(new BB.Node(geo, mat || this.mat));
      this.parts.push(n);
      return n;
    }
    attack(name, cd, minPhase, fn) { this.attacks.push({ name, cd, minPhase, fn, timer: cd * U.rand(0.4, 0.9) }); }

    hpFrac() { return this.hp / this.maxHp; }
    calcPhase() { const f = this.hpFrac(); return f > 0.7 ? 1 : f > 0.4 ? 2 : f > 0.15 ? 3 : 4; }

    update(dt) {
      const g = this.game;
      this.t += dt;
      if (this.dying > 0) { this.updateDying(dt); return; }
      if (this.intro) {
        this.y = U.damp(this.y, this.homeY, 1.6, dt);
        if (Math.abs(this.y - this.homeY) < 0.25) { this.intro = false; this.entered = true; }
      } else {
        const ph = this.calcPhase();
        if (ph !== this.phase) this.onPhase(ph);
        const sp = (this.phase >= 4 ? 1.45 : this.phase >= 3 ? 1.2 : 1) * this.speedK;
        this.move(dt, sp);
        this.gap -= dt;
        for (const a of this.attacks) {
          if (this.phase < a.minPhase) continue;
          a.timer -= dt * sp;
          if (a.timer <= 0 && this.gap <= 0) {
            a.timer = a.cd * U.rand(0.85, 1.15);
            this.gap = this.phase >= 4 ? 0.35 : this.phase >= 3 ? 0.5 : 0.75;
            try { a.fn.call(this); } catch (e) { BB.reportError('boss-attack', e); }
          }
        }
      }
      this.updateLasers(dt);
      this.flash = Math.max(0, this.flash - dt * 6);
      for (const p of this.parts) p.flash = this.flash;
      this.node.px = this.x; this.node.py = this.y; this.node.pz = this.z;
      this.animate(dt);
      // círculos de impacto en coordenadas de arena
      for (const h of this.hits) { h.x = this.x + h.ox; h.y = this.y + h.oy; h.z = this.z; }
    }

    move(dt, sp) {
      this.x = Math.sin(this.t * 0.45 * sp) * 2.3;
      this.y = this.homeY + Math.sin(this.t * 0.7 * sp) * 0.6;
    }
    animate() {}

    onPhase(ph) {
      const g = this.game;
      this.phase = ph;
      g.fx.shock(this.x, this.y, 9, this.def.color, 0.8);
      g.fx.burst(this.x, this.y, this.z, this.def.color, 30, 9, 0.7, 0.7);
      g.world.addShake(0.6);
      g.audio.sfx('roar');
      g.vibrate(40);
      g.ui.bossPhase(ph);
      if (ph >= 4) { g.world.dangerTarget = 1; g.audio.setBossFinal(true); }
      // ayuda: al cambiar de fase suelta un boost
      g.pickups.spawnBoost(U.rand(-3, 3), this.y - 2);
    }

    damage(d) {
      if (this.dying > 0 || this.intro) return false;
      this.hp -= d;
      this.flash = Math.min(0.22, this.flash + 0.08);
      if (this.hp <= 0) { this.hp = 0; return true; }
      return false;
    }

    startDeath() {
      this.dying = 2.6;
      this.lasers.length = 0;
      this.game.world.dangerTarget = 0;
      this.game.audio.setBossFinal(false);
    }

    updateDying(dt) {
      const g = this.game;
      const before = this.dying;
      this.dying -= dt;
      this.node.px = this.x + (Math.random() - 0.5) * 0.3;
      this.node.pz = this.z + (Math.random() - 0.5) * 0.3;
      this.flash = 0.15 + Math.random() * 0.35;
      for (const p of this.parts) p.flash = this.flash;
      if (Math.floor(before * 7) !== Math.floor(this.dying * 7)) {
        const ex = this.x + U.rand(-2.2, 2.2), ey = this.y + U.rand(-1.8, 1.8);
        g.fx.explode(ex, ey, this.z + U.rand(-0.5, 1), U.rand(0.8, 1.5), this.def.color, 1.2);
        g.audio.sfx('explodeBig');
        g.world.addShake(0.35);
      }
      if (this.dying <= 0) {
        this.alive = false;
        this.node.visible = false;
        g.fx.explode(this.x, this.y, this.z, 4, this.def.color, 2);
        g.fx.explode(this.x, this.y, this.z, 2.5, [1, 1, 0.9], 1.5);
        g.fx.shock(this.x, this.y, 22, [1, 0.9, 0.6], 1.2);
        g.fx.shock(this.x, this.y, 14, this.def.color, 0.9);
        g.world.addShake(1.2);
        g.world.flashLight(this.x, this.y, this.z + 2, 30, [6, 5, 4], 1.2);
        g.onBossDefeated(this);
      }
    }

    // ---------- utilidades de ataque ----------
    aim(sx, sy) { const p = this.game.player; return Math.atan2(p.y - sy, p.x - sx); }
    spread(n, span, speed, kind, ox, oy) {
      const sx = this.x + (ox || 0), sy = this.y + (oy || -2);
      const base = this.aim(sx, sy);
      for (let i = 0; i < n; i++) {
        const a = base + (n === 1 ? 0 : (i / (n - 1) - 0.5) * span);
        this.game.bullets.fireEnemy(sx, sy, Math.cos(a) * speed * this.speedK, Math.sin(a) * speed * this.speedK, kind);
      }
      this.game.fx.emit(sx, sy, this.z, 0, 0, 0, 0.2, 1.2, 2.2, this.def.color, 1, 0, true, 0, 0);
      this.game.audio.sfx('enemyShoot');
    }
    ring(n, speed, kind, offset) {
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + (offset || 0);
        if (Math.sin(a) > 0.55) continue; // no disparar hacia atrás
        this.game.bullets.fireEnemy(this.x + Math.cos(a) * 1.5, this.y + Math.sin(a) * 1.5, Math.cos(a) * speed * this.speedK, Math.sin(a) * speed * this.speedK, kind);
      }
      this.game.fx.shock(this.x, this.y, 8, this.def.color, 0.6);
      this.game.audio.sfx('shockwave');
    }
    rain(n, hpK) {
      const g = this.game;
      for (let i = 0; i < n; i++) {
        g.spawnMeteor({ type: U.chance(0.25) ? 'explosive' : 'normal', tier: 1, x: U.rand(-3.8, 3.8), y: BB.ARENA.top + U.rand(1, 5), vx: U.rand(-1.5, 1.5), vy: -2, hp: Math.max(2, g.levelHp * (hpK || 0.35)), noSplit: true, fromBoss: true });
      }
      g.audio.sfx('rumble');
    }
    lateral(n, speed) {
      const A = BB.ARENA;
      for (let i = 0; i < n; i++) {
        for (const s of [-1, 1]) {
          const y = U.rand(6, 13);
          const x = s * (A.halfW + 0.5);
          const tx = U.rand(-1.5, 1.5), ty = 0.5;
          const dx = tx - x, dy = ty - y, l = Math.hypot(dx, dy);
          this.game.bullets.fireEnemy(x, y, (dx / l) * speed * this.speedK, (dy / l) * speed * this.speedK, 'fire', { z: 1.2 });
        }
      }
      this.game.audio.sfx('enemyShoot');
    }
    missiles(n) {
      for (let i = 0; i < n; i++) {
        const a = -Math.PI / 2 + (i / Math.max(1, n - 1) - 0.5) * 1.6;
        this.game.bullets.fireEnemy(this.x + Math.cos(a) * 1.8, this.y - 1, Math.cos(a) * 5, Math.sin(a) * 5, 'missile', { homing: 1.8, hp: 2, r: 0.3, life: 6, accel: 3 });
      }
      this.game.audio.sfx('missile');
    }
    summon(types) {
      const g = this.game;
      for (const t of types) g.spawnAlien(t, U.rand(-3.5, 3.5), { y: this.y, targetY: U.rand(9, 12.5), hpK: 0.6, scale: 0.85 });
      g.audio.sfx('summon');
    }
    laser(x, warn) {
      this.lasers.push({ x, t: 0, warn: warn || 1.0, dur: 0.9, w: 0.55, hit: false });
      this.game.audio.sfx('laserCharge');
    }
    updateLasers(dt) {
      const g = this.game, p = g.player;
      for (let i = this.lasers.length - 1; i >= 0; i--) {
        const L = this.lasers[i];
        L.t += dt;
        if (L.t > L.warn && !L.fired) { L.fired = true; g.audio.sfx('laser'); g.world.addShake(0.35); }
        if (L.fired && !L.hit && Math.abs(p.x - L.x) < L.w + p.r * 0.7) { L.hit = true; g.hitPlayer('laser'); }
        if (L.t > L.warn + L.dur) this.lasers.splice(i, 1);
      }
    }

    render(add, alpha) {
      const u = this.uv;
      for (const L of this.lasers) {
        const y0 = this.y - 1.5, y1 = -1;
        if (!L.fired) {
          const a = 0.35 + 0.35 * Math.sin(L.t * 30);
          add.beam(L.x, 0.3, -y0, L.x, 0.3, -y1, 0.12, u.warn, 1, 0.2, 0.2, a);
          add.bill(L.x, 0.4, -y1 - 0.5, 0.8, 0.8, 0, u.glow, 1, 0.2, 0.2, a);
        } else {
          const k = 1 - (L.t - L.warn) / L.dur;
          add.beam(L.x, 0.9, -y0, L.x, 0.9, -y1, L.w * 2.2 * (0.6 + 0.4 * k), u.beam, 1, 0.3, 0.3, 0.9 * k);
          add.beam(L.x, 0.9, -y0, L.x, 0.9, -y1, L.w * 0.7, u.beam, 1, 1, 1, k);
          add.quad(L.x, 0.05, -(y0 + y1) / 2, L.w * 1.6, 0, 0, 0, 0, (y0 - y1) / 2, u.beam, 1, 0.25, 0.2, 0.5 * k);
        }
      }
      const c = this.def.color;
      if (this.alive) add.bill(this.x, this.z, -this.y, 5.5, 5.5, 0, u.wide, c[0], c[1], c[2], 0.18 + this.flash * 0.3);
      this.renderExtra(add, alpha);
    }
    renderExtra() {}
  }

  // ================= TITAN METEOR =================
  class Titan extends Boss {
    build() {
      const G = BB.Models.geo.boss.titan;
      this.core = this.addPart(G.core);
      this.core.setScale(2.4);
      this.chunks = [];
      const chunkMat = BB.mat({ spec: 0.2, shin: 12, rim: [1, 0.5, 0.2, 0.4], glow: 1.3 });
      for (let i = 0; i < 6; i++) { const n = this.addPart(G.chunk, chunkMat); n.setScale(0.45 + (i % 3) * 0.12); this.chunks.push(n); }
      this.hits.push({ ox: 0, oy: 0, r: 2.25, owner: this });
      this.attack('spread', 2.6, 1, function () { this.spread(this.phase >= 3 ? 7 : 5, 0.9, 7, 'fire'); });
      this.attack('rain', 5.5, 1, function () { this.rain(this.phase >= 3 ? 5 : 3); });
      this.attack('ring', 4.8, 2, function () { this.ring(this.phase >= 4 ? 22 : 16, 5.5, 'fire', this.t); });
      this.attack('spawn', 7.5, 2, function () {
        const g = this.game;
        for (const s of [-1, 1]) g.spawnMeteor({ type: 'normal', tier: 2, x: this.x + s * 1.5, y: this.y - 1, vx: s * 2.5, vy: 2, hp: Math.max(4, g.levelHp * 0.8), noSplit: false, fromBoss: true });
        g.audio.sfx('rumble');
      });
      this.attack('lateral', 5.2, 3, function () { this.lateral(this.phase >= 4 ? 3 : 2, 6.5); });
    }
    animate(dt) {
      this.core.rz = Math.sin(this.t * 0.5) * 0.35; this.core.rx = Math.sin(this.t * 0.6) * 0.2;
      this.core.glow = 0.9 + Math.sin(this.t * 3) * 0.25 + (this.phase >= 4 ? 0.35 : 0);
      this.chunks.forEach((n, i) => {
        const a = this.t * (0.9 + i * 0.07) + (i / 6) * Math.PI * 2;
        n.px = Math.cos(a) * 3.4; n.py = Math.sin(a) * 1.4; n.pz = Math.sin(a * 1.3 + i) * 1.2;
        n.rx += dt * 2; n.ry += dt * 1.5;
      });
    }
  }

  // ================= DESTROYER =================
  class Destroyer extends Boss {
    build() {
      const G = BB.Models.geo.boss.destroyer;
      this.homeY = 15;
      this.z = 2.2;
      this.hull = this.addPart(G.hull);
      this.turrets = [[-1.3, -0.4, 0.5], [1.3, -0.4, 0.5], [0, -1.5, 0.55]].map((p) => { const n = this.addPart(G.turret); n.setPos(p[0], p[1], p[2]); return n; });
      this.hits.push({ ox: 0, oy: 0, r: 1.7, owner: this }, { ox: -2.3, oy: 0.6, r: 1.1, owner: this }, { ox: 2.3, oy: 0.6, r: 1.1, owner: this });
      this.attack('turrets', 1.9, 1, function () {
        const g = this.game;
        for (const t of this.turrets) {
          const sx = this.x + t.px, sy = this.y + t.py - 0.8;
          const a = this.aim(sx, sy);
          g.bullets.fireEnemy(sx, sy, Math.cos(a) * 7.5 * this.speedK, Math.sin(a) * 7.5 * this.speedK, 'orb');
          g.fx.emit(sx, sy, this.z + 0.5, 0, 0, 0, 0.12, 0.6, 1.1, [1, 0.3, 0.3], 1, 0, true, 0, 0);
        }
        g.audio.sfx('enemyShoot');
      });
      this.attack('missiles', 5.2, 1, function () { this.missiles(this.phase >= 3 ? 4 : 2); });
      this.attack('laser', 6, 2, function () {
        const p = this.game.player;
        this.laser(p.x, 1.1);
        if (this.phase >= 3) this.laser(U.clamp(p.x + U.pick([-2.2, 2.2]), -4, 4), 1.4);
      });
      this.attack('drones', 8, 2, function () { this.summon(this.phase >= 4 ? ['fast', 'fast', 'normal'] : ['fast', 'fast']); });
      this.attack('lateral', 5, 3, function () { this.lateral(2, 7); });
    }
    animate(dt) {
      this.hull.ry = Math.sin(this.t * 0.9) * 0.08;
      this.hull.rx = Math.sin(this.t * 0.6) * 0.05;
      const p = this.game.player;
      for (const t of this.turrets) {
        const a = Math.atan2(p.y - (this.y + t.py), p.x - (this.x + t.px));
        t.rz = a + Math.PI / 2;
        t.glow = 1 + Math.sin(this.t * 8) * 0.4;
      }
      this.hull.glow = this.phase >= 4 ? 1.4 + Math.sin(this.t * 10) * 0.5 : 1;
    }
    renderExtra(add) {
      for (const s of [-1, 1]) add.bill(this.x + s * 2.7, this.z, -(this.y + 1.9), 1.2, 1.2, 0, this.uv.glow, 1, 0.5, 0.2, 0.8);
      for (let i = -1; i <= 1; i++) add.bill(this.x + i * 0.55, this.z, -(this.y + 2.45), 0.9, 0.9, 0, this.uv.glow, 1, 0.55, 0.2, 0.8);
    }
  }

  // ================= ALIEN MOTHER =================
  class Mother extends Boss {
    build() {
      const G = BB.Models.geo.boss.mother;
      this.homeY = 15;
      this.body = this.addPart(G.body);
      this.body.setScale(1.05);
      this.tents = [];
      for (let i = 0; i < 6; i++) {
        const n = this.addPart(G.tent);
        const a = -Math.PI / 2 + (i / 5 - 0.5) * 2.6;
        n.setPos(Math.cos(a) * 1.7, Math.sin(a) * 1.3 - 0.2, -0.6);
        n.baseA = a; n.rz = a + Math.PI / 2;
        this.tents.push(n);
      }
      this.hits.push({ ox: 0, oy: 0, r: 2.2, owner: this });
      this.attack('acid', 2.4, 1, function () { this.spread(this.phase >= 3 ? 9 : 7, 1.3, 5.2, 'acid'); });
      this.attack('summon', 6.5, 1, function () { this.summon(this.phase >= 3 ? ['normal', 'fast', 'shooter'] : this.phase >= 2 ? ['normal', 'fast'] : ['normal']); });
      this.attack('eggs', 5.5, 2, function () {
        const g = this.game;
        const n = this.phase >= 4 ? 4 : 3;
        for (let i = 0; i < n; i++) g.bullets.fireEnemy(this.x + U.rand(-1.5, 1.5), this.y - 1.5, U.rand(-1.8, 1.8), -3.2, 'egg', { split: U.rand(3.5, 6.5), r: 0.42, hp: 3 });
        g.audio.sfx('summon');
      });
      this.attack('ring', 5, 3, function () { this.ring(18, 4.8, 'acid', this.t); });
    }
    animate(dt) {
      this.body.sz = 1.05 + Math.sin(this.t * 2) * 0.05;
      this.body.sx = 1.05 - Math.sin(this.t * 2) * 0.03;
      this.body.glow = 1 + Math.sin(this.t * 4) * 0.4;
      this.tents.forEach((n, i) => { n.rz = n.baseA + Math.PI / 2 + Math.sin(this.t * 2.5 + i) * 0.35; n.rx = Math.sin(this.t * 3 + i * 1.3) * 0.4; });
    }
  }

  // ================= BLACK HOLE =================
  class BlackHole extends Boss {
    build() {
      const G = BB.Models.geo.boss.blackhole;
      this.homeY = 13.5; this.z = 2.4;
      this.mat = BB.mat({ spec: 0, rim: [0.7, 0.4, 1, 2.2], glow: 1 });
      this.core = this.addPart(G.core, this.mat);
      this.diskMat = BB.mat({ spec: 0, rim: [1, 0.7, 0.4, 0.4], glow: 1.3 });
      this.disk = this.addPart(G.disk, this.diskMat); this.disk.rx = 0.45;
      this.disk2 = this.addPart(G.disk2, this.diskMat); this.disk2.rx = -0.9; this.disk2.ry = 0.4;
      for (const p of this.parts) p.castShadow = p === this.core;
      this.hits.push({ ox: 0, oy: 0, r: 1.6, owner: this });
      this.spiral = null;
      this.well = { x: 0, y: this.homeY, strength: 4 };
      this.attack('spiral', 5.5, 1, function () { this.spiral = { t: 2.4, ang: 0, arms: this.phase >= 3 ? 3 : 2, cd: 0 }; this.game.audio.sfx('warp'); });
      this.attack('pulse', 4.2, 1, function () { this.ring(this.phase >= 4 ? 20 : 14, 4.5, 'orb', this.t * 2); });
      this.attack('meteors', 6.5, 2, function () {
        const g = this.game;
        for (const s of [-1, 1]) g.spawnMeteor({ type: U.pick(['normal', 'crystal', 'electric']), tier: 2, x: s * 3.8, y: this.y + 1, vx: -s * 2, vy: 1, hp: Math.max(4, g.levelHp * 0.7), fromBoss: true });
        g.audio.sfx('rumble');
      });
      this.attack('lateral', 5, 3, function () { this.lateral(2, 6); });
    }
    move(dt, sp) {
      this.x = Math.sin(this.t * 0.35 * sp) * 2.6;
      this.y = this.homeY + Math.sin(this.t * 0.5 * sp) * 0.8;
    }
    update(dt) {
      super.update(dt);
      const g = this.game;
      if (this.alive && this.dying <= 0 && !this.intro) {
        this.well.x = this.x; this.well.y = this.y;
        this.well.strength = this.phase >= 4 ? 7.5 : this.phase >= 3 ? 5.5 : 4;
        if (g.gravityWells.indexOf(this.well) < 0) g.gravityWells.push(this.well);
        // atracción lateral sobre el jugador
        const p = g.player;
        const pull = (this.phase >= 4 ? 2.4 : this.phase >= 2 ? 1.6 : 1.1) * this.speedK;
        g.playerPull = Math.sign(this.x - p.x) * pull * Math.min(1, Math.abs(this.x - p.x));
        if (this.spiral) {
          const s = this.spiral;
          s.t -= dt; s.cd -= dt; s.ang += dt * 2.2;
          if (s.cd <= 0) {
            s.cd = 0.13;
            for (let k = 0; k < s.arms; k++) {
              const a = s.ang + (k / s.arms) * Math.PI * 2;
              g.bullets.fireEnemy(this.x + Math.cos(a) * 1.8, this.y + Math.sin(a) * 1.8, Math.cos(a) * 4.2, Math.sin(a) * 4.2 - 1.2, 'orb', { col: [0.7, 0.4, 1] });
            }
          }
          if (s.t <= 0) this.spiral = null;
        }
        // partículas absorbidas
        if (Math.random() < 0.6) {
          const a = Math.random() * 6.28, R = 4 + Math.random() * 2;
          const px = this.x + Math.cos(a) * R, py = this.y + Math.sin(a) * R;
          g.fx.emit(px, py, this.z, (this.x - px) * 0.9 - Math.sin(a) * 3, (this.y - py) * 0.9 + Math.cos(a) * 3, 0, 1.0, 0.25, 0.02, [0.8, 0.5, 1], 0.9, 0, true, 0, 0);
        }
      } else {
        const i = g.gravityWells.indexOf(this.well);
        if (i >= 0) g.gravityWells.splice(i, 1);
        g.playerPull = 0;
      }
    }
    animate(dt) {
      this.disk.rz += dt * 1.6 * (this.phase >= 4 ? 1.8 : 1);
      this.disk2.rz -= dt * 2.4;
      this.core.setScale(1 + Math.sin(this.t * 3) * 0.04);
      this.diskMat.glow = 1.2 + Math.sin(this.t * 5) * 0.3;
    }
    renderExtra(add) {
      const u = this.uv;
      if (!this.alive) return;
      const k = 1 + Math.sin(this.t * 4) * 0.08;
      add.bill(this.x, this.z, -this.y, 3.2 * k, 3.2 * k, this.t, u.ring, 0.55, 0.3, 1, 0.45);
      add.bill(this.x, this.z, -this.y, 4.6, 4.6, -this.t * 0.7, u.ring, 1, 0.55, 0.25, 0.25);
      add.quad(this.x, 0.08, -this.y, 5.5, 0, 0, 0, 0, 5.5, u.shock, 0.5, 0.25, 1, 0.35 + 0.1 * Math.sin(this.t * 3));
    }
  }

  // ================= METEOR KING =================
  class King extends Boss {
    build() {
      const G = BB.Models.geo.boss.king;
      this.z = 2.8;
      this.core = this.addPart(G.core);
      this.core.setScale(2.5);
      this.crownMat = BB.mat({ spec: 1.5, shin: 50, rim: [1, 0.85, 0.4, 0.6], glow: 1.2 });
      this.crown = this.addPart(G.crown, this.crownMat);
      this.crown.pz = 2.35;
      this.shards = [];
      const sm = BB.mat({ spec: 1.2, shin: 60, rim: [0.5, 0.9, 1, 0.8], glow: 1.4 });
      for (let i = 0; i < 4; i++) { const n = this.addPart(G.shard, sm); this.shards.push(n); }
      this.hits.push({ ox: 0, oy: 0, r: 2.35, owner: this });
      this.well = { x: 0, y: 14, strength: 5 };
      this.attack('spread', 2.5, 1, function () { this.spread(this.phase >= 3 ? 7 : 5, 1.0, 7.2, 'fire'); });
      this.attack('rain', 5.5, 1, function () { this.rain(this.phase >= 3 ? 5 : 3, 0.45); });
      this.attack('laser', 6.2, 2, function () { const p = this.game.player; this.laser(p.x, 1.0); if (this.phase >= 4) this.laser(-p.x * 0.5, 1.3); });
      this.attack('summon', 8.5, 2, function () { this.summon(['shooter', 'fast']); });
      this.attack('ring', 4.2, 3, function () { this.ring(18, 5.2, 'orb', this.t); });
      this.attack('missiles', 6.5, 3, function () { this.missiles(3); });
      this.attack('lateral', 5.5, 4, function () { this.lateral(2, 7); });
    }
    update(dt) {
      super.update(dt);
      const g = this.game;
      const active = this.alive && this.dying <= 0 && this.phase >= 4;
      const i = g.gravityWells.indexOf(this.well);
      if (active) {
        this.well.x = this.x; this.well.y = this.y;
        if (i < 0) g.gravityWells.push(this.well);
        g.playerPull = Math.sign(this.x - g.player.x) * 1.4 * Math.min(1, Math.abs(this.x - g.player.x));
      } else if (i >= 0) { g.gravityWells.splice(i, 1); g.playerPull = 0; }
    }
    animate(dt) {
      this.core.rz = Math.sin(this.t * 0.4) * 0.3;
      this.core.glow = 0.9 + Math.sin(this.t * 3) * 0.2 + (this.phase >= 4 ? 0.35 : 0);
      this.crown.rz = Math.sin(this.t * 0.8) * 0.15;
      this.crown.pz = 2.35 + Math.sin(this.t * 2) * 0.08;
      this.shards.forEach((n, i) => {
        const a = this.t * 1.3 + (i / 4) * Math.PI * 2;
        n.px = Math.cos(a) * 3.6; n.py = Math.sin(a) * 1.6; n.pz = 0.8 + Math.sin(a * 2) * 0.8;
        n.rz = a; n.rx += dt * 2;
      });
    }
  }

  BB.BossClasses = { titan: Titan, destroyer: Destroyer, mother: Mother, blackhole: BlackHole, king: King };
  BB.Boss = Boss;
})(window.BB);
