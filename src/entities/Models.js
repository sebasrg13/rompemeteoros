/* entities/Models.js — fábrica de modelos 3D procedurales y materiales
 * Marco local de la arena: +X derecha, +Y hacia el fondo (arriba en pantalla), +Z altura sobre el suelo.
 */
(function (BB) {
  'use strict';
  const P = BB.Prim, U = BB.U;
  const HALF = Math.PI / 2;

  BB.mat = function (o) {
    return Object.assign({ color: [1, 1, 1], emissive: [0, 0, 0], spec: 0.3, shin: 24, rim: [0.3, 0.55, 1, 0.35], opacity: 1, blend: 0, glow: 1, depthWrite: true, doubleSided: false }, o || {});
  };

  const jit = (c, rnd, k) => [U.clamp(c[0] * (1 + (rnd() - 0.5) * k), 0, 2), U.clamp(c[1] * (1 + (rnd() - 0.5) * k), 0, 2), U.clamp(c[2] * (1 + (rnd() - 0.5) * k), 0, 2)];

  // Superficie irregular: desplaza un icosaedro compartiendo vértices (malla cerrada)
  function rockPrim(detail, seed, amp, bumps) {
    const p = P.ico(1, detail);
    const rnd = U.seeded(seed);
    const dirs = [];
    for (let i = 0; i < (bumps || 9); i++) {
      let x = rnd() - 0.5, y = rnd() - 0.5, z = rnd() - 0.5;
      const l = Math.hypot(x, y, z) || 1;
      dirs.push([x / l, y / l, z / l, (rnd() - 0.4) * amp * 2, 2 + rnd() * 6]);
    }
    const v = p.v, noise = [];
    for (let i = 0; i < v.length; i += 3) {
      const x = v[i], y = v[i + 1], z = v[i + 2];
      let d = 0;
      for (const b of dirs) d += b[3] * Math.pow(Math.max(0, x * b[0] + y * b[1] + z * b[2]), b[4]);
      d += (rnd() - 0.5) * amp * 0.35;
      const r = 1 + d;
      v[i] = x * r; v[i + 1] = y * r; v[i + 2] = z * r;
      noise.push(d);
    }
    // normalizar radio medio a ~1
    let mx = 0;
    for (let i = 0; i < v.length; i += 3) mx = Math.max(mx, Math.hypot(v[i], v[i + 1], v[i + 2]));
    for (let i = 0; i < v.length; i++) v[i] /= mx * 0.93;
    p.noise = noise;
    return p;
  }

  const M = { geo: {}, mat: {} };
  BB.Models = M;

  // ---------------- METEORITOS ----------------
  M.METEOR_TYPES = ['normal', 'armored', 'explosive', 'electric', 'crystal', 'giant'];

  function meteorGeo(type, seed) {
    const b = new BB.GeoBuilder();
    const rnd = U.seeded(seed * 31 + 7);
    if (type === 'crystal') {
      const cols = [[0.55, 0.35, 1.0], [0.3, 0.8, 1.0], [0.8, 0.5, 1.0]];
      b.add(P.oct(0.62, 1.5), { color: (x, y, z, i) => jit(cols[i % 3], rnd, 0.3), glow: 0.35, rx: rnd(), rz: rnd() });
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2 + rnd(), e = (rnd() - 0.5) * 1.6;
        const dx = Math.cos(a) * Math.cos(e), dy = Math.sin(a) * Math.cos(e), dz = Math.sin(e);
        const len = 0.5 + rnd() * 0.35;
        // orientar el cristal (eje Y) hacia afuera
        const rz = Math.atan2(-dx, dy), rx = Math.asin(U.clamp(dz, -1, 1));
        b.add(P.oct(0.22 + rnd() * 0.08, 2.4), { x: dx * len * 0.7, y: dy * len * 0.7, z: dz * len * 0.7, rx: rx, rz: rz, color: () => jit(cols[i % 3], rnd, 0.25), glow: 0.45 });
      }
      return b.build('meteor_crystal');
    }
    const detail = type === 'armored' ? 1 : 2;
    const amp = type === 'giant' ? 0.3 : type === 'armored' ? 0.12 : 0.22;
    const rp = rockPrim(detail, seed * 97 + 13, amp, type === 'giant' ? 12 : 9);
    let base, dark, glowC = null, glowP = 0;
    switch (type) {
      case 'normal': base = [0.62, 0.5, 0.42]; dark = [0.3, 0.24, 0.22]; break;
      case 'armored': base = [0.52, 0.58, 0.68]; dark = [0.25, 0.28, 0.34]; break;
      case 'explosive': base = [0.38, 0.14, 0.1]; dark = [0.16, 0.06, 0.05]; glowC = [1.0, 0.45, 0.08]; glowP = 0.3; break;
      case 'electric': base = [0.2, 0.26, 0.42]; dark = [0.1, 0.12, 0.22]; glowC = [0.3, 0.95, 1.0]; glowP = 0.2; break;
      case 'giant': base = [0.42, 0.36, 0.36]; dark = [0.18, 0.14, 0.15]; glowC = [1.0, 0.3, 0.1]; glowP = 0.14; break;
      default: base = [0.6, 0.5, 0.4]; dark = [0.3, 0.25, 0.2];
    }
    const faceGlow = [];
    b.add(rp, {
      flat: true,
      color: (x, y, z, i) => {
        const r = Math.hypot(x, y, z);
        const t = U.clamp((r - 0.8) * 2.2, 0, 1);
        let c = U.mixc(dark, base, t);
        c = jit(c, rnd, 0.35);
        const g = glowC && (rnd() < glowP || r < 0.82 && rnd() < glowP * 2.2);
        faceGlow[i] = g ? 1 : 0;
        return g ? glowC : c;
      },
      glow: (x, y, z, i) => faceGlow[i] ? 1 : 0,
    });
    if (type === 'armored') {
      const steel = [0.75, 0.8, 0.88];
      b.add(P.torus(0.93, 0.11, 6, 20), { color: steel, flat: false });
      b.add(P.torus(0.93, 0.09, 6, 20), { rx: HALF, color: [0.6, 0.65, 0.72], flat: false });
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        b.add(P.box(0.16, 0.16, 0.16), { x: Math.cos(a) * 1.0, y: Math.sin(a) * 1.0, rz: a, color: [0.95, 0.75, 0.3], glow: 0.2 });
      }
    }
    if (type === 'electric') {
      for (let i = 0; i < 5; i++) {
        const a = rnd() * Math.PI * 2, e = (rnd() - 0.5) * 2;
        const dx = Math.cos(a) * Math.cos(e), dy = Math.sin(a) * Math.cos(e), dz = Math.sin(e);
        b.add(P.oct(0.16, 2.2), { x: dx * 0.95, y: dy * 0.95, z: dz * 0.95, rz: Math.atan2(-dx, dy), rx: Math.asin(U.clamp(dz, -1, 1)), color: [0.4, 1, 1], glow: 1 });
      }
    }
    return b.build('meteor_' + type);
  }

  M.meteorMat = function (type) {
    switch (type) {
      case 'armored': return BB.mat({ spec: 1.1, shin: 42, rim: [0.5, 0.8, 1, 0.45] });
      case 'explosive': return BB.mat({ spec: 0.25, shin: 16, rim: [1, 0.4, 0.1, 0.5], glow: 1.4 });
      case 'electric': return BB.mat({ spec: 0.6, shin: 30, rim: [0.2, 0.9, 1, 0.7], glow: 1.3 });
      case 'crystal': return BB.mat({ spec: 1.6, shin: 70, rim: [0.8, 0.5, 1, 0.9], glow: 1.2 });
      case 'giant': return BB.mat({ spec: 0.2, shin: 12, rim: [1, 0.45, 0.2, 0.5], glow: 1.3 });
      default: return BB.mat({ spec: 0.16, shin: 12, rim: [0.45, 0.6, 1, 0.3] });
    }
  };

  // ---------------- JUGADOR ----------------
  M.SKINS = {
    cobalt: { hull: [0.3, 0.45, 0.85], dark: [0.12, 0.15, 0.28], accent: [0.25, 0.9, 1.0], name: 'Cobalto' },
    solar: { hull: [0.95, 0.7, 0.2], dark: [0.35, 0.2, 0.08], accent: [1.0, 0.55, 0.15], name: 'Solar' },
    venom: { hull: [0.3, 0.8, 0.35], dark: [0.08, 0.2, 0.12], accent: [0.6, 1.0, 0.2], name: 'Venom' },
    phantom: { hull: [0.22, 0.2, 0.3], dark: [0.07, 0.06, 0.1], accent: [0.8, 0.35, 1.0], name: 'Phantom' },
    crimson: { hull: [0.85, 0.15, 0.25], dark: [0.25, 0.05, 0.08], accent: [1.0, 0.85, 0.3], name: 'Royal Crimson' },
  };

  M.playerParts = function (skinId, cannonId) {
    const sk = M.SKINS[skinId] || M.SKINS.cobalt;
    const metal = [0.55, 0.6, 0.7];
    // base (hover platform)
    const base = new BB.GeoBuilder();
    base.add(P.cyl(0.78, 0.95, 0.32, 22), { rx: HALF, z: 0.28, color: sk.dark });
    base.add(P.cyl(0.62, 0.78, 0.12, 22), { rx: HALF, z: 0.5, color: metal });
    base.add(P.torus(0.9, 0.055, 6, 28), { z: 0.3, color: sk.accent, glow: 1 });
    for (const s of [-1, 1]) {
      base.add(P.box(0.32, 0.9, 0.34, 0.8, 0.8), { x: s * 0.98, y: -0.05, z: 0.36, color: sk.hull });
      base.add(P.box(0.08, 0.7, 0.08), { x: s * 1.16, y: 0, z: 0.42, color: sk.accent, glow: 1 });
      base.add(P.cyl(0.13, 0.1, 0.18, 10), { x: s * 0.98, y: -0.58, z: 0.36, color: sk.accent, glow: 1 });
    }
    // torreta
    const turret = new BB.GeoBuilder();
    turret.add(P.sphere(0.56, 18, 12), { z: 0.62, sz: 0.72, color: sk.hull });
    turret.add(P.box(0.5, 0.22, 0.18), { y: 0.36, z: 0.72, color: sk.dark });
    turret.add(P.sphere(0.12, 10, 8), { x: -0.2, y: 0.34, z: 0.86, color: sk.accent, glow: 1 });
    turret.add(P.sphere(0.12, 10, 8), { x: 0.2, y: 0.34, z: 0.86, color: sk.accent, glow: 1 });
    turret.add(P.torus(0.5, 0.04, 5, 24), { z: 0.62, color: metal });
    // cañón (nodo propio para el retroceso)
    const barrel = new BB.GeoBuilder();
    const addBarrel = (x, r, len) => {
      barrel.add(P.cyl(r * 0.85, r, len, 12), { x, y: len / 2, color: metal });
      barrel.add(P.torus(r * 1.05, r * 0.32, 5, 14), { x, y: len - 0.02, rx: HALF, color: sk.accent, glow: 1 });
      barrel.add(P.cyl(r * 1.25, r * 1.25, 0.16, 12), { x, y: 0.12, color: sk.dark });
    };
    switch (cannonId) {
      case 'twin': addBarrel(-0.17, 0.12, 1.05); addBarrel(0.17, 0.12, 1.05); break;
      case 'titan':
        addBarrel(0, 0.21, 1.15);
        for (const s of [-1, 1]) barrel.add(P.box(0.06, 0.6, 0.3, 1, 0.4), { x: s * 0.24, y: 0.45, color: sk.accent, glow: 0.6 });
        break;
      case 'nova':
        addBarrel(0, 0.15, 1.25); addBarrel(-0.25, 0.09, 0.85); addBarrel(0.25, 0.09, 0.85);
        barrel.add(P.torus(0.3, 0.035, 5, 20), { y: 0.55, rx: HALF, color: sk.accent, glow: 1 });
        break;
      default: addBarrel(0, 0.15, 1.12);
    }
    const core = new BB.GeoBuilder();
    core.add(P.sphere(0.16, 12, 10), { color: [1, 1, 1], glow: 1 });
    return { base: base.build('p_base'), turret: turret.build('p_turret'), barrel: barrel.build('p_barrel'), core: core.build('p_core'), skin: sk };
  };

  // ---------------- ALIENS ----------------
  M.alienParts = function (type) {
    const body = new BB.GeoBuilder(), limbs = new BB.GeoBuilder();
    switch (type) {
      case 'fast': {
        const c = [1.0, 0.72, 0.15], d = [0.35, 0.18, 0.05];
        body.add(P.box(0.5, 1.5, 0.35, 0.08, 0.3), { rz: Math.PI, color: c });
        body.add(P.sphere(0.3, 12, 8), { y: 0.1, z: 0.12, sz: 0.8, color: d });
        body.add(P.sphere(0.09, 8, 6), { x: -0.13, y: -0.12, z: 0.27, color: [1, 0.2, 0.1], glow: 1 });
        body.add(P.sphere(0.09, 8, 6), { x: 0.13, y: -0.12, z: 0.27, color: [1, 0.2, 0.1], glow: 1 });
        for (const s of [-1, 1]) limbs.add(P.box(1.0, 0.45, 0.06, 0.2, 1), { x: s * 0.55, y: 0.25, rz: s * -0.5, color: c });
        limbs.add(P.cyl(0.12, 0.05, 0.25, 8), { y: 0.75, color: [1, 0.9, 0.5], glow: 1 });
        break;
      }
      case 'tank': {
        const c = [0.55, 0.32, 0.85], d = [0.22, 0.14, 0.36];
        body.add(P.sphere(0.9, 18, 12), { sx: 1.15, sy: 0.95, sz: 0.75, color: c });
        body.add(P.box(1.9, 0.5, 0.35), { y: -0.35, z: 0.1, color: d });
        body.add(P.box(1.2, 0.9, 0.3), { z: 0.55, color: d });
        body.add(P.sphere(0.28, 12, 10), { y: -0.72, z: 0.25, color: [1, 0.25, 0.3], glow: 1 });
        body.add(P.torus(0.3, 0.06, 5, 16), { y: -0.7, z: 0.25, rx: HALF, color: [0.9, 0.9, 1] });
        for (let i = 0; i < 4; i++) {
          const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
          limbs.add(P.cyl(0.18, 0.12, 0.6, 8), { x: Math.cos(a) * 0.85, y: Math.sin(a) * 0.7, z: -0.3, rx: HALF, color: d });
          limbs.add(P.sphere(0.16, 8, 6), { x: Math.cos(a) * 0.85, y: Math.sin(a) * 0.7, z: -0.6, color: c });
        }
        break;
      }
      case 'shooter': {
        const c = [0.95, 0.25, 0.3], d = [0.35, 0.08, 0.12];
        body.add(P.sphere(0.62, 16, 12), { sz: 0.8, color: c });
        body.add(P.sphere(0.4, 12, 10), { z: 0.3, color: d });
        for (let i = 0; i < 3; i++) body.add(P.sphere(0.1, 8, 6), { x: (i - 1) * 0.2, y: -0.33, z: 0.42 + (i === 1 ? 0.08 : 0), color: [0.3, 1, 0.5], glow: 1 });
        body.add(P.cyl(0.02, 0.03, 0.5, 5), { z: 0.8, rx: HALF, color: [0.9, 0.9, 1] });
        body.add(P.sphere(0.08, 8, 6), { z: 1.05, color: [1, 1, 0.4], glow: 1 });
        for (const s of [-1, 1]) {
          limbs.add(P.cyl(0.13, 0.16, 0.9, 10), { x: s * 0.7, y: -0.2, color: [0.6, 0.62, 0.7] });
          limbs.add(P.torus(0.14, 0.04, 5, 12), { x: s * 0.7, y: -0.65, rx: HALF, color: [1, 0.4, 0.3], glow: 1 });
          limbs.add(P.sphere(0.25, 10, 8), { x: s * 0.7, y: 0.25, color: d });
        }
        break;
      }
      default: { // normal: platillo + cabeza + ojos + extremidades
        const c = [0.35, 0.95, 0.45], d = [0.12, 0.35, 0.2];
        body.add(P.cyl(1.0, 0.6, 0.28, 22), { rx: HALF, color: [0.6, 0.65, 0.75] });
        body.add(P.sphere(0.5, 16, 12), { z: 0.3, color: c });
        body.add(P.sphere(0.13, 8, 6), { x: -0.18, y: -0.38, z: 0.45, color: [0.05, 0.05, 0.05] });
        body.add(P.sphere(0.13, 8, 6), { x: 0.18, y: -0.38, z: 0.45, color: [0.05, 0.05, 0.05] });
        body.add(P.sphere(0.05, 6, 5), { x: -0.18, y: -0.49, z: 0.49, color: [1, 1, 1], glow: 1 });
        body.add(P.sphere(0.05, 6, 5), { x: 0.18, y: -0.49, z: 0.49, color: [1, 1, 1], glow: 1 });
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          body.add(P.sphere(0.07, 6, 5), { x: Math.cos(a) * 0.85, y: Math.sin(a) * 0.85, z: 0.04, color: [1, 0.9, 0.3], glow: 1 });
        }
        for (let i = 0; i < 3; i++) {
          const a = (i / 3) * Math.PI * 2 + Math.PI / 2;
          limbs.add(P.cyl(0.02, 0.1, 0.6, 6), { x: Math.cos(a) * 0.45, y: Math.sin(a) * 0.45, z: -0.35, rx: HALF, color: d });
        }
        break;
      }
    }
    return { body: body.build('alien_' + type), limbs: limbs.build('alien_limbs_' + type) };
  };

  // ---------------- MINI NAVE ----------------
  M.miniShip = function () {
    const b = new BB.GeoBuilder();
    b.add(P.box(0.35, 1.0, 0.25, 0.1, 0.4), { color: [0.85, 0.9, 1.0] });
    b.add(P.box(1.0, 0.35, 0.06, 0.3, 1), { y: -0.15, color: [0.3, 0.9, 0.6] });
    b.add(P.sphere(0.1, 8, 6), { y: 0.05, z: 0.12, color: [0.4, 1, 1], glow: 1 });
    b.add(P.cyl(0.1, 0.07, 0.15, 8), { y: -0.55, color: [0.4, 1, 0.7], glow: 1 });
    return b.build('mini');
  };

  // ---------------- MONEDA / POWERUP / FRAGMENTOS ----------------
  M.coin = function () {
    const b = new BB.GeoBuilder();
    b.add(P.cyl(0.3, 0.3, 0.07, 18), { color: [1.0, 0.78, 0.2] });
    b.add(P.torus(0.29, 0.04, 5, 18), { rx: HALF, color: [1.0, 0.9, 0.45] });
    b.add(P.box(0.12, 0.09, 0.3), { rz: 0.785, color: [1, 0.95, 0.6], glow: 0.3 });
    return b.build('coin');
  };

  M.bullet = function () {
    const b = new BB.GeoBuilder();
    b.add(P.sphere(0.5, 10, 8), { sy: 1.8, color: [1, 1, 1], glow: 1 });
    return b.build('bullet');
  };
  M.orb = function () {
    const b = new BB.GeoBuilder();
    b.add(P.ico(0.5, 1), { color: [1, 1, 1], glow: 1, flat: false });
    return b.build('orb');
  };
  M.missile = function () {
    const b = new BB.GeoBuilder();
    b.add(P.cyl(0.14, 0.14, 0.7, 8), { color: [0.7, 0.7, 0.75] });
    b.add(P.cyl(0, 0.14, 0.3, 8), { y: 0.5, color: [1, 0.3, 0.2], glow: 0.6 });
    for (let i = 0; i < 4; i++) b.add(P.box(0.02, 0.25, 0.2), { y: -0.3, rz: 0, ry: i * HALF, color: [0.9, 0.2, 0.2] });
    b.add(P.cyl(0.1, 0.06, 0.1, 8), { y: -0.4, color: [1, 0.8, 0.3], glow: 1 });
    return b.build('missile');
  };
  M.debris = function (seed) {
    const b = new BB.GeoBuilder();
    const rp = rockPrim(0, seed, 0.3, 4);
    b.add(rp, { color: [1, 1, 1] });
    return b.build('debris');
  };
  M.powerupRing = function () {
    const b = new BB.GeoBuilder();
    b.add(P.torus(0.55, 0.06, 6, 24), { color: [1, 1, 1], glow: 1 });
    b.add(P.torus(0.55, 0.05, 6, 24), { rx: HALF, color: [1, 1, 1], glow: 1 });
    return b.build('pu_ring');
  };
  M.shieldBubble = function () {
    const b = new BB.GeoBuilder();
    b.add(P.sphere(1, 20, 14), { color: [1, 1, 1], flat: false });
    return b.build('bubble');
  };

  // ---------------- BOSSES ----------------
  M.boss = {};
  M.boss.titan = function () {
    const core = new BB.GeoBuilder();
    const rp = rockPrim(3, 4242, 0.2, 14);
    const rnd = U.seeded(99);
    const tg = [];
    core.add(rp, {
      flat: true,
      color: (x, y, z, i) => {
        const r = Math.hypot(x, y, z);
        tg[i] = (r < 0.86 && rnd() < 0.5) || rnd() < 0.07;
        return tg[i] ? [1, 0.32, 0.05] : jit([0.4, 0.3, 0.3], rnd, 0.4);
      },
      glow: (x, y, z, i) => (tg[i] ? 0.85 : 0),
    });
    // ojo
    core.add(P.sphere(0.28, 14, 10), { y: -0.88, z: 0.15, color: [1, 0.9, 0.3], glow: 1 });
    core.add(P.torus(0.3, 0.06, 6, 18), { y: -0.86, z: 0.15, rx: HALF, color: [0.3, 0.1, 0.05] });
    // cuernos
    for (let i = 0; i < 5; i++) {
      const a = -0.8 + i * 0.4;
      core.add(P.cyl(0, 0.14, 0.6, 7), { x: Math.sin(a) * 0.85, z: Math.cos(a) * 0.85, y: 0.1, ry: a, color: [0.25, 0.2, 0.2] });
    }
    const chunk = new BB.GeoBuilder();
    chunk.add(rockPrim(1, 777, 0.3, 6), { color: (x, y, z, i) => (i % 5 === 0 ? [1, 0.4, 0.1] : [0.45, 0.35, 0.33]), glow: (x, y, z, i) => (i % 5 === 0 ? 1 : 0) });
    return { core: core.build('titan'), chunk: chunk.build('titan_chunk') };
  };

  M.boss.destroyer = function () {
    const hull = new BB.GeoBuilder();
    const g = [0.35, 0.37, 0.44], d = [0.15, 0.16, 0.2], red = [1, 0.2, 0.15];
    hull.add(P.box(1.5, 4.2, 0.7, 0.35, 0.6), { rz: Math.PI, color: g });
    hull.add(P.box(0.9, 1.6, 0.6, 0.6, 0.7), { y: 0.8, z: 0.5, color: d });
    hull.add(P.box(0.5, 0.5, 0.4), { y: 1.1, z: 0.95, color: g });
    hull.add(P.box(0.4, 0.08, 0.1), { y: 0.85, z: 1.0, color: red, glow: 1 });
    for (const s of [-1, 1]) {
      hull.add(P.box(2.8, 1.8, 0.18, 0.35, 1), { x: s * 1.6, y: 0.5, rz: s * 0.25, color: g });
      hull.add(P.box(0.35, 1.9, 0.45), { x: s * 2.7, y: 0.6, color: d });
      hull.add(P.cyl(0.28, 0.22, 0.4, 12), { x: s * 2.7, y: 1.6, color: [1, 0.45, 0.2], glow: 1 });
      hull.add(P.box(0.08, 1.4, 0.06), { x: s * 1.3, y: 0.3, z: 0.14, rz: s * 0.25, color: red, glow: 1 });
    }
    for (let i = 0; i < 3; i++) hull.add(P.cyl(0.3, 0.24, 0.5, 12), { x: (i - 1) * 0.55, y: 2.1, color: [1, 0.5, 0.2], glow: 1 });
    hull.add(P.sphere(0.2, 10, 8), { y: -2.0, z: 0.2, color: red, glow: 1 });
    const turret = new BB.GeoBuilder();
    turret.add(P.sphere(0.32, 12, 8), { sz: 0.7, color: d });
    turret.add(P.cyl(0.07, 0.09, 0.7, 8), { y: -0.4, rz: Math.PI, color: g });
    turret.add(P.sphere(0.09, 6, 5), { y: -0.75, color: red, glow: 1 });
    return { hull: hull.build('destroyer'), turret: turret.build('d_turret') };
  };

  M.boss.mother = function () {
    const body = new BB.GeoBuilder();
    const rnd = U.seeded(55);
    const pink = [0.85, 0.3, 0.65], dk = [0.35, 0.1, 0.3];
    body.add(P.sphere(1, 24, 16), { sx: 2.1, sy: 1.7, sz: 1.5, color: (x, y, z, i) => (rnd() < 0.12 ? [0.5, 1, 0.4] : jit(pink, rnd, 0.3)), glow: (x, y, z, i) => 0 });
    for (let i = 0; i < 12; i++) {
      const a = rnd() * Math.PI * 2, e = rnd() * 1.2;
      body.add(P.sphere(0.18 + rnd() * 0.15, 8, 6), { x: Math.cos(a) * Math.cos(e) * 2.0, y: Math.sin(a) * Math.cos(e) * 1.6, z: Math.sin(e) * 1.4, color: [0.5, 1, 0.4], glow: 0.9 });
    }
    // ojos al frente (hacia -Y)
    const eyes = [[0, -1.55, 0.5, 0.35], [-0.75, -1.35, 0.6, 0.22], [0.75, -1.35, 0.6, 0.22], [-0.4, -1.5, 1.0, 0.16], [0.4, -1.5, 1.0, 0.16]];
    for (const e of eyes) {
      body.add(P.sphere(e[3], 12, 8), { x: e[0], y: e[1], z: e[2], color: [1, 0.95, 0.4], glow: 1 });
      body.add(P.sphere(e[3] * 0.45, 8, 6), { x: e[0], y: e[1] - e[3] * 0.7, z: e[2], color: [0.05, 0.02, 0.05] });
    }
    for (let i = 0; i < 7; i++) {
      const a = -1.2 + i * 0.4;
      body.add(P.cyl(0, 0.2, 0.9, 7), { x: Math.sin(a) * 1.6, z: 1.2 + Math.cos(a) * 0.3, y: 0.3, ry: a * 0.8, color: dk });
    }
    const tent = new BB.GeoBuilder();
    for (let k = 0; k < 5; k++) tent.add(P.sphere(0.32 - k * 0.05, 10, 8), { y: -k * 0.45, color: k % 2 ? dk : pink, glow: k === 4 ? 1 : 0 });
    return { body: body.build('mother'), tent: tent.build('mother_tent') };
  };

  M.boss.blackhole = function () {
    const core = new BB.GeoBuilder();
    core.add(P.sphere(1.3, 24, 18), { color: [0.02, 0.01, 0.04] });
    const disk = new BB.GeoBuilder();
    disk.add(P.torus(2.5, 0.55, 10, 48), {
      sz: 0.18, flat: false,
      color: (x, y, z) => { const r = Math.hypot(x, y); return U.mixc([1, 0.75, 0.3], [0.55, 0.2, 1], U.clamp((r - 2.0) / 1.2, 0, 1)); },
      glow: 1,
    });
    const disk2 = new BB.GeoBuilder();
    disk2.add(P.torus(1.75, 0.18, 8, 40), { sz: 0.4, flat: false, color: [0.5, 0.85, 1], glow: 1 });
    return { core: core.build('bh_core'), disk: disk.build('bh_disk'), disk2: disk2.build('bh_disk2') };
  };

  M.boss.king = function () {
    const core = new BB.GeoBuilder();
    const rnd = U.seeded(314);
    const rp = rockPrim(3, 9001, 0.18, 12);
    const kg = [];
    core.add(rp, {
      flat: true,
      color: (x, y, z, i) => {
        const r = Math.hypot(x, y, z);
        kg[i] = (r < 0.8 && rnd() < 0.45) || rnd() < 0.05;
        return kg[i] ? [0.62, 0.25, 1] : z > 0.35 && rnd() < 0.5 ? [1, 0.8, 0.3] : jit([0.32, 0.26, 0.34], rnd, 0.4);
      },
      glow: (x, y, z, i) => (kg[i] ? 0.8 : 0),
    });
    core.add(P.sphere(0.2, 14, 10), { y: -0.93, z: 0.1, color: [0.8, 0.4, 1], glow: 1 });
    const crown = new BB.GeoBuilder();
    const gold = [1, 0.78, 0.25];
    crown.add(P.cyl(0.62, 0.7, 0.28, 18, false), { rx: HALF, color: gold });
    crown.add(P.torus(0.68, 0.06, 5, 20), { z: -0.14, color: gold });
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      crown.add(P.cyl(0, 0.13, 0.5, 6), { x: Math.cos(a) * 0.64, y: Math.sin(a) * 0.64, z: 0.35, rx: HALF, color: gold });
      crown.add(P.oct(0.08, 1.4), { x: Math.cos(a) * 0.69, y: Math.sin(a) * 0.69, z: 0.02, color: i % 2 ? [1, 0.2, 0.3] : [0.3, 0.9, 1], glow: 1 });
    }
    const shard = new BB.GeoBuilder();
    shard.add(P.oct(0.3, 2.2), { color: [0.5, 0.9, 1], glow: 0.7 });
    return { core: core.build('king'), crown: crown.build('king_crown'), shard: shard.build('king_shard') };
  };

  // ---------------- ENTORNO ----------------
  M.planet = function () {
    const b = new BB.GeoBuilder();
    const rnd = U.seeded(2024);
    b.add(P.sphere(1, 36, 24), {
      flat: false,
      color: (x, y, z) => {
        const band = Math.sin(y * 9 + Math.sin(x * 3) * 0.8) * 0.5 + 0.5;
        return U.mixc([0.35, 0.2, 0.55], [0.95, 0.55, 0.45], band * 0.8 + rnd() * 0.08);
      },
    });
    const ring = new BB.GeoBuilder();
    ring.add(P.torus(1.8, 0.28, 3, 64), { sz: 0.05, flat: false, color: [0.9, 0.75, 0.6], glow: 0.25 });
    return { planet: b.build('planet'), ring: ring.build('planet_ring') };
  };

  M.gate = function (halfW) {
    const b = new BB.GeoBuilder();
    const g = [0.28, 0.32, 0.42], glow = [0.3, 0.9, 1];
    for (const s of [-1, 1]) {
      b.add(P.box(0.7, 0.7, 4.2, 0.7, 0.7), { x: s * (halfW + 1.2), z: 2.1, color: g });
      b.add(P.box(0.12, 0.12, 3.6), { x: s * (halfW + 0.82), y: -0.36, z: 2.0, color: glow, glow: 1 });
    }
    b.add(P.box((halfW + 1.6) * 2, 0.6, 0.55), { z: 4.2, color: g });
    b.add(P.box((halfW + 1.2) * 2, 0.1, 0.12), { y: -0.32, z: 4.05, color: [1, 0.35, 0.3], glow: 1 });
    return b.build('gate');
  };

  M.rails = function (halfW, len) {
    const b = new BB.GeoBuilder();
    for (const s of [-1, 1]) {
      b.add(P.box(0.3, len, 0.35), { x: s * (halfW + 0.2), y: len / 2 - 2, z: 0.17, color: [0.2, 0.24, 0.34] });
      b.add(P.box(0.07, len, 0.06), { x: s * (halfW + 0.06), y: len / 2 - 2, z: 0.36, color: [0.3, 0.95, 1], glow: 1 });
    }
    b.add(P.box(halfW * 2 + 0.7, 0.35, 0.22), { y: -1.2, z: 0.11, color: [0.2, 0.24, 0.34] });
    b.add(P.box(halfW * 2 + 0.4, 0.06, 0.05), { y: -1.03, z: 0.24, color: [1, 0.55, 0.2], glow: 1 });
    return b.build('rails');
  };

  M.meteorGeo = meteorGeo;

  // Construcción de todas las geometrías compartidas (se llama en la carga)
  M.buildAll = function () {
    M.geo.meteor = {};
    for (const t of M.METEOR_TYPES) {
      M.geo.meteor[t] = [0, 1, 2].map((i) => meteorGeo(t, i + 1 + t.length * 11));
      M.mat['meteor_' + t] = M.meteorMat(t);
    }
    M.geo.alien = {};
    for (const t of ['normal', 'fast', 'tank', 'shooter']) M.geo.alien[t] = M.alienParts(t);
    M.geo.mini = M.miniShip();
    M.geo.coin = M.coin();
    M.geo.bullet = M.bullet();
    M.geo.orb = M.orb();
    M.geo.missile = M.missile();
    M.geo.debris = [11, 22, 33].map((s) => M.debris(s));
    M.geo.puRing = M.powerupRing();
    M.geo.bubble = M.shieldBubble();
    M.geo.boss = {
      titan: M.boss.titan(), destroyer: M.boss.destroyer(), mother: M.boss.mother(), blackhole: M.boss.blackhole(), king: M.boss.king(),
    };
  };
})(window.BB);
