/* engine/math.js — matrices 4x4 (column-major, compatibles con WebGL) */
(function (BB) {
  'use strict';
  const T = new Float32Array(16);

  const M4 = {
    create() {
      const m = new Float32Array(16);
      m[0] = m[5] = m[10] = m[15] = 1;
      return m;
    },
    identity(m) {
      m.fill(0);
      m[0] = m[5] = m[10] = m[15] = 1;
      return m;
    },
    copy(o, a) { o.set(a); return o; },
    // out = a * b
    multiply(out, a, b) {
      for (let i = 0; i < 4; i++) {
        const b0 = b[i * 4], b1 = b[i * 4 + 1], b2 = b[i * 4 + 2], b3 = b[i * 4 + 3];
        T[i * 4] = a[0] * b0 + a[4] * b1 + a[8] * b2 + a[12] * b3;
        T[i * 4 + 1] = a[1] * b0 + a[5] * b1 + a[9] * b2 + a[13] * b3;
        T[i * 4 + 2] = a[2] * b0 + a[6] * b1 + a[10] * b2 + a[14] * b3;
        T[i * 4 + 3] = a[3] * b0 + a[7] * b1 + a[11] * b2 + a[15] * b3;
      }
      out.set(T);
      return out;
    },
    perspective(out, fovy, aspect, near, far) {
      const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
      out.fill(0);
      out[0] = f / aspect;
      out[5] = f;
      out[10] = (far + near) * nf;
      out[11] = -1;
      out[14] = 2 * far * near * nf;
      return out;
    },
    lookAt(out, ex, ey, ez, tx, ty, tz, ux, uy, uz) {
      let zx = ex - tx, zy = ey - ty, zz = ez - tz;
      let l = Math.hypot(zx, zy, zz) || 1;
      zx /= l; zy /= l; zz /= l;
      let xx = uy * zz - uz * zy, xy = uz * zx - ux * zz, xz = ux * zy - uy * zx;
      l = Math.hypot(xx, xy, xz) || 1;
      xx /= l; xy /= l; xz /= l;
      const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
      out[0] = xx; out[1] = yx; out[2] = zx; out[3] = 0;
      out[4] = xy; out[5] = yy; out[6] = zy; out[7] = 0;
      out[8] = xz; out[9] = yz; out[10] = zz; out[11] = 0;
      out[12] = -(xx * ex + xy * ey + xz * ez);
      out[13] = -(yx * ex + yy * ey + yz * ez);
      out[14] = -(zx * ex + zy * ey + zz * ez);
      out[15] = 1;
      return out;
    },
    // Traslación + rotación euler (orden XYZ) + escala
    compose(out, px, py, pz, rx, ry, rz, sx, sy, sz) {
      const a = Math.cos(rx), b = Math.sin(rx), c = Math.cos(ry), d = Math.sin(ry), e = Math.cos(rz), f = Math.sin(rz);
      const ae = a * e, af = a * f, be = b * e, bf = b * f;
      out[0] = c * e * sx; out[1] = (af + be * d) * sx; out[2] = (bf - ae * d) * sx; out[3] = 0;
      out[4] = -c * f * sy; out[5] = (ae - bf * d) * sy; out[6] = (be + af * d) * sy; out[7] = 0;
      out[8] = d * sz; out[9] = -b * c * sz; out[10] = a * c * sz; out[11] = 0;
      out[12] = px; out[13] = py; out[14] = pz; out[15] = 1;
      return out;
    },
    transformPoint(m, x, y, z, out) {
      out[0] = m[0] * x + m[4] * y + m[8] * z + m[12];
      out[1] = m[1] * x + m[5] * y + m[9] * z + m[13];
      out[2] = m[2] * x + m[6] * y + m[10] * z + m[14];
      return out;
    },
    transformDir(m, x, y, z, out) {
      out[0] = m[0] * x + m[4] * y + m[8] * z;
      out[1] = m[1] * x + m[5] * y + m[9] * z;
      out[2] = m[2] * x + m[6] * y + m[10] * z;
      return out;
    },
    // Matriz de proyección de sombra planar: plano (a,b,c,d), luz direccional L (hacia la luz)
    shadow(out, a, b, c, d, lx, ly, lz) {
      const dot = a * lx + b * ly + c * lz;
      const P = [a, b, c, d], L = [lx, ly, lz, 0];
      for (let col = 0; col < 4; col++) {
        for (let row = 0; row < 4; row++) {
          out[col * 4 + row] = (row === col ? dot : 0) - L[row] * P[col];
        }
      }
      return out;
    },
  };
  BB.M4 = M4;

  // Rotación euler XYZ de un punto (para hornear geometrías)
  BB.rotXYZ = function (x, y, z, rx, ry, rz) {
    const m = M4.compose(new Float32Array(16), 0, 0, 0, rx, ry, rz, 1, 1, 1);
    return [m[0] * x + m[4] * y + m[8] * z, m[1] * x + m[5] * y + m[9] * z, m[2] * x + m[6] * y + m[10] * z];
  };
})(window.BB);
