/* game/World.js — entorno 3D: arena, fondo espacial, estrellas, planeta, luces y cámara */
(function (BB) {
  'use strict';
  const U = BB.U, M4 = BB.M4;

  BB.ARENA = { halfW: 4.6, top: 19, spawnY: 22.5, playerY: 0.9 };

  class World {
    constructor(game) {
      this.game = game;
      const A = BB.ARENA;
      this.camera = new BB.Camera();
      this.root = new BB.Node();       // escena de juego (marco local de la arena)
      this.root.rx = -Math.PI / 2;
      this.decor = new BB.Node();      // objetos lejanos (marco mundo)
      this.env = {
        lightDir: norm([-0.42, 1.0, 0.5]),
        lightColor: [1.05, 0.98, 0.92],
        ambSky: [0.34, 0.38, 0.62],
        ambGround: [0.14, 0.09, 0.18],
        fogColor: [0.05, 0.06, 0.16],
        fog: [34, 80],
        clear: [0.03, 0.04, 0.1],
        pl: new Float32Array(16),
        plc: new Float32Array(12),
        time: 0,
      };
      this.baseEnv = { lightColor: this.env.lightColor.slice(), ambSky: this.env.ambSky.slice(), fogColor: this.env.fogColor.slice() };
      this.danger = 0; // 0..1 (iluminación roja fase final)
      this.shadowMat = M4.shadow(new Float32Array(16), 0, 1, 0, -0.03, this.env.lightDir[0], this.env.lightDir[1], this.env.lightDir[2]);
      this.shadowColor = [0.0, 0.0, 0.04, 0.45];
      this.shake = 0;
      this.shakeT = 0;
      this.camMode = 'game';
      this.camBlend = 0;
      this.menuAngle = 0;
      this.fit = { fov: 60, eye: [0, 12.5, 9], target: [0, 0, -8] };
      this.pxPerUnit = 40;
      this.bg = { tex: null, tint: [1, 1, 1], ox: 0, oy: 0, pulse: 0 };
      this.lights = [];
      for (let i = 0; i < 4; i++) this.lights.push({ x: 0, y: 0, z: 0, r: 1, c: [0, 0, 0], life: 0, max: 1 });
    }

    build(quality) {
      const A = BB.ARENA, Mo = BB.Models;
      this.bg.tex = BB.Tex.makeNebula(512, 1024, 1234);
      // estrellas (puntos)
      const N = 900, d = new Float32Array(N * 5), rnd = U.seeded(99);
      for (let i = 0; i < N; i++) {
        let x = rnd() * 2 - 1, y = rnd() * 2 - 1, z = rnd() * 2 - 1;
        const l = Math.hypot(x, y, z) || 1;
        const R = 70 + rnd() * 80;
        d[i * 5] = (x / l) * R; d[i * 5 + 1] = Math.abs(y / l) * R * 0.8 - 12; d[i * 5 + 2] = (z / l) * R;
        d[i * 5 + 3] = 1.5 + rnd() * rnd() * 7; d[i * 5 + 4] = rnd();
      }
      this.stars = { data: d, count: N, drawCount: N, stride: 5, _gen: -1, warp: 0 };

      // suelo de la arena
      // pos/speed: el suelo avanza hacia el jugador (sensación de ir hacia adelante sobre la plataforma)
      const HR = BB.Tex.HEX_R;
      this.surface = { geo: null, tex: null, tint: [1, 1, 1], scroll: 0.35, hex: BB.Tex.makeHexTile(), pos: 0, speed: 0, halfW: A.halfW, kx: 1 / (HR * 1.7320508), ky: 1 / (HR * 3) };
      this.scrollTarget = 1.2;
      this.surfCache = {};
      this.buildSurface(A.halfW);
      this.surfaceModel = M4.create();

      // barandas y portal
      const railMat = BB.mat({ spec: 0.8, shin: 30, rim: [0.3, 0.8, 1, 0.3] });
      this.rails = this.root.add(new BB.Node(Mo.rails(A.halfW, A.top + 12), railMat));
      this.rails.castShadow = false;
      this.gate = this.root.add(new BB.Node(Mo.gate(A.halfW), railMat));
      this.gate.py = A.top + 3.5;
      this.gate.castShadow = false;

      // planeta y rocas lejanas (decoración con profundidad)
      const pl = Mo.planet();
      const planetMat = BB.mat({ spec: 0.05, shin: 8, rim: [0.6, 0.4, 1, 1.2], glow: 0.6 });
      this.planet = this.decor.add(new BB.Node(pl.planet, planetMat));
      this.planet.setPos(-58, 8, -150); this.planet.setScale(26); this.planet.rz = 0.3;
      this.planetRing = this.planet.add(new BB.Node(pl.ring, BB.mat({ spec: 0, rim: [0, 0, 0, 0], glow: 1, blend: 1, opacity: 0.8, depthWrite: false, doubleSided: true })));
      this.planetRing.rx = 1.2;
      this.far = [];
      const rockMat = BB.mat({ spec: 0.1, shin: 10, rim: [0.4, 0.5, 1, 0.5] });
      for (let i = 0; i < 9; i++) {
        const g = Mo.geo.meteor.normal[i % 3];
        const n = this.decor.add(new BB.Node(g, rockMat));
        const side = i % 2 ? 1 : -1;
        n.setPos(side * (16 + rnd() * 18), -3 + rnd() * 12, -20 - rnd() * 70);
        n.setScale(1 + rnd() * 3.2);
        n.spin = [(rnd() - 0.5) * 0.4, (rnd() - 0.5) * 0.4];
        n.drift = 0.3 + rnd() * 0.6;
        this.far.push(n);
      }
      this.applyQuality(quality);
    }

    buildSurface(hw) {
      const A = BB.ARENA, ext = 3.2, x0 = -hw - ext, x1 = hw + ext, y0 = -5, y1 = A.top + 14;
      if (!this.surfCache[hw]) {
        const sd = new Float32Array([
          x0, y0, 0, 0, 1, x1, y0, 0, 1, 1, x1, y1, 0, 1, 0,
          x0, y0, 0, 0, 1, x1, y1, 0, 1, 0, x0, y1, 0, 0, 0,
        ]);
        this.surfCache[hw] = { geo: { data: sd, count: 6, _gen: -1 }, tex: BB.Tex.makeArena(hw, ext), rails: BB.Models.rails(hw, A.top + 12), gate: BB.Models.gate(hw) };
      }
      const c = this.surfCache[hw];
      this.surface.geo = c.geo; this.surface.tex = c.tex; this.surface.halfW = hw;
      if (this.rails) { this.rails.geo = c.rails; this.gate.geo = c.gate; }
    }

    // Cambia el ancho de la arena (modo 5 vs 5 usa una arena más ancha)
    setArenaWidth(hw, teamMode) {
      const A = BB.ARENA;
      if (A.halfW === hw && this.teamMode === !!teamMode) return;
      A.halfW = hw;
      this.teamMode = !!teamMode;
      this.buildSurface(hw);
      if (this.lastW) this.fitCamera(this.lastW, this.lastH);
      this.snapCam = true;
    }

    applyQuality(q) {
      if (!this.stars) return;
      this.stars.drawCount = q.tier === 0 ? 350 : q.tier === 1 ? 600 : 900;
      this.shadowsOn = q.shadows;
    }

    // -------- cámara --------
    fitCamera(w, h) {
      const cam = this.camera, A = BB.ARENA;
      cam.aspect = w / h;
      const portrait = h > w * 1.05;
      const fovDeg = portrait ? 52 : 42;
      cam.fov = (fovDeg * Math.PI) / 180;
      // puntos que deben verse: esquinas inferiores (jugador) y superiores (entrada de enemigos)
      this.lastW = w; this.lastH = h;
      const pts = [[-A.halfW - 0.2, 0, 1.3], [A.halfW + 0.2, 0, 1.3], [-A.halfW, 0, -A.top], [A.halfW, 0, -A.top], [0, 3, -A.top - 1], [-A.halfW, 2.2, -A.top]];
      if (this.teamMode) pts.push([0, 1.2, 3.4], [-A.halfW, 0, 2.2], [A.halfW, 0, 2.2]);
      const out = [0, 0, 0];
      const lim = { top: 0.78, bot: -0.84, side: 0.99 };
      const fits = () => {
        cam.update();
        for (const p of pts) {
          cam.projectNDC(p[0], p[1], p[2], out);
          if (out[2] <= 0 || out[1] > lim.top || out[1] < lim.bot || Math.abs(out[0]) > lim.side) return false;
        }
        return true;
      };
      let best = null;
      for (let pitch = 46; pitch <= 58; pitch += 2) {
        const pr = (pitch * Math.PI) / 180;
        for (let tz = 3; tz <= 13; tz += 0.5) {
          let lo = 4, hi = 80;
          for (let it = 0; it < 16; it++) {
            const d = (lo + hi) / 2;
            cam.eye = [0, Math.sin(pr) * d, -tz + Math.cos(pr) * d];
            cam.target = [0, 0, -tz];
            if (fits()) hi = d; else lo = d;
          }
          cam.eye = [0, Math.sin(pr) * hi, -tz + Math.cos(pr) * hi];
          cam.target = [0, 0, -tz];
          if (!fits()) continue;
          // puntuación: ancho en pantalla de la arena a media altura y en la parte superior
          cam.projectNDC(A.halfW, 0, -A.top * 0.55, out);
          const mid = out[0];
          cam.projectNDC(A.halfW, 0, -A.top, out);
          const topW = out[0];
          const score = mid + topW * 0.6 - Math.abs(pitch - 52) * 0.004;
          if (!best || score > best.score) best = { score, eye: cam.eye.slice(), target: cam.target.slice() };
        }
      }
      if (!best) best = { eye: [0, 16, 9], target: [0, 0, -8] };
      this.fit = { fov: fovDeg, eye: best.eye, target: best.target };
      cam.eye = best.eye.slice(); cam.target = best.target.slice();
      cam.update();
      const dd = Math.hypot(best.eye[0], best.eye[1], best.eye[2] + A.top * 0.5);
      this.env.fog = [dd + 8, dd * 2.2 + 40];
      cam.far = Math.max(400, dd * 6);
      this.updatePxPerUnit(w);
    }

    updatePxPerUnit(w) {
      const cam = this.camera, a = [0, 0, 0], b = [0, 0, 0];
      cam.projectNDC(0, 0, -BB.ARENA.playerY, a);
      cam.projectNDC(1, 0, -BB.ARENA.playerY, b);
      this.pxPerUnit = Math.max(8, Math.abs(b[0] - a[0]) * w * 0.5);
    }

    addShake(k) { this.shake = Math.min(1.2, this.shake + k); }

    flashLight(x, y, z, radius, col, life) {
      // x,y,z en marco de arena
      let slot = this.lights[0];
      for (const l of this.lights) if (l.life <= 0) { slot = l; break; } else if (l.life < slot.life) slot = l;
      slot.x = x; slot.y = z; slot.z = -y; slot.r = radius; slot.c = col; slot.life = life; slot.max = life;
    }

    update(dt, t) {
      const env = this.env, cam = this.camera, f = this.fit;
      env.time = t;
      // luces dinámicas
      for (let i = 0; i < 4; i++) {
        const l = this.lights[i];
        if (l.life > 0) l.life -= dt;
        const k = Math.max(0, l.life / l.max);
        env.pl[i * 4] = l.x; env.pl[i * 4 + 1] = l.y; env.pl[i * 4 + 2] = l.z; env.pl[i * 4 + 3] = l.r * (0.6 + 0.4 * k);
        env.plc[i * 3] = l.c[0] * k; env.plc[i * 3 + 1] = l.c[1] * k; env.plc[i * 3 + 2] = l.c[2] * k;
      }
      // peligro (fase final de boss)
      const dz = this.danger;
      env.lightColor = U.mixc(this.baseEnv.lightColor, [1.2, 0.55, 0.5], dz * 0.6);
      env.ambSky = U.mixc(this.baseEnv.ambSky, [0.6, 0.18, 0.25], dz * 0.7);
      env.fogColor = U.mixc(this.baseEnv.fogColor, [0.18, 0.03, 0.06], dz);
      this.bg.tint = U.mixc([1, 1, 1], [1.4, 0.6, 0.65], dz);
      this.bg.pulse = dz * (0.5 + 0.5 * Math.sin(t * 4));
      this.surface.tint = U.mixc([1, 1, 1], [1.9, 0.55, 0.6], dz);
      // avance del suelo (se repite cada 3,6 unidades: periodo común de rejilla, líneas y marcas)
      const sf = this.surface;
      sf.speed = U.damp(sf.speed, this.scrollTarget || 0, 2.2, dt);
      sf.pos = (sf.pos + sf.speed * dt) % 3.6;

      // cámara
      let ex = f.eye[0], ey = f.eye[1], ez = f.eye[2], tx = f.target[0], ty = f.target[1], tz = f.target[2];
      if (this.camMode === 'menu') {
        this.menuAngle += dt * 0.12;
        const a = Math.sin(this.menuAngle) * 0.5;
        const R = 22;
        ex = Math.sin(a) * R; ez = Math.cos(a) * R - 6; ey = 7 + Math.sin(this.menuAngle * 0.7) * 1.5;
        tx = 0; ty = 1.5; tz = -8;
      } else if (this.camMode === 'shop') {
        ex = 0; ey = 3.6; ez = 5.6; tx = 0; ty = -1.35; tz = -1.9;
      } else if (this.camMode === 'boss') {
        ey = f.eye[1] * 0.72; ez = f.eye[2] + 2; ty = 2.5; tz = f.target[2] - 4;
      }
      const k = 1 - Math.exp(-dt * 2.5);
      if (!this._cam) this._cam = [ex, ey, ez, tx, ty, tz];
      const c = this._cam;
      if (this.snapCam) { c[0] = ex; c[1] = ey; c[2] = ez; c[3] = tx; c[4] = ty; c[5] = tz; this.snapCam = false; }
      c[0] += (ex - c[0]) * k; c[1] += (ey - c[1]) * k; c[2] += (ez - c[2]) * k;
      c[3] += (tx - c[3]) * k; c[4] += (ty - c[4]) * k; c[5] += (tz - c[5]) * k;
      // leve movimiento según jugador (sensación de profundidad)
      let sway = 0;
      if (this.game.player && this.camMode === 'game') sway = this.game.player.x * 0.12;
      this.shakeT += dt;
      this.shake = Math.max(0, this.shake - dt * 1.8);
      const s = this.shake * this.shake * 0.35;
      const sx = s * Math.sin(this.shakeT * 63), sy = s * Math.sin(this.shakeT * 71 + 1);
      cam.eye[0] = c[0] + sway + sx; cam.eye[1] = c[1] + sy; cam.eye[2] = c[2];
      cam.target[0] = c[3] + sway * 0.6 + sx * 0.5; cam.target[1] = c[4] + sy * 0.5; cam.target[2] = c[5];
      cam.up = this.camMode === 'boss' ? [Math.sin(t * 0.8) * 0.03, 1, 0] : [0, 1, 0];
      cam.update();
      this.bg.ox = cam.eye[0] * -0.004; this.bg.oy = (cam.eye[1] - 12) * 0.002;

      // decoración
      this.planet.ry += dt * 0.02;
      for (const n of this.far) {
        n.rx += n.spin[0] * dt; n.ry += n.spin[1] * dt;
        n.pz += n.drift * dt * (1 + this.stars.warp * 0.2);
        if (n.pz > 15) n.pz = -95;
      }
      this.decor.updateWorld(null);
    }

    hooks() {
      return {
        bg: this.bg, stars: this.stars, decor: this.decor,
        surface: this.surface, surfaceModel: this.surfaceModel2 || (this.surfaceModel2 = this.root.world),
        shadowMat: this.shadowsOn ? this.shadowMat : null, shadowColor: this.shadowColor,
      };
    }
  }

  function norm(v) { const l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; }
  BB.World = World;
})(window.BB);
