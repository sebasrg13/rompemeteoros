/* entities/Bullet.js — sistema de proyectiles (jugador, mini naves con rebote, enemigos) con pooling e instancing */
(function (BB) {
  'use strict';
  const U = BB.U;

  BB.BULLET_TYPES = {
    plasma: { color: [0.3, 0.9, 1.0], speed: 26, dmg: 1.0, r: 0.16, pierce: 0 },
    laser: { color: [1.0, 0.35, 0.9], speed: 34, dmg: 1.1, r: 0.14, pierce: 0 },
    solar: { color: [1.0, 0.62, 0.2], speed: 25, dmg: 1.2, r: 0.2, pierce: 0 },
    anti: { color: [0.72, 0.45, 1.0], speed: 28, dmg: 1.25, r: 0.17, pierce: 1 },
  };

  class BulletSystem {
    constructor(game) {
      this.game = game;
      this.pb = []; this.mb = []; this.eb = [];
      for (let i = 0; i < 320; i++) this.pb.push({ alive: false });
      for (let i = 0; i < 120; i++) this.mb.push({ alive: false });
      for (let i = 0; i < 260; i++) this.eb.push({ alive: false });
      const Mo = BB.Models;
      this.matP = BB.mat({ color: [0.3, 0.9, 1], glow: 1.3, spec: 0, rim: [1, 1, 1, 0.6] });
      this.matM = BB.mat({ color: [0.4, 1, 0.6], glow: 1.3, spec: 0, rim: [1, 1, 1, 0.5] });
      this.matE = BB.mat({ color: [1, 0.25, 0.45], glow: 1.2, spec: 0, rim: [1, 0.8, 0.8, 0.8] });
      this.matMis = BB.mat({ spec: 0.6, shin: 20 });
      this.batchP = new BB.InstBatch(Mo.geo.bullet, this.matP, 320);
      this.batchM = new BB.InstBatch(Mo.geo.orb, this.matM, 120);
      this.batchE = new BB.InstBatch(Mo.geo.orb, this.matE, 260);
      this.batchMis = new BB.InstBatch(Mo.geo.missile, this.matMis, 40);
      this.uv = { glow: BB.Tex.cellUV(0), streak: BB.Tex.cellUV(7), core: BB.Tex.cellUV(1) };
    }

    clear() {
      for (const b of this.pb) b.alive = false;
      for (const b of this.mb) b.alive = false;
      for (const b of this.eb) b.alive = false;
    }

    setPlayerType(id) {
      const t = BB.BULLET_TYPES[id] || BB.BULLET_TYPES.plasma;
      this.ptype = t;
      this.matP.color = t.color;
    }

    firePlayer(x, y, z, vx, vy, dmg, r) {
      const b = this.pb.find((o) => !o.alive);
      if (!b) return null;
      b.alive = true; b.x = x; b.y = y; b.z = z; b.vx = vx; b.vy = vy; b.dmg = dmg; b.r = r;
      b.pierce = this.ptype ? this.ptype.pierce : 0; b.last = null; b.life = 1.6; b.zig = false;
      return b;
    }

    // LANZALLAMAS ZIGZAG (premium): bola de fuego que sube serpenteando y atraviesa enemigos
    fireZigzag(x, y, z, dmg, dir) {
      const b = this.firePlayer(x, y, z, 0, 15, dmg, 0.36);
      if (!b) return null;
      b.zig = true; b.zx = x; b.zt = 0; b.zdir = dir || 1; b.pierce = 4; b.life = 2.4;
      return b;
    }

    fireMini(x, y, z, vx, vy, dmg, bounces) {
      const b = this.mb.find((o) => !o.alive);
      if (!b) return null;
      b.alive = true; b.x = x; b.y = y; b.z = z; b.vx = vx; b.vy = vy; b.dmg = dmg; b.bounces = bounces; b.last = null; b.life = 2.2; b.r = 0.13;
      return b;
    }

    // kind: orb | fire | acid | missile | egg | big
    fireEnemy(x, y, vx, vy, kind, opts) {
      const b = this.eb.find((o) => !o.alive);
      if (!b) return null;
      opts = opts || {};
      b.alive = true; b.x = x; b.y = y; b.z = opts.z || 1.0; b.vx = vx; b.vy = vy; b.kind = kind || 'orb';
      b.r = opts.r || (kind === 'big' ? 0.42 : kind === 'egg' ? 0.38 : 0.24);
      b.life = opts.life || 7; b.homing = opts.homing || 0; b.hp = opts.hp || 0; b.t = 0;
      b.col = opts.col || (kind === 'fire' ? [1, 0.5, 0.15] : kind === 'acid' ? [0.5, 1, 0.3] : kind === 'egg' ? [0.9, 0.4, 1] : [1, 0.25, 0.45]);
      b.accel = opts.accel || 0;
      b.split = opts.split || 0;
      b.dmg = opts.dmg || 0;
      b.pvp = !!opts.pvp;
      return b;
    }

    update(dt) {
      const A = BB.ARENA, g = this.game;
      const wells = g.gravityWells;
      for (const b of this.pb) {
        if (!b.alive) continue;
        if (b.zig) {
          b.zt += dt;
          b.x = U.clamp(b.zx + Math.sin(b.zt * 6.5) * 2.1 * b.zdir, -A.halfW + 0.4, A.halfW - 0.4);
          b.y += b.vy * dt; b.life -= dt;
          g.fx.emit(b.x + U.rand(-0.15, 0.15), b.y - 0.2, b.z, 0, -1.5, 0.4, 0.35, 0.5, 0.05, Math.random() < 0.5 ? [1, 0.4, 0.08] : [1, 0.75, 0.2], 0.8, 0, true, 1, 0);
          if (b.y > A.top + 4 || b.life <= 0) b.alive = false;
          continue;
        }
        if (wells.length) this.bend(b, wells, dt, 1);
        b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
        if (b.y > A.top + 4 || b.y < -3 || b.x < -A.halfW - 1 || b.x > A.halfW + 1 || b.life <= 0) b.alive = false;
      }
      for (const b of this.mb) {
        if (!b.alive) continue;
        b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
        // rebote en las paredes
        if (b.x < -A.halfW + 0.1 && b.vx < 0) { b.vx = -b.vx; b.bounces--; }
        if (b.x > A.halfW - 0.1 && b.vx > 0) { b.vx = -b.vx; b.bounces--; }
        if (b.y > A.top + 1 && b.vy > 0) { b.vy = -b.vy; b.bounces--; }
        if (b.y < -2 || b.life <= 0 || b.bounces < 0) b.alive = false;
      }
      const p = g.player;
      for (const b of this.eb) {
        if (!b.alive) continue;
        b.t += dt; b.life -= dt;
        if (b.homing && p && b.t < b.homing) {
          const dx = p.x - b.x, dy = p.y - b.y, l = Math.hypot(dx, dy) || 1;
          const sp = Math.hypot(b.vx, b.vy);
          const k = 1 - Math.exp(-2.6 * dt);
          b.vx += ((dx / l) * sp - b.vx) * k; b.vy += ((dy / l) * sp - b.vy) * k;
        }
        if (b.accel) { const sp = Math.hypot(b.vx, b.vy) || 1; const f = 1 + (b.accel * dt) / sp; b.vx *= f; b.vy *= f; }
        if (wells.length) this.bend(b, wells, dt, 0.5);
        b.x += b.vx * dt; b.y += b.vy * dt;
        if (b.split && b.y < b.split) {
          // huevo que estalla en proyectiles
          for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; this.fireEnemy(b.x, b.y, Math.cos(a) * 4, Math.sin(a) * 4, 'acid'); }
          g.fx.burst(b.x, b.y, b.z, b.col, 8, 4, 0.4, 0.4);
          b.alive = false; continue;
        }
        if (b.y < -3 || b.y > A.top + 6 || b.x < -A.halfW - 2 || b.x > A.halfW + 2 || b.life <= 0) b.alive = false;
      }
    }

    bend(b, wells, dt, k) {
      for (const w of wells) {
        const dx = w.x - b.x, dy = w.y - b.y, d2 = dx * dx + dy * dy + 1.5;
        const f = (w.strength * k) / d2;
        const l = Math.sqrt(d2);
        b.vx += (dx / l) * f * dt * 10; b.vy += (dy / l) * f * dt * 10;
      }
    }

    render(add) {
      const bp = this.batchP, bm = this.batchM, be = this.batchE, bmis = this.batchMis, uv = this.uv;
      bp.reset(); bm.reset(); be.reset(); bmis.reset();
      const pc = this.matP.color;
      for (const b of this.pb) {
        if (!b.alive) continue;
        if (b.zig) {   // bola de fuego: solo resplandores
          add.bill(b.x, b.z, -b.y, 1.5, 1.5, 0, uv.glow, 1, 0.4, 0.08, 0.9);
          add.bill(b.x, b.z, -b.y, 0.8, 0.8, 0, uv.glow, 1, 0.85, 0.3, 0.95);
          add.bill(b.x, b.z, -b.y, 0.36, 0.36, 0, uv.core, 1, 1, 0.9, 0.9);
          continue;
        }
        const ang = Math.atan2(-b.vx, b.vy);
        bp.push(b.x, b.y, b.z, b.r * 2.1, ang, 1.9, 1, 0);
        // resplandor + estela
        add.bill(b.x, b.z, -b.y, b.r * 4, b.r * 4, 0, uv.glow, pc[0], pc[1], pc[2], 0.75);
        const sp = Math.hypot(b.vx, b.vy) || 1;
        add.beam(b.x, b.z, -b.y, b.x - (b.vx / sp) * 1.5, b.z, -(b.y - (b.vy / sp) * 1.5), b.r * 1.6, uv.streak, pc[0], pc[1], pc[2], 0.7);
      }
      for (const b of this.mb) {
        if (!b.alive) continue;
        bm.push(b.x, b.y, b.z, 0.22, 0, 1, 1, 0);
        add.bill(b.x, b.z, -b.y, 0.45, 0.45, 0, uv.glow, 0.4, 1, 0.6, 0.6);
        const sp = Math.hypot(b.vx, b.vy) || 1;
        add.beam(b.x, b.z, -b.y, b.x - (b.vx / sp) * 0.7, b.z, -(b.y - (b.vy / sp) * 0.7), 0.1, uv.streak, 0.4, 1, 0.6, 0.5);
      }
      for (const b of this.eb) {
        if (!b.alive) continue;
        if (b.kind === 'missile') {
          bmis.push(b.x, b.y, b.z, 1, Math.atan2(-b.vx, b.vy), 1, 1, b.t * 6);
          add.bill(b.x - b.vx * 0.05, b.z, -(b.y - b.vy * 0.05), 0.5, 0.5, 0, uv.glow, 1, 0.6, 0.2, 0.9);
          continue;
        }
        const pulse = 1 + Math.sin(b.t * 14) * 0.08;
        be.push(b.x, b.y, b.z, b.r * 2 * pulse, b.t * 3, 1, 1, b.t * 4);
        add.bill(b.x, b.z, -b.y, b.r * 3.4, b.r * 3.4, 0, uv.glow, b.col[0], b.col[1], b.col[2], 0.85);
        add.bill(b.x, b.z, -b.y, b.r * 1.3, b.r * 1.3, 0, uv.core, 1, 1, 1, 0.7);
      }
    }
  }
  BB.BulletSystem = BulletSystem;
})(window.BB);
