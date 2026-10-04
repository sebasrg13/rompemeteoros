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
      this.core.visible = !parts.skin.cc;   // en las skins de países, la bandera ocupa el lugar del núcleo
      this.accent = parts.skin.accent;
      this.skin = skinId; this.cannon = cannonId;
    }

    // Sticker de la bandera (skins de países): calcomanía curva pegada arriba de la cúpula
    renderSticker(batch) {
      const sk = BB.Models.SKINS[this.skin];
      const uv = sk && sk.cc ? BB.Tex.flagUV[sk.cc] : null;
      if (!uv || !this.node.visible || !this.turret.visible) return;
      BB.drawSticker(batch, this.node, this.turret, uv);
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
      const shieldOn = (g.boosts && g.boosts.isActive('shield')) || g.premShieldT > 0;
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
        // Núcleo de Poder (premium de campaña): lanzallamas zigzag automático
        if (g.premium && g.premium.zigOn()) {
          this.zigT = (this.zigT || 0) - dt;
          if (this.zigT <= 0) {
            this.zigT = 0.6;
            this.zigDir = -(this.zigDir || 1);
            const st = g.stats;
            // el daño del zigzag sube con el nivel de la nave; con la pasiva Segunda llama salen dos cruzadas
            const zd = st.dmg * 2.6 * (g.boosts.isActive('damage') ? 1.7 : 1) * g.ship.zigMult();
            g.bullets.fireZigzag(this.x, this.y + 1.2, 0.8, zd, this.zigDir);
            if (g.ship.has('twin')) g.bullets.fireZigzag(this.x, this.y + 1.2, 0.8, zd, -this.zigDir);
          }
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
  // Calcomanía sobre la cúpula (elipsoide de radio 0,56 x 0,56 x 0,403 centrado en z = 0,62).
  // Es un rectángulo visto desde ARRIBA, proyectado sobre la cúpula: de arriba se ve la bandera sin deformar
  // (con la parte superior hacia el frente de la nave) y de costado se ve pegada a la curva.
  const STK = (function () {
    const NT = 8, NP = 6, K = 1.045, RX = 0.56, RZ = 0.403, CZ = 0.62;
    const SW = 0.76, SH = SW / 1.45, UP0 = -0.06;         // ancho, alto y corrimiento hacia atrás (deja libres los faros)
    const D = [0, 0, 1];                                   // se proyecta desde arriba
    const UPV = [0, 1, 0];                                 // la parte de arriba de la bandera apunta al frente
    const L = new Float32Array((NT + 1) * (NP + 1) * 3);
    for (let j = 0; j <= NP; j++) for (let i = 0; i <= NT; i++) {
      const sx = -SW / 2 + (SW * i) / NT, su = UP0 - SH / 2 + (SH * j) / NP, o = (j * (NT + 1) + i) * 3;
      // punto del plano, llevado lejos hacia la cámara; rayo hacia la nave y choque con el elipsoide
      const ox = sx + D[0] * 5, oy = UPV[1] * su + D[1] * 5, oz = UPV[2] * su + D[2] * 5;
      const ax = ox / RX, ay = oy / RX, az = oz / RZ, bx = -D[0] / RX, by = -D[1] / RX, bz = -D[2] / RZ;
      const A = bx * bx + by * by + bz * bz, B = 2 * (ax * bx + ay * by + az * bz), C = ax * ax + ay * ay + az * az - K * K;
      const disc = Math.max(0, B * B - 4 * A * C), t = (-B - Math.sqrt(disc)) / (2 * A);
      L[o] = ox - D[0] * t; L[o + 1] = oy - D[1] * t; L[o + 2] = CZ + oz - D[2] * t;
    }
    return { NT, NP, L, W: new Float32Array(L.length) };
  })();
  BB.drawSticker = function (batch, root, node, uv) {
    root.updateWorld(root.parent ? root.parent.world : null);   // matriz al día (el render la recalcula después)
    const m = node.world, L = STK.L, W = STK.W, NT = STK.NT, NP = STK.NP;
    for (let o = 0; o < L.length; o += 3) {
      const x = L[o], y = L[o + 1], z = L[o + 2];
      W[o] = m[0] * x + m[4] * y + m[8] * z + m[12];
      W[o + 1] = m[1] * x + m[5] * y + m[9] * z + m[13];
      W[o + 2] = m[2] * x + m[6] * y + m[10] * z + m[14];
    }
    const du = (uv[2] - uv[0]) / NT, dv = (uv[3] - uv[1]) / NP, row = (NT + 1) * 3;
    for (let j = 0; j < NP; j++) for (let i = 0; i < NT; i++) {
      const a = j * row + i * 3;
      // j crece hacia arriba: la fila de arriba de la imagen (v chico) va en el borde superior
      batch.quad4(W, a, a + 3, a + row + 3, a + row, uv[0] + du * i, uv[3] - dv * (j + 1), uv[0] + du * (i + 1), uv[3] - dv * j, 1, 1, 1, 1);
    }
  };
  BB.Player = Player;
  BB.MULTI_LEVELS = MULTI;
})(window.BB);
