/* systems/Particles.js — partículas con pooling, explosiones, humo, fragmentos 3D, ondas de choque, rayos y textos flotantes
 * Todas las coordenadas en el marco local de la arena (x, y, z=altura).
 */
(function (BB) {
  'use strict';
  const U = BB.U;
  const MAXP = 1600;

  class Particles {
    constructor(game) {
      this.game = game;
      const F = (n) => new Float32Array(n);
      this.px = F(MAXP); this.py = F(MAXP); this.pz = F(MAXP);
      this.vx = F(MAXP); this.vy = F(MAXP); this.vz = F(MAXP);
      this.life = F(MAXP); this.max = F(MAXP); this.s0 = F(MAXP); this.s1 = F(MAXP);
      this.r = F(MAXP); this.g = F(MAXP); this.b = F(MAXP); this.a = F(MAXP);
      this.cell = new Uint8Array(MAXP); this.add = new Uint8Array(MAXP);
      this.drag = F(MAXP); this.grav = F(MAXP); this.rot = F(MAXP); this.vrot = F(MAXP);
      this.alive = 0; // número de activas (compactadas al inicio)
      this.limit = 900;
      this.scale = 1;
      this.shocks = [];
      this.texts = [];
      this.arcs = [];
      this.debris = [];
      this.debrisLimit = 30;
      this.uv = [];
      for (let i = 0; i < 32; i++) this.uv[i] = BB.Tex.cellUV(i);
    }

    init(root) {
      const mat = BB.mat({ spec: 0.2, shin: 10, rim: [1, 0.6, 0.3, 0.4] });
      for (let i = 0; i < 40; i++) {
        const n = new BB.Node(BB.Models.geo.debris[i % 3], mat);
        n.visible = false; n.castShadow = false;
        root.add(n);
        this.debris.push({ node: n, alive: false, vx: 0, vy: 0, vz: 0, life: 0, max: 1, s: 0.2, wr: [0, 0, 0] });
      }
    }

    setQuality(q) {
      this.limit = q.particles;
      this.debrisLimit = q.debris;
      this.scale = q.tier === 0 ? 0.55 : q.tier === 1 ? 0.8 : 1;
    }

    clear() {
      this.alive = 0; this.shocks.length = 0; this.texts.length = 0; this.arcs.length = 0;
      for (const d of this.debris) { d.alive = false; d.node.visible = false; }
    }

    // ---- emisión básica ----
    emit(x, y, z, vx, vy, vz, life, s0, s1, col, a, cell, add, drag, grav) {
      if (this.alive >= this.limit) return -1;
      const i = this.alive++;
      this.px[i] = x; this.py[i] = y; this.pz[i] = z;
      this.vx[i] = vx; this.vy[i] = vy; this.vz[i] = vz;
      this.life[i] = life; this.max[i] = life; this.s0[i] = s0; this.s1[i] = s1;
      this.r[i] = col[0]; this.g[i] = col[1]; this.b[i] = col[2]; this.a[i] = a;
      this.cell[i] = cell; this.add[i] = add ? 1 : 0;
      this.drag[i] = drag || 0; this.grav[i] = grav || 0;
      this.rot[i] = Math.random() * 6.28; this.vrot[i] = (Math.random() - 0.5) * 3;
      return i;
    }

    burst(x, y, z, col, n, speed, size, life, cell) {
      n = Math.max(1, Math.round(n * this.scale));
      for (let k = 0; k < n; k++) {
        const a = Math.random() * Math.PI * 2, e = (Math.random() - 0.3) * 1.4;
        const sp = speed * (0.35 + Math.random() * 0.75);
        this.emit(x, y, z, Math.cos(a) * Math.cos(e) * sp, Math.sin(a) * Math.cos(e) * sp, Math.sin(e) * sp + speed * 0.2,
          life * (0.6 + Math.random() * 0.6), size * (0.6 + Math.random() * 0.6), size * 0.1, col, 1, cell === undefined ? 0 : cell, true, 2.2, 6);
      }
    }

    sparks(x, y, z, col, n, speed) {
      n = Math.max(1, Math.round(n * this.scale));
      for (let k = 0; k < n; k++) {
        const a = Math.random() * Math.PI * 2;
        const sp = (speed || 8) * (0.4 + Math.random());
        this.emit(x, y, z, Math.cos(a) * sp, Math.sin(a) * sp, (Math.random() * 0.8 + 0.1) * sp, 0.25 + Math.random() * 0.35, 0.22, 0.02, col, 1, 11, true, 3, 14);
      }
    }

    smoke(x, y, z, n, size, col) {
      n = Math.max(1, Math.round(n * this.scale));
      const c = col || [0.35, 0.33, 0.4];
      for (let k = 0; k < n; k++) {
        const a = Math.random() * Math.PI * 2, sp = Math.random() * 1.6;
        this.emit(x + (Math.random() - 0.5) * size * 0.6, y + (Math.random() - 0.5) * size * 0.6, z, Math.cos(a) * sp, Math.sin(a) * sp, 0.6 + Math.random() * 1.2,
          0.9 + Math.random() * 0.9, size * 0.5, size * 1.6, c, 0.55, 4, false, 1.2, -0.4);
      }
    }

    shock(x, y, r, col, life, z) {
      if (this.shocks.length > 12) this.shocks.shift();
      this.shocks.push({ x, y, z: z || 0.15, r, col, life, max: life });
    }

    text(x, y, z, str, col, scale) {
      if (this.texts.length > 24) this.texts.shift();
      this.texts.push({ x, y, z, str, col: col || [1, 1, 1], life: 0.9, max: 0.9, s: scale || 1 });
    }

    arc(x0, y0, z0, x1, y1, z1, col, life) {
      if (this.arcs.length > 16) this.arcs.shift();
      this.arcs.push({ x0, y0, z0, x1, y1, z1, col: col || [0.5, 0.95, 1], life: life || 0.3, max: life || 0.3 });
    }

    spawnDebris(x, y, z, col, n, speed, size) {
      let spawned = 0;
      for (const d of this.debris) {
        if (spawned >= n) break;
        if (d.alive) continue;
        if (this.countDebris() >= this.debrisLimit) break;
        const a = Math.random() * Math.PI * 2, sp = speed * (0.5 + Math.random() * 0.8);
        d.alive = true; d.node.visible = true;
        d.node.setPos(x, y, z);
        d.vx = Math.cos(a) * sp; d.vy = Math.sin(a) * sp; d.vz = 3 + Math.random() * 5;
        d.s = size * (0.5 + Math.random() * 0.8);
        d.life = d.max = 1.1 + Math.random() * 0.8;
        d.wr = [(Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12];
        d.node.tint = col;
        spawned++;
      }
    }
    countDebris() { let n = 0; for (const d of this.debris) if (d.alive) n++; return n; }

    // Explosión completa (flash + chispas + humo + fragmentos + onda + luz)
    explode(x, y, z, radius, col, power) {
      power = power || 1;
      const g = this.game;
      const hot = [Math.min(1, col[0] + 0.4), Math.min(1, col[1] + 0.35), Math.min(1, col[2] + 0.3)];
      this.emit(x, y, z, 0, 0, 0, 0.28, radius * 2.6, radius * 4.2, [1, 0.95, 0.85], 1, 1, true, 0, 0);
      this.emit(x, y, z, 0, 0, 0, 0.45, radius * 3.5, radius * 5.5, col, 0.9, 0, true, 0, 0);
      this.burst(x, y, z, hot, 10 + radius * 8 * power, 7 * Math.sqrt(radius) * power, 0.55 * Math.sqrt(radius), 0.6);
      this.sparks(x, y, z, [1, 0.85, 0.5], 8 + radius * 6 * power, 10 * power);
      this.smoke(x, y, z, 3 + radius * 3, radius * 1.1);
      this.spawnDebris(x, y, z, col, Math.round((3 + radius * 3) * this.scale * power), 4 + radius * 2, 0.18 * Math.sqrt(radius) + 0.08);
      this.shock(x, y, radius * 3.2 * power, col, 0.5);
      if (g.world) g.world.flashLight(x, y, z + 1, 6 + radius * 4, [col[0] * 3, col[1] * 3, col[2] * 3], 0.35 + radius * 0.1);
    }

    update(dt) {
      let n = this.alive;
      const px = this.px, py = this.py, pz = this.pz, vx = this.vx, vy = this.vy, vz = this.vz, life = this.life;
      for (let i = 0; i < n; i++) {
        life[i] -= dt;
        if (life[i] <= 0) {
          // compactar: mover el último a esta posición
          n--;
          this.copy(n, i);
          i--;
          continue;
        }
        const dr = Math.exp(-this.drag[i] * dt);
        vx[i] *= dr; vy[i] *= dr; vz[i] = vz[i] * dr - this.grav[i] * dt;
        px[i] += vx[i] * dt; py[i] += vy[i] * dt; pz[i] += vz[i] * dt;
        if (pz[i] < 0.05 && this.grav[i] > 0) { pz[i] = 0.05; vz[i] *= -0.35; }
        this.rot[i] += this.vrot[i] * dt;
      }
      this.alive = n;
      for (let i = this.shocks.length - 1; i >= 0; i--) { this.shocks[i].life -= dt; if (this.shocks[i].life <= 0) this.shocks.splice(i, 1); }
      for (let i = this.texts.length - 1; i >= 0; i--) { const t = this.texts[i]; t.life -= dt; t.z += dt * 1.6; if (t.life <= 0) this.texts.splice(i, 1); }
      for (let i = this.arcs.length - 1; i >= 0; i--) { this.arcs[i].life -= dt; if (this.arcs[i].life <= 0) this.arcs.splice(i, 1); }
      for (const d of this.debris) {
        if (!d.alive) continue;
        d.life -= dt;
        if (d.life <= 0) { d.alive = false; d.node.visible = false; continue; }
        const nd = d.node;
        d.vz -= 16 * dt;
        nd.px += d.vx * dt; nd.py += d.vy * dt; nd.pz += d.vz * dt;
        if (nd.pz < d.s) { nd.pz = d.s; d.vz = Math.abs(d.vz) * 0.4; d.vx *= 0.7; d.vy *= 0.7; }
        nd.rx += d.wr[0] * dt; nd.ry += d.wr[1] * dt; nd.rz += d.wr[2] * dt;
        const k = Math.min(1, d.life / (d.max * 0.4));
        nd.setScale(d.s * k);
      }
    }

    copy(from, to) {
      if (from === to) return;
      const arrs = [this.px, this.py, this.pz, this.vx, this.vy, this.vz, this.life, this.max, this.s0, this.s1, this.r, this.g, this.b, this.a, this.cell, this.add, this.drag, this.grav, this.rot, this.vrot];
      for (const a of arrs) a[to] = a[from];
    }

    render(add, alpha, overlay) {
      const uv = this.uv;
      for (let i = 0; i < this.alive; i++) {
        const t = 1 - this.life[i] / this.max[i];
        const s = this.s0[i] + (this.s1[i] - this.s0[i]) * t;
        const fade = this.add[i] ? (1 - t) : (1 - t) * Math.min(1, t * 6);
        const batch = this.add[i] ? add : alpha;
        batch.bill(this.px[i], this.pz[i], -this.py[i], s, s, this.rot[i], uv[this.cell[i]], this.r[i], this.g[i], this.b[i], this.a[i] * fade);
      }
      for (const sh of this.shocks) {
        const t = 1 - sh.life / sh.max;
        const R = sh.r * (0.2 + 0.8 * Math.sqrt(t));
        const a = (1 - t) * 0.9;
        // quad plano sobre el suelo: ejes mundo (R,0,0) y (0,0,R)
        add.quad(sh.x, sh.z, -sh.y, R, 0, 0, 0, 0, R, uv[5], sh.col[0], sh.col[1], sh.col[2], a);
      }
      for (const ar of this.arcs) {
        const a = ar.life / ar.max;
        let x0 = ar.x0, y0 = ar.y0, z0 = ar.z0;
        const segs = 5;
        for (let k = 1; k <= segs; k++) {
          const f = k / segs;
          let x1 = ar.x0 + (ar.x1 - ar.x0) * f, y1 = ar.y0 + (ar.y1 - ar.y0) * f, z1 = ar.z0 + (ar.z1 - ar.z0) * f;
          if (k < segs) { x1 += (Math.random() - 0.5) * 0.7; y1 += (Math.random() - 0.5) * 0.7; z1 += (Math.random() - 0.5) * 0.4; }
          add.beam(x0, z0, -y0, x1, z1, -y1, 0.22, uv[12], ar.col[0], ar.col[1], ar.col[2], a);
          add.beam(x0, z0, -y0, x1, z1, -y1, 0.06, uv[12], 1, 1, 1, a);
          x0 = x1; y0 = y1; z0 = z1;
        }
      }
      // textos flotantes (glifos)
      const G = BB.Tex.glyphUV;
      for (const tx of this.texts) {
        const k = tx.life / tx.max;
        const a = Math.min(1, k * 3);
        const s = tx.s * (0.32 + (1 - k) * 0.08);
        this.drawText(overlay, tx.x, tx.y, tx.z, tx.str, s, tx.col, a);
      }
    }

    drawText(batch, x, y, z, str, s, col, a) {
      const G = BB.Tex.glyphUV, cam = batch.cam;
      const w = s * 0.62, adv = s * 0.9;
      const total = adv * (str.length - 1);
      const R = cam.right;
      for (let i = 0; i < str.length; i++) {
        const uv = G[str[i]];
        if (!uv) continue;
        const off = -total / 2 + i * adv;
        batch.bill(x + R[0] * off, z + R[1] * off, -y + R[2] * off, w, s, 0, uv, col[0], col[1], col[2], a);
      }
    }
  }
  BB.Particles = Particles;
})(window.BB);
