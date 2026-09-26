/* engine/Geometry.js — geometrías procedurales (sin assets externos)
 * Formato de vértice: pos(3) normal(3) color(3) glow(1)  => stride 10 floats
 */
(function (BB) {
  'use strict';
  const M4 = BB.M4;
  const STRIDE = 10;

  class Geometry {
    constructor(data, name) {
      this.data = data;
      this.count = data.length / STRIDE;
      this.name = name || '';
      this._gen = -1;
      this._vbo = null;
      this.radius = 1;
    }
  }
  Geometry.STRIDE = STRIDE;
  BB.Geometry = Geometry;

  // ---------- Primitivas indexadas {v, f, n?} ----------
  const P = {};

  P.box = function (w, h, d, topScaleX, topScaleZ) {
    const hx = w / 2, hy = h / 2, hz = d / 2;
    const tx = topScaleX === undefined ? 1 : topScaleX, tz = topScaleZ === undefined ? 1 : topScaleZ;
    const v = [
      -hx, -hy, -hz, hx, -hy, -hz, hx, -hy, hz, -hx, -hy, hz,
      -hx * tx, hy, -hz * tz, hx * tx, hy, -hz * tz, hx * tx, hy, hz * tz, -hx * tx, hy, hz * tz,
    ];
    const f = [0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6, 0, 4, 5, 0, 5, 1, 1, 5, 6, 1, 6, 2, 2, 6, 7, 2, 7, 3, 3, 7, 4, 3, 4, 0];
    return { v, f, smooth: false };
  };

  // Cilindro a lo largo de Y
  P.cyl = function (rt, rb, h, seg, caps) {
    const v = [], f = [];
    const hy = h / 2;
    seg = seg || 12;
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      v.push(c * rt, hy, s * rt, c * rb, -hy, s * rb);
    }
    for (let i = 0; i < seg; i++) {
      const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
      f.push(a, c, b, b, c, d);
    }
    const sideCount = v.length / 3;
    if (caps !== false) {
      const ct = v.length / 3; v.push(0, hy, 0);
      const cb = ct + 1; v.push(0, -hy, 0);
      const base = v.length / 3;
      for (let i = 0; i <= seg; i++) {
        const a = (i / seg) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
        v.push(c * rt, hy, s * rt, c * rb, -hy, s * rb);
      }
      for (let i = 0; i < seg; i++) {
        const t0 = base + i * 2, t1 = base + i * 2 + 2;
        if (rt > 0.0001) f.push(ct, t1, t0);
        if (rb > 0.0001) f.push(cb, t0 + 1, t1 + 1);
      }
    }
    return { v, f, smooth: true, smoothUpTo: sideCount };
  };

  P.sphere = function (r, ws, hs) {
    ws = ws || 16; hs = hs || 12;
    const v = [], f = [], n = [];
    for (let y = 0; y <= hs; y++) {
      const th = (y / hs) * Math.PI;
      for (let x = 0; x <= ws; x++) {
        const ph = (x / ws) * Math.PI * 2;
        const nx = Math.sin(th) * Math.cos(ph), ny = Math.cos(th), nz = Math.sin(th) * Math.sin(ph);
        v.push(nx * r, ny * r, nz * r); n.push(nx, ny, nz);
      }
    }
    for (let y = 0; y < hs; y++) {
      for (let x = 0; x < ws; x++) {
        const a = y * (ws + 1) + x, b = a + ws + 1;
        if (y !== 0) f.push(a, b, a + 1);
        if (y !== hs - 1) f.push(a + 1, b, b + 1);
      }
    }
    return { v, f, n, smooth: true };
  };

  P.ico = function (r, detail) {
    const t = (1 + Math.sqrt(5)) / 2;
    let verts = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]];
    let faces = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
    verts = verts.map((p) => { const l = Math.hypot(p[0], p[1], p[2]); return [p[0] / l, p[1] / l, p[2] / l]; });
    for (let d = 0; d < (detail || 0); d++) {
      const cache = {}, nf = [];
      const mid = (a, b) => {
        const k = a < b ? a + '_' + b : b + '_' + a;
        if (cache[k] !== undefined) return cache[k];
        const pa = verts[a], pb = verts[b];
        let m = [(pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2, (pa[2] + pb[2]) / 2];
        const l = Math.hypot(m[0], m[1], m[2]); m = [m[0] / l, m[1] / l, m[2] / l];
        verts.push(m); cache[k] = verts.length - 1; return cache[k];
      };
      for (const fc of faces) {
        const a = mid(fc[0], fc[1]), b = mid(fc[1], fc[2]), c = mid(fc[2], fc[0]);
        nf.push([fc[0], a, c], [fc[1], b, a], [fc[2], c, b], [a, b, c]);
      }
      faces = nf;
    }
    const v = [], f = [];
    verts.forEach((p) => v.push(p[0] * r, p[1] * r, p[2] * r));
    faces.forEach((fc) => f.push(fc[0], fc[1], fc[2]));
    return { v, f, smooth: false };
  };

  P.oct = function (r, stretchY) {
    const sy = stretchY || 1;
    const v = [r, 0, 0, -r, 0, 0, 0, r * sy, 0, 0, -r * sy, 0, 0, 0, r, 0, 0, -r];
    const f = [0, 2, 4, 0, 4, 3, 0, 3, 5, 0, 5, 2, 1, 2, 5, 1, 5, 3, 1, 3, 4, 1, 4, 2];
    // winding se corrige automáticamente
    return { v, f, smooth: false };
  };

  // Toro plano en el plano XY (eje Z)
  P.torus = function (R, r, rs, ts) {
    rs = rs || 8; ts = ts || 24;
    const v = [], f = [], n = [];
    for (let i = 0; i <= rs; i++) {
      const vv = (i / rs) * Math.PI * 2;
      for (let j = 0; j <= ts; j++) {
        const u = (j / ts) * Math.PI * 2;
        const cx = Math.cos(u), cy = Math.sin(u);
        v.push((R + r * Math.cos(vv)) * cx, (R + r * Math.cos(vv)) * cy, r * Math.sin(vv));
        n.push(Math.cos(vv) * cx, Math.cos(vv) * cy, Math.sin(vv));
      }
    }
    for (let i = 0; i < rs; i++) {
      for (let j = 0; j < ts; j++) {
        const a = i * (ts + 1) + j, b = a + ts + 1;
        f.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
    return { v, f, n, smooth: true };
  };

  P.plane = function (w, h) {
    const hx = w / 2, hy = h / 2;
    return { v: [-hx, -hy, 0, hx, -hy, 0, hx, hy, 0, -hx, hy, 0], f: [0, 1, 2, 0, 2, 3], n: [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1], smooth: false };
  };

  BB.Prim = P;

  // Asegura que cada triángulo apunte hacia afuera
  function fixWinding(p) {
    const v = p.v, f = p.f, n = p.n;
    let cx = 0, cy = 0, cz = 0;
    const nv = v.length / 3;
    for (let i = 0; i < nv; i++) { cx += v[i * 3]; cy += v[i * 3 + 1]; cz += v[i * 3 + 2]; }
    cx /= nv; cy /= nv; cz /= nv;
    for (let t = 0; t < f.length; t += 3) {
      const a = f[t] * 3, b = f[t + 1] * 3, c = f[t + 2] * 3;
      const ux = v[b] - v[a], uy = v[b + 1] - v[a + 1], uz = v[b + 2] - v[a + 2];
      const wx = v[c] - v[a], wy = v[c + 1] - v[a + 1], wz = v[c + 2] - v[a + 2];
      const gx = uy * wz - uz * wy, gy = uz * wx - ux * wz, gz = ux * wy - uy * wx;
      let rx, ry, rz;
      if (n) {
        rx = n[a] + n[b] + n[c]; ry = n[a + 1] + n[b + 1] + n[c + 1]; rz = n[a + 2] + n[b + 2] + n[c + 2];
      } else {
        rx = (v[a] + v[b] + v[c]) / 3 - cx; ry = (v[a + 1] + v[b + 1] + v[c + 1]) / 3 - cy; rz = (v[a + 2] + v[b + 2] + v[c + 2]) / 3 - cz;
        // tapas de cilindro: el centro del cilindro está en el eje, funciona igual
      }
      if (gx * rx + gy * ry + gz * rz < 0) { const tmp = f[t + 1]; f[t + 1] = f[t + 2]; f[t + 2] = tmp; }
    }
  }

  function smoothNormals(p) {
    if (p.n) return p.n;
    const v = p.v, f = p.f, n = new Array(v.length).fill(0);
    const limit = p.smoothUpTo || Infinity;
    for (let t = 0; t < f.length; t += 3) {
      const ia = f[t], ib = f[t + 1], ic = f[t + 2];
      const a = ia * 3, b = ib * 3, c = ic * 3;
      const ux = v[b] - v[a], uy = v[b + 1] - v[a + 1], uz = v[b + 2] - v[a + 2];
      const wx = v[c] - v[a], wy = v[c + 1] - v[a + 1], wz = v[c + 2] - v[a + 2];
      const gx = uy * wz - uz * wy, gy = uz * wx - ux * wz, gz = ux * wy - uy * wx;
      for (const idx of [a, b, c]) { n[idx] += gx; n[idx + 1] += gy; n[idx + 2] += gz; }
    }
    for (let i = 0; i < n.length; i += 3) {
      const l = Math.hypot(n[i], n[i + 1], n[i + 2]) || 1;
      n[i] /= l; n[i + 1] /= l; n[i + 2] /= l;
    }
    p._limit = limit;
    return n;
  }

  // ---------- Constructor de modelos (hornea varias primitivas en una sola geometría) ----------
  class GeoBuilder {
    constructor() { this.out = []; }
    // o: {x,y,z, rx,ry,rz, sx,sy,sz, s, color:[r,g,b]|fn, glow:num|fn, flat:bool}
    add(p, o) {
      o = o || {};
      fixWinding(p);
      const s = o.s || 1;
      const sx = (o.sx || 1) * s, sy = (o.sy || 1) * s, sz = (o.sz || 1) * s;
      const m = M4.compose(new Float32Array(16), o.x || 0, o.y || 0, o.z || 0, o.rx || 0, o.ry || 0, o.rz || 0, sx, sy, sz);
      const mn = M4.compose(new Float32Array(16), 0, 0, 0, o.rx || 0, o.ry || 0, o.rz || 0, 1 / sx, 1 / sy, 1 / sz);
      const flat = o.flat !== undefined ? o.flat : !p.smooth;
      const nrm = flat ? null : smoothNormals(p);
      const v = p.v, f = p.f, out = this.out;
      const tp = [0, 0, 0], tn = [0, 0, 0];
      for (let t = 0; t < f.length; t += 3) {
        const ids = [f[t], f[t + 1], f[t + 2]];
        const P3 = ids.map((i) => { M4.transformPoint(m, v[i * 3], v[i * 3 + 1], v[i * 3 + 2], tp); return [tp[0], tp[1], tp[2]]; });
        const ux = P3[1][0] - P3[0][0], uy = P3[1][1] - P3[0][1], uz = P3[1][2] - P3[0][2];
        const wx = P3[2][0] - P3[0][0], wy = P3[2][1] - P3[0][1], wz = P3[2][2] - P3[0][2];
        let gx = uy * wz - uz * wy, gy = uz * wx - ux * wz, gz = ux * wy - uy * wx;
        const gl = Math.hypot(gx, gy, gz) || 1; gx /= gl; gy /= gl; gz /= gl;
        const fcx = (v[ids[0] * 3] + v[ids[1] * 3] + v[ids[2] * 3]) / 3;
        const fcy = (v[ids[0] * 3 + 1] + v[ids[1] * 3 + 1] + v[ids[2] * 3 + 1]) / 3;
        const fcz = (v[ids[0] * 3 + 2] + v[ids[1] * 3 + 2] + v[ids[2] * 3 + 2]) / 3;
        const col = typeof o.color === 'function' ? o.color(fcx, fcy, fcz, t / 3, gx, gy, gz) : (o.color || [1, 1, 1]);
        const glw = typeof o.glow === 'function' ? o.glow(fcx, fcy, fcz, t / 3) : (o.glow || 0);
        const useSmooth = !flat;
        for (let k = 0; k < 3; k++) {
          const i = ids[k];
          let nx = gx, ny = gy, nz = gz;
          if (useSmooth && i < (p._limit || Infinity)) {
            M4.transformDir(mn, nrm[i * 3], nrm[i * 3 + 1], nrm[i * 3 + 2], tn);
            const l = Math.hypot(tn[0], tn[1], tn[2]) || 1;
            nx = tn[0] / l; ny = tn[1] / l; nz = tn[2] / l;
          }
          out.push(P3[k][0], P3[k][1], P3[k][2], nx, ny, nz, col[0], col[1], col[2], glw);
        }
      }
      return this;
    }
    build(name) { return new Geometry(new Float32Array(this.out), name); }
  }
  BB.GeoBuilder = GeoBuilder;
  BB.geo = function (p, o, name) { return new GeoBuilder().add(p, o).build(name); };
})(window.BB);
