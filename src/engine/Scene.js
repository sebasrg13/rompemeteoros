/* engine/Scene.js — grafo de escena (Node) y cámara en perspectiva */
(function (BB) {
  'use strict';
  const M4 = BB.M4;

  class Node {
    constructor(geo, mat) {
      this.geo = geo || null;
      this.mat = mat || null;
      this.children = [];
      this.parent = null;
      this.px = 0; this.py = 0; this.pz = 0;
      this.rx = 0; this.ry = 0; this.rz = 0;
      this.sx = 1; this.sy = 1; this.sz = 1;
      this.visible = true;
      this.local = M4.create();
      this.world = M4.create();
      this.flash = 0;          // destello blanco al recibir impacto
      this.glow = 1;           // multiplicador de emisión por vértice
      this.opacity = 1;        // multiplicador de opacidad
      this.tint = null;        // color override [r,g,b]
      this.castShadow = !!geo;
      this.renderOrder = 0;
    }
    add(c) {
      if (c.parent) c.parent.remove(c);
      c.parent = this;
      this.children.push(c);
      return c;
    }
    remove(c) {
      const i = this.children.indexOf(c);
      if (i >= 0) this.children.splice(i, 1);
      c.parent = null;
    }
    setPos(x, y, z) { this.px = x; this.py = y; this.pz = z; return this; }
    setScale(s, sy, sz) { this.sx = s; this.sy = sy === undefined ? s : sy; this.sz = sz === undefined ? s : sz; return this; }
    updateWorld(parentWorld) {
      M4.compose(this.local, this.px, this.py, this.pz, this.rx, this.ry, this.rz, this.sx, this.sy, this.sz);
      if (parentWorld) M4.multiply(this.world, parentWorld, this.local);
      else this.world.set(this.local);
      const ch = this.children;
      for (let i = 0; i < ch.length; i++) if (ch[i].visible) ch[i].updateWorld(this.world);
    }
    traverseVisible(fn) {
      if (!this.visible) return;
      fn(this);
      const ch = this.children;
      for (let i = 0; i < ch.length; i++) ch[i].traverseVisible(fn);
    }
  }
  BB.Node = Node;

  class Camera {
    constructor() {
      this.fov = 60 * Math.PI / 180;
      this.aspect = 1;
      this.near = 0.3;
      this.far = 400;
      this.eye = [0, 10, 8];
      this.target = [0, 0, -8];
      this.up = [0, 1, 0];
      this.view = M4.create();
      this.proj = M4.create();
      this.viewProj = M4.create();
      this.right = [1, 0, 0];
      this.camUp = [0, 1, 0];
      this.fwd = [0, 0, -1];
    }
    update() {
      const e = this.eye, t = this.target, u = this.up;
      M4.lookAt(this.view, e[0], e[1], e[2], t[0], t[1], t[2], u[0], u[1], u[2]);
      M4.perspective(this.proj, this.fov, this.aspect, this.near, this.far);
      M4.multiply(this.viewProj, this.proj, this.view);
      const v = this.view;
      this.right[0] = v[0]; this.right[1] = v[4]; this.right[2] = v[8];
      this.camUp[0] = v[1]; this.camUp[1] = v[5]; this.camUp[2] = v[9];
      this.fwd[0] = -v[2]; this.fwd[1] = -v[6]; this.fwd[2] = -v[10];
    }
    // Proyecta un punto del mundo a NDC [-1..1]; devuelve w (profundidad) en out[2]
    projectNDC(x, y, z, out) {
      const m = this.viewProj;
      const cx = m[0] * x + m[4] * y + m[8] * z + m[12];
      const cy = m[1] * x + m[5] * y + m[9] * z + m[13];
      const cw = m[3] * x + m[7] * y + m[11] * z + m[15];
      out[0] = cx / cw; out[1] = cy / cw; out[2] = cw;
      return out;
    }
  }
  BB.Camera = Camera;
})(window.BB);
