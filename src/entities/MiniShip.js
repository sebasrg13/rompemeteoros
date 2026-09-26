/* entities/MiniShip.js — boost MINI SQUAD: mini naves 3D que orbitan al jugador y disparan balas rebotadoras */
(function (BB) {
  'use strict';
  const U = BB.U;

  class MiniSquad {
    constructor(game, root) {
      this.game = game;
      this.ships = [];
      this.mat = BB.mat({ spec: 1, shin: 40, rim: [0.4, 1, 0.7, 0.7], glow: 1.4 });
      for (let i = 0; i < 5; i++) {
        const n = new BB.Node(BB.Models.geo.mini, this.mat);
        n.visible = false;
        root.add(n);
        this.ships.push({ node: n, fireT: i * 0.07, x: 0, y: 0, z: 0 });
      }
      this.count = 0; this.time = 0; this.max = 1; this.t = 0; this.active = false;
    }

    activate(count, duration) {
      this.count = U.clamp(count, 1, 5);
      this.time = this.max = duration;
      if (!this.active) this.t = 0;
      this.active = true;
      const p = this.game.player;
      for (let i = 0; i < 5; i++) {
        const s = this.ships[i];
        s.node.visible = i < this.count;
        if (i < this.count && p) { s.x = p.x; s.y = p.y; s.z = 0.5; }
      }
    }

    stop() {
      this.active = false; this.time = 0;
      for (const s of this.ships) s.node.visible = false;
    }

    update(dt) {
      if (!this.active) return;
      const g = this.game, p = g.player;
      this.time -= dt; this.t += dt;
      if (this.time <= 0) {
        for (let i = 0; i < this.count; i++) { const s = this.ships[i]; g.fx.burst(s.x, s.y, s.z, [0.4, 1, 0.7], 6, 3, 0.3, 0.4); }
        this.stop();
        return;
      }
      const st = g.stats;
      const appear = Math.min(1, this.t * 3);
      const blinkOff = this.time < 1.5 && Math.floor(this.time * 10) % 2 === 0;
      for (let i = 0; i < this.count; i++) {
        const s = this.ships[i], n = s.node;
        const a = this.t * 2.3 + (i / this.count) * Math.PI * 2;
        const tx = p.x + Math.cos(a) * 1.7, ty = p.y + 0.4 + Math.sin(a) * 1.0, tz = 1.25 + Math.sin(a * 2 + i) * 0.35 + Math.sin(a) * 0.35;
        s.x = U.damp(s.x, tx, 12, dt); s.y = U.damp(s.y, ty, 12, dt); s.z = U.damp(s.z, tz, 12, dt);
        n.px = s.x; n.py = s.y; n.pz = s.z;
        n.ry = -Math.cos(a) * 0.6; // alabeo al orbitar
        n.setScale(0.55 * appear);
        n.visible = !blinkOff;
        // estela
        if (Math.random() < 0.5) g.fx.emit(s.x, s.y - 0.3, s.z, 0, -2, 0, 0.25, 0.22, 0.02, [0.4, 1, 0.7], 0.8, 0, true, 0, 0);
        s.fireT -= dt;
        if (s.fireT <= 0) {
          s.fireT = 0.34;
          const tgt = g.nearestTarget(s.x, s.y + 2, 18, null, true);
          let vx = 0, vy = 22;
          if (tgt) {
            const dx = tgt.x - s.x, dy = tgt.y - s.y, l = Math.hypot(dx, dy) || 1;
            if (dy > -0.5) { vx = (dx / l) * 22; vy = (dy / l) * 22; }
          }
          g.bullets.fireMini(s.x, s.y + 0.4, s.z, vx, vy, st.dmg * 0.65, st.squadBounces);
          g.audio.sfx('mini');
        }
      }
    }
  }
  BB.MiniSquad = MiniSquad;
})(window.BB);
