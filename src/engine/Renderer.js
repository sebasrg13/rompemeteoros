/* engine/Renderer.js — renderizador WebGL propio, robusto para móviles
 * - WebGL2 -> WebGL1 -> experimental-webgl
 * - Recursos con re-subida perezosa tras pérdida de contexto
 * - Programas con fallback simplificado si un shader no compila
 * - Instancing (nativo / ANGLE) con fallback por CPU
 */
(function (BB) {
  'use strict';
  const M4 = BB.M4, S = BB.Shaders;

  class Texture {
    constructor(source, opts) {
      this.source = source; // canvas
      this.opts = opts || {};
      this._gen = -1;
      this._tex = null;
      this.version = 0;
      this._ver = -1;
    }
    update() { this.version++; }
  }
  BB.Texture = Texture;

  class Renderer {
    constructor(canvas) {
      this.canvas = canvas;
      this.gl = null;
      this.gen = 0;
      this.isGL2 = false;
      this.inst = null;
      this.lost = false;
      this.programs = {};
      this.frame = 0;
      this.enabledAttribs = [];
      this.stats = { calls: 0, tris: 0 };
      this.hasStencil = false;
      this.simpleShaders = false;
      this.onLost = null;
      this.onRestored = null;
      this._tmp = new Float32Array(16);
      this._v3 = [0, 0, 0];
      this.opaqueList = [];
      this.transList = [];
      this.shadowList = [];
      this.maxTexSize = 2048;
    }

    init() {
      const c = this.canvas;
      c.addEventListener('webglcontextlost', (e) => {
        e.preventDefault();
        this.lost = true;
        if (this.onLost) this.onLost();
      }, false);
      c.addEventListener('webglcontextrestored', () => {
        try {
          this.setup();
          this.lost = false;
          if (this.onRestored) this.onRestored();
        } catch (err) { BB.reportError('restore', err); }
      }, false);
      this.createContext();
      this.setup();
    }

    createContext() {
      const tries = [
        { antialias: true, stencil: true },
        { antialias: false, stencil: true },
        { antialias: false, stencil: false },
      ];
      let gl = null;
      for (const t of tries) {
        const attrs = { alpha: false, depth: true, stencil: t.stencil, antialias: t.antialias, premultipliedAlpha: false, preserveDrawingBuffer: false, powerPreference: 'high-performance', failIfMajorPerformanceCaveat: false };
        try { gl = this.canvas.getContext('webgl2', attrs); if (gl) { this.isGL2 = true; } } catch (e) { gl = null; }
        if (!gl) {
          try { gl = this.canvas.getContext('webgl', attrs) || this.canvas.getContext('experimental-webgl', attrs); this.isGL2 = false; } catch (e) { gl = null; }
        }
        if (gl) break;
      }
      if (!gl) throw new Error('NO_WEBGL');
      this.gl = gl;
    }

    setup() {
      const gl = this.gl;
      this.gen++;
      this.enabledAttribs = [];
      const attrs = gl.getContextAttributes ? gl.getContextAttributes() : null;
      this.hasStencil = !!(attrs && attrs.stencil);
      if (this.isGL2) {
        this.inst = {
          divisor: (i, d) => gl.vertexAttribDivisor(i, d),
          draw: (mode, first, count, n) => gl.drawArraysInstanced(mode, first, count, n),
        };
      } else {
        const ext = gl.getExtension('ANGLE_instanced_arrays');
        this.inst = ext ? {
          divisor: (i, d) => ext.vertexAttribDivisorANGLE(i, d),
          draw: (mode, first, count, n) => ext.drawArraysInstancedANGLE(mode, first, count, n),
        } : null;
      }
      let hp = true;
      try {
        const f = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT);
        hp = !!(f && f.precision > 0);
      } catch (e) { hp = true; }
      this.fsPrecision = hp ? 'precision highp float;\n' : 'precision mediump float;\n';
      this.maxTexSize = gl.getParameter(gl.MAX_TEXTURE_SIZE) || 2048;

      this.programs = {};
      const P = this.programs;
      P.lit = this.makeProgramSafe('lit', S.litVS, S.litFS, '', ['aPos', 'aNormal', 'aColor']);
      P.litInst = this.inst ? this.makeProgramSafe('litInst', S.litVS, S.litFS, '#define INST\n', ['aPos', 'aNormal', 'aColor', 'aI0', 'aI1']) : null;
      P.shadow = this.makeProgramSafe('shadow', S.shadowVS, S.shadowFS, '', ['aPos']);
      P.spriteAdd = this.makeProgramSafe('spriteAdd', S.spriteVS, S.spriteFS, '#define ADD\n', ['aPos', 'aUV', 'aCol']);
      P.spriteAlpha = this.makeProgramSafe('spriteAlpha', S.spriteVS, S.spriteFS, '', ['aPos', 'aUV', 'aCol']);
      P.bg = this.makeProgramSafe('bg', S.bgVS, S.bgFS, '', ['aPos']);
      P.stars = this.makeProgramSafe('stars', S.starsVS, S.starsFS, '', ['aPos', 'aInfo']);
      P.surf = this.makeProgramSafe('surf', S.surfVS, S.surfFS, '', ['aPos', 'aUV']);
      if (!P.lit) throw new Error('SHADER_FAIL');

      // buffers compartidos
      this.fsTri = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.fsTri);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      const maxQuads = 4096;
      const idx = new Uint16Array(maxQuads * 6);
      for (let i = 0; i < maxQuads; i++) {
        idx[i * 6] = i * 4; idx[i * 6 + 1] = i * 4 + 1; idx[i * 6 + 2] = i * 4 + 2;
        idx[i * 6 + 3] = i * 4; idx[i * 6 + 4] = i * 4 + 2; idx[i * 6 + 5] = i * 4 + 3;
      }
      this.quadIdx = gl.createBuffer();
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.quadIdx);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
      this.maxQuads = maxQuads;

      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LEQUAL);
      gl.enable(gl.CULL_FACE);
      gl.cullFace(gl.BACK);
      gl.frontFace(gl.CCW);
    }

    compile(type, src) {
      const gl = this.gl;
      const sh = gl.createShader(type);
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS) && !gl.isContextLost()) {
        const log = gl.getShaderInfoLog(sh);
        gl.deleteShader(sh);
        throw new Error('Shader compile: ' + log);
      }
      return sh;
    }

    makeProgram(vs, fs, defs, attribs) {
      const gl = this.gl;
      const prog = gl.createProgram();
      const v = this.compile(gl.VERTEX_SHADER, defs + vs);
      const f = this.compile(gl.FRAGMENT_SHADER, this.fsPrecision + defs + fs);
      gl.attachShader(prog, v); gl.attachShader(prog, f);
      attribs.forEach((a, i) => gl.bindAttribLocation(prog, i, a));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS) && !gl.isContextLost()) {
        throw new Error('Link: ' + gl.getProgramInfoLog(prog));
      }
      const p = { prog, a: {}, u: {}, frame: -1, nattr: attribs.length };
      attribs.forEach((a, i) => (p.a[a] = i));
      const nu = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS) || 0;
      for (let i = 0; i < nu; i++) {
        const info = gl.getActiveUniform(prog, i);
        if (!info) continue;
        const name = info.name.replace(/\[0\]$/, '');
        p.u[name] = gl.getUniformLocation(prog, info.name);
      }
      return p;
    }

    makeProgramSafe(name, vs, fs, defs, attribs) {
      try {
        return this.makeProgram(vs, fs, defs, attribs);
      } catch (e) {
        BB.reportError('shader:' + name, e);
        try {
          this.simpleShaders = true;
          return this.makeProgram(vs, fs, defs + '#define SIMPLE\n', attribs);
        } catch (e2) {
          BB.reportError('shader-simple:' + name, e2);
          return null;
        }
      }
    }

    setSize(w, h, dpr) {
      const c = this.canvas;
      const W = Math.max(1, Math.round(w * dpr)), H = Math.max(1, Math.round(h * dpr));
      if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
      this.width = W; this.height = H;
    }

    // ---- utilidades de estado ----
    useProgram(p) {
      const gl = this.gl;
      gl.useProgram(p.prog);
      // habilitar atributos del programa
      for (let i = 0; i < 8; i++) {
        const want = i < p.nattr;
        if (want !== !!this.enabledAttribs[i]) {
          if (want) gl.enableVertexAttribArray(i); else gl.disableVertexAttribArray(i);
          this.enabledAttribs[i] = want;
        }
      }
      if (p.frame !== this.frame) {
        p.frame = this.frame;
        this.setFrameUniforms(p);
      }
    }

    setFrameUniforms(p) {
      const gl = this.gl, u = p.u, env = this.env, cam = this.cam;
      if (u.uViewProj) gl.uniformMatrix4fv(u.uViewProj, false, cam.viewProj);
      if (u.uCamPos) gl.uniform3fv(u.uCamPos, cam.eye);
      if (u.uLightDir) gl.uniform3fv(u.uLightDir, env.lightDir);
      if (u.uLightColor) gl.uniform3fv(u.uLightColor, env.lightColor);
      if (u.uAmbSky) gl.uniform3fv(u.uAmbSky, env.ambSky);
      if (u.uAmbGround) gl.uniform3fv(u.uAmbGround, env.ambGround);
      if (u.uFogColor) gl.uniform3fv(u.uFogColor, env.fogColor);
      if (u.uFog) gl.uniform2fv(u.uFog, env.fog);
      if (u.uPL) gl.uniform4fv(u.uPL, env.pl);
      if (u.uPLC) gl.uniform3fv(u.uPLC, env.plc);
      if (u.uTime) gl.uniform1f(u.uTime, env.time);
    }

    uploadGeo(g) {
      const gl = this.gl;
      if (g._gen !== this.gen || !g._vbo) {
        g._vbo = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, g._vbo);
        gl.bufferData(gl.ARRAY_BUFFER, g.data, g.dynamic ? gl.DYNAMIC_DRAW : gl.STATIC_DRAW);
        g._gen = this.gen;
        g._dirty = false;
      } else {
        gl.bindBuffer(gl.ARRAY_BUFFER, g._vbo);
        if (g._dirty) { gl.bufferData(gl.ARRAY_BUFFER, g.data, gl.DYNAMIC_DRAW); g._dirty = false; }
      }
    }

    bindTexture(t, unit) {
      const gl = this.gl;
      gl.activeTexture(gl.TEXTURE0 + (unit || 0));
      if (t._gen !== this.gen || !t._tex) {
        t._tex = gl.createTexture();
        t._gen = this.gen;
        t._ver = -1;
      }
      gl.bindTexture(gl.TEXTURE_2D, t._tex);
      if (t._ver !== t.version) {
        t._ver = t.version;
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, t.source);
        const pot = (n) => (n & (n - 1)) === 0;
        const isPot = pot(t.source.width) && pot(t.source.height);
        const wrap = t.opts.repeat && isPot ? gl.REPEAT : gl.CLAMP_TO_EDGE;
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
        if (isPot && t.opts.mip !== false) {
          gl.generateMipmap(gl.TEXTURE_2D);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        } else {
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        }
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      }
    }

    setBlend(mode) {
      const gl = this.gl;
      if (mode === this._blend) return;
      this._blend = mode;
      if (!mode) { gl.disable(gl.BLEND); return; }
      gl.enable(gl.BLEND);
      if (mode === 2) gl.blendFunc(gl.ONE, gl.ONE);
      else gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    }

    bindLitAttribs(p) {
      const gl = this.gl, st = 40;
      gl.vertexAttribPointer(0, 3, gl.FLOAT, false, st, 0);
      gl.vertexAttribPointer(1, 3, gl.FLOAT, false, st, 12);
      gl.vertexAttribPointer(2, 4, gl.FLOAT, false, st, 24);
    }

    setMaterial(p, mat, node) {
      const gl = this.gl, u = p.u;
      const c = (node && node.tint) || mat.color;
      gl.uniform3fv(u.uColor, c);
      gl.uniform3fv(u.uEmissive, mat.emissive);
      gl.uniform2f(u.uSpec, mat.spec, mat.shin);
      gl.uniform4fv(u.uRim, mat.rim);
      gl.uniform1f(u.uOpacity, mat.opacity * (node ? node.opacity : 1));
      gl.uniform1f(u.uFlash, node ? Math.min(node.flash, 1) : 0);
      gl.uniform1f(u.uGlow, mat.glow * (node ? node.glow : 1));
    }

    // ---- recolección y dibujo de la escena ----
    collect(root) {
      const op = this.opaqueList, tr = this.transList, sh = this.shadowList, cam = this.cam, v = this._v3;
      op.length = 0; tr.length = 0; sh.length = 0;
      const f = cam.proj[5];
      const visit = (n) => {
        if (!n.visible) return;
        if (n.boundR) {
          const w = n.world;
          cam.projectNDC(w[12], w[13], w[14], v);
          const m = (n.boundR * f * 1.6) / Math.max(v[2], 0.1);
          if (v[2] < -n.boundR || v[0] < -1 - m || v[0] > 1 + m || v[1] < -1 - m || v[1] > 1 + m) return;
        }
        if (n.geo && n.mat && n.opacity > 0.003) {
          if (n.mat.blend || n.opacity < 1) {
            const w = n.world, e = cam.eye;
            n._depth = (w[12] - e[0]) * cam.fwd[0] + (w[13] - e[1]) * cam.fwd[1] + (w[14] - e[2]) * cam.fwd[2];
            tr.push(n);
          } else op.push(n);
          if (n.castShadow) sh.push(n);
        }
        const ch = n.children;
        for (let i = 0; i < ch.length; i++) visit(ch[i]);
      };
      visit(root);
      tr.sort((a, b) => (a.renderOrder - b.renderOrder) || (b._depth - a._depth));
    }

    drawNodeList(list, transparent) {
      if (!list.length) return;
      const gl = this.gl, p = this.programs.lit;
      this.useProgram(p);
      let lastGeo = null, lastMat = null;
      for (let i = 0; i < list.length; i++) {
        const n = list[i], g = n.geo, m = n.mat;
        if (transparent) {
          this.setBlend(m.blend || 1);
          gl.depthMask(!!m.depthWrite);
        }
        if (m.doubleSided) gl.disable(gl.CULL_FACE); else gl.enable(gl.CULL_FACE);
        if (g !== lastGeo) { this.uploadGeo(g); this.bindLitAttribs(p); lastGeo = g; }
        gl.uniformMatrix4fv(p.u.uModel, false, n.world);
        this.setMaterial(p, m, n);
        lastMat = m;
        gl.drawArrays(gl.TRIANGLES, 0, g.count);
        this.stats.calls++;
        this.stats.tris += g.count / 3;
      }
      gl.enable(gl.CULL_FACE);
      gl.depthMask(true);
    }

    drawShadows(list, shadowMat, color) {
      if (!list.length || !this.programs.shadow) return;
      const gl = this.gl, p = this.programs.shadow;
      this.useProgram(p);
      gl.uniformMatrix4fv(p.u.uShadow, false, shadowMat);
      gl.uniform4fv(p.u.uShadowColor, color);
      this.setBlend(1);
      gl.depthMask(false);
      gl.disable(gl.CULL_FACE);
      if (this.hasStencil) {
        gl.enable(gl.STENCIL_TEST);
        gl.stencilFunc(gl.EQUAL, 0, 0xff);
        gl.stencilOp(gl.KEEP, gl.KEEP, gl.INCR);
      }
      let last = null;
      for (let i = 0; i < list.length; i++) {
        const n = list[i];
        if (n.geo !== last) { this.uploadGeo(n.geo); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 40, 0); last = n.geo; }
        gl.uniformMatrix4fv(p.u.uModel, false, n.world);
        gl.drawArrays(gl.TRIANGLES, 0, n.geo.count);
        this.stats.calls++;
      }
      if (this.hasStencil) gl.disable(gl.STENCIL_TEST);
      gl.enable(gl.CULL_FACE);
      gl.depthMask(true);
    }

    drawInst(batch, model) {
      if (!batch.count) return;
      const gl = this.gl, m = batch.mat;
      const blend = m.blend || 0;
      this.setBlend(blend);
      gl.depthMask(!blend);
      if (this.inst && this.programs.litInst) {
        const p = this.programs.litInst;
        this.useProgram(p);
        this.uploadGeo(batch.geo);
        this.bindLitAttribs(p);
        if (batch._gen !== this.gen || !batch._buf) { batch._buf = gl.createBuffer(); batch._gen = this.gen; }
        gl.bindBuffer(gl.ARRAY_BUFFER, batch._buf);
        gl.bufferData(gl.ARRAY_BUFFER, batch.data.subarray(0, batch.count * 8), gl.DYNAMIC_DRAW);
        gl.vertexAttribPointer(3, 4, gl.FLOAT, false, 32, 0);
        gl.vertexAttribPointer(4, 4, gl.FLOAT, false, 32, 16);
        this.inst.divisor(3, 1); this.inst.divisor(4, 1);
        gl.uniformMatrix4fv(p.u.uModel, false, model);
        this.setMaterial(p, m, null);
        this.inst.draw(gl.TRIANGLES, 0, batch.geo.count, batch.count);
        this.inst.divisor(3, 0); this.inst.divisor(4, 0);
        this.stats.calls++;
      } else {
        // Fallback CPU: una llamada por instancia
        const p = this.programs.lit;
        this.useProgram(p);
        this.uploadGeo(batch.geo);
        this.bindLitAttribs(p);
        this.setMaterial(p, m, null);
        const d = batch.data, tmp = this._tmp, loc = this._loc || (this._loc = new Float32Array(16));
        for (let i = 0; i < batch.count; i++) {
          const o = i * 8;
          M4.compose(loc, d[o], d[o + 1], d[o + 2], 0, 0, d[o + 4], d[o + 3], d[o + 3] * d[o + 5], d[o + 3]);
          M4.multiply(tmp, model, loc);
          gl.uniformMatrix4fv(p.u.uModel, false, tmp);
          gl.drawArrays(gl.TRIANGLES, 0, batch.geo.count);
        }
        this.stats.calls += batch.count;
      }
      gl.depthMask(true);
    }

    drawSprites(batch) {
      if (!batch.count) return;
      const gl = this.gl;
      const p = batch.additive ? this.programs.spriteAdd : this.programs.spriteAlpha;
      if (!p) return;
      this.useProgram(p);
      this.setBlend(batch.additive ? 2 : 1);
      gl.depthMask(false);
      if (batch.depthTest) gl.enable(gl.DEPTH_TEST); else gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.CULL_FACE);
      this.bindTexture(batch.tex, 0);
      gl.uniform1i(p.u.uTex, 0);
      if (batch._gen !== this.gen || !batch._buf) { batch._buf = gl.createBuffer(); batch._gen = this.gen; }
      gl.bindBuffer(gl.ARRAY_BUFFER, batch._buf);
      const n = Math.min(batch.count, this.maxQuads);
      gl.bufferData(gl.ARRAY_BUFFER, batch.data.subarray(0, n * 36), gl.DYNAMIC_DRAW);
      gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 36, 0);
      gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 36, 12);
      gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 36, 20);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.quadIdx);
      gl.drawElements(gl.TRIANGLES, n * 6, gl.UNSIGNED_SHORT, 0);
      this.stats.calls++;
      gl.enable(gl.DEPTH_TEST);
      gl.enable(gl.CULL_FACE);
      gl.depthMask(true);
    }

    drawBackground(bg) {
      const p = this.programs.bg;
      if (!p || !bg.tex) return;
      const gl = this.gl;
      this.useProgram(p);
      this.setBlend(0);
      gl.disable(gl.DEPTH_TEST);
      gl.depthMask(false);
      this.bindTexture(bg.tex, 0);
      gl.uniform1i(p.u.uTex, 0);
      // cubrir sin deformar (cover)
      const texA = bg.tex.source.width / bg.tex.source.height;
      const scrA = this.width / this.height;
      let sx = 1, sy = 1;
      if (scrA > texA) sy = texA / scrA; else sx = scrA / texA;
      gl.uniform2f(p.u.uUVScale, sx * 0.94, sy * 0.94);
      gl.uniform2f(p.u.uOffset, bg.ox || 0, bg.oy || 0);
      gl.uniform3fv(p.u.uTint, bg.tint);
      gl.uniform1f(p.u.uPulse, bg.pulse || 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.fsTri);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      this.stats.calls++;
      gl.enable(gl.DEPTH_TEST);
      gl.depthMask(true);
    }

    drawStars(st) {
      const p = this.programs.stars;
      if (!p || !st.count) return;
      const gl = this.gl;
      this.useProgram(p);
      this.setBlend(2);
      gl.disable(gl.DEPTH_TEST);
      gl.depthMask(false);
      this.uploadGeo(st);
      gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 20, 0);
      gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 20, 12);
      gl.uniform1f(p.u.uPx, this.height * 0.9);
      gl.uniform1f(p.u.uWarp, st.warp || 0);
      gl.uniform1f(p.u.uTime, this.env.time);
      gl.drawArrays(gl.POINTS, 0, st.drawCount || st.count);
      this.stats.calls++;
      gl.enable(gl.DEPTH_TEST);
      gl.depthMask(true);
    }

    drawSurface(s, model) {
      const p = this.programs.surf;
      if (!p) return;
      const gl = this.gl;
      this.useProgram(p);
      this.setBlend(1);
      gl.depthMask(true);
      gl.disable(gl.CULL_FACE);
      this.uploadGeo(s.geo);
      gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 20, 0);
      gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 20, 12);
      this.bindTexture(s.tex, 0);
      gl.uniform1i(p.u.uTex, 0);
      gl.uniformMatrix4fv(p.u.uModel, false, model);
      gl.uniform3fv(p.u.uTint, s.tint);
      gl.uniform1f(p.u.uScroll, s.scroll || 0);
      if (s.hex && p.u.uTex2) { this.bindTexture(s.hex, 1); gl.uniform1i(p.u.uTex2, 1); gl.activeTexture(gl.TEXTURE0); }
      if (p.u.uMove) gl.uniform4f(p.u.uMove, s.pos || 0, s.halfW || 4.6, s.kx || 1, s.ky || 1);
      gl.drawArrays(gl.TRIANGLES, 0, s.geo.count);
      this.stats.calls++;
      gl.enable(gl.CULL_FACE);
    }

    // Render principal. hooks: {bg, stars, surface, surfaceModel, shadowMat, shadowColor, inst:[{batch, model}], spritesAdd, spritesAlpha, spritesOverlay}
    render(root, cam, env, hooks) {
      if (this.lost || !this.gl) return false;
      const gl = this.gl;
      if (gl.isContextLost && gl.isContextLost()) return false;
      this.frame++;
      this.cam = cam; this.env = env;
      this.stats.calls = 0; this.stats.tris = 0;
      this._blend = -1;
      gl.viewport(0, 0, this.width, this.height);
      gl.clearColor(env.clear[0], env.clear[1], env.clear[2], 1);
      gl.depthMask(true);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT | (this.hasStencil ? gl.STENCIL_BUFFER_BIT : 0));

      if (hooks.bg) this.drawBackground(hooks.bg);
      if (hooks.stars) this.drawStars(hooks.stars);
      if (hooks.decor) { this.collect(hooks.decor); this.setBlend(0); this.drawNodeList(this.opaqueList, false); if (this.transList.length) this.drawNodeList(this.transList, true); }
      if (hooks.surface) this.drawSurface(hooks.surface, hooks.surfaceModel);

      this.collect(root);
      if (hooks.shadowMat && this.shadowList.length) this.drawShadows(this.shadowList, hooks.shadowMat, hooks.shadowColor);
      this.setBlend(0);
      this.drawNodeList(this.opaqueList, false);
      if (hooks.inst) for (const it of hooks.inst) if (it.batch.count && !it.batch.mat.blend) this.drawInst(it.batch, it.model);
      if (this.transList.length) this.drawNodeList(this.transList, true);
      if (hooks.inst) for (const it of hooks.inst) if (it.batch.count && it.batch.mat.blend) this.drawInst(it.batch, it.model);
      if (hooks.spritesAlpha) this.drawSprites(hooks.spritesAlpha);
      if (hooks.spritesAdd) this.drawSprites(hooks.spritesAdd);
      if (hooks.spritesOverlay) this.drawSprites(hooks.spritesOverlay);
      this.setBlend(0);
      return true;
    }

    // Comprueba un píxel (detección de pantalla negra)
    samplePixel(x, y) {
      const gl = this.gl, px = new Uint8Array(4);
      gl.readPixels(x | 0, y | 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      return px;
    }
  }
  BB.Renderer = Renderer;

  // ---- Lote instanciado ----
  class InstBatch {
    constructor(geo, mat, cap) {
      this.geo = geo; this.mat = mat; this.cap = cap;
      this.data = new Float32Array(cap * 8);
      this.count = 0;
    }
    reset() { this.count = 0; }
    // x,y,z,scale, angle, stretch, alpha, spin
    push(x, y, z, s, ang, stretch, alpha, spin) {
      if (this.count >= this.cap) return;
      const o = this.count * 8, d = this.data;
      d[o] = x; d[o + 1] = y; d[o + 2] = z; d[o + 3] = s;
      d[o + 4] = ang; d[o + 5] = stretch; d[o + 6] = alpha; d[o + 7] = spin || 0;
      this.count++;
    }
  }
  BB.InstBatch = InstBatch;

  // ---- Lote de sprites (billboards y quads orientados) ----
  class SpriteBatch {
    constructor(tex, cap, additive, depthTest) {
      this.tex = tex; this.cap = cap; this.additive = additive; this.depthTest = depthTest !== false;
      this.data = new Float32Array(cap * 36);
      this.count = 0;
      this.cam = null;
    }
    reset(cam) { this.count = 0; this.cam = cam; }
    // centro c, ejes a (mitad ancho) y b (mitad alto)
    quad(cx, cy, cz, ax, ay, az, bx, by, bz, uv, r, g, b, a) {
      if (this.count >= this.cap) return;
      const d = this.data;
      let o = this.count * 36;
      const u0 = uv[0], v0 = uv[1], u1 = uv[2], v1 = uv[3];
      // v0: -a -b
      d[o++] = cx - ax - bx; d[o++] = cy - ay - by; d[o++] = cz - az - bz; d[o++] = u0; d[o++] = v1; d[o++] = r; d[o++] = g; d[o++] = b; d[o++] = a;
      d[o++] = cx + ax - bx; d[o++] = cy + ay - by; d[o++] = cz + az - bz; d[o++] = u1; d[o++] = v1; d[o++] = r; d[o++] = g; d[o++] = b; d[o++] = a;
      d[o++] = cx + ax + bx; d[o++] = cy + ay + by; d[o++] = cz + az + bz; d[o++] = u1; d[o++] = v0; d[o++] = r; d[o++] = g; d[o++] = b; d[o++] = a;
      d[o++] = cx - ax + bx; d[o++] = cy - ay + by; d[o++] = cz - az + bz; d[o++] = u0; d[o++] = v0; d[o++] = r; d[o++] = g; d[o++] = b; d[o++] = a;
      this.count++;
    }
    // cuadrilátero libre: 4 puntos en mundo (abajo-izq, abajo-der, arriba-der, arriba-izq) y rectángulo UV
    quad4(P, i0, i1, i2, i3, u0, v0, u1, v1, r, g, b, a) {
      if (this.count >= this.cap) return;
      const d = this.data;
      let o = this.count * 36;
      d[o++] = P[i0]; d[o++] = P[i0 + 1]; d[o++] = P[i0 + 2]; d[o++] = u0; d[o++] = v1; d[o++] = r; d[o++] = g; d[o++] = b; d[o++] = a;
      d[o++] = P[i1]; d[o++] = P[i1 + 1]; d[o++] = P[i1 + 2]; d[o++] = u1; d[o++] = v1; d[o++] = r; d[o++] = g; d[o++] = b; d[o++] = a;
      d[o++] = P[i2]; d[o++] = P[i2 + 1]; d[o++] = P[i2 + 2]; d[o++] = u1; d[o++] = v0; d[o++] = r; d[o++] = g; d[o++] = b; d[o++] = a;
      d[o++] = P[i3]; d[o++] = P[i3 + 1]; d[o++] = P[i3 + 2]; d[o++] = u0; d[o++] = v0; d[o++] = r; d[o++] = g; d[o++] = b; d[o++] = a;
      this.count++;
    }
    // billboard orientado a cámara (posición en mundo)
    bill(x, y, z, w, h, rot, uv, r, g, b, a) {
      const R = this.cam.right, U = this.cam.camUp;
      let c = 1, s = 0;
      if (rot) { c = Math.cos(rot); s = Math.sin(rot); }
      const rx = R[0] * c + U[0] * s, ry = R[1] * c + U[1] * s, rz = R[2] * c + U[2] * s;
      const ux = -R[0] * s + U[0] * c, uy = -R[1] * s + U[1] * c, uz = -R[2] * s + U[2] * c;
      this.quad(x, y, z, rx * w, ry * w, rz * w, ux * h, uy * h, uz * h, uv, r, g, b, a);
    }
    // segmento de a->b con ancho w (rayos, estelas)
    beam(x0, y0, z0, x1, y1, z1, w, uv, r, g, b, a) {
      const F = this.cam.fwd;
      const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0;
      let px = dy * F[2] - dz * F[1], py = dz * F[0] - dx * F[2], pz = dx * F[1] - dy * F[0];
      const l = Math.hypot(px, py, pz) || 1;
      px = (px / l) * w; py = (py / l) * w; pz = (pz / l) * w;
      // eje "a" = perpendicular (ancho, u), eje "b" = a lo largo (v)
      this.quad((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, px, py, pz, dx / 2, dy / 2, dz / 2, uv, r, g, b, a);
    }
  }
  BB.SpriteBatch = SpriteBatch;
})(window.BB);
