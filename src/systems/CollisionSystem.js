/* systems/CollisionSystem.js — colisiones círculo-círculo en el plano de la arena */
(function (BB) {
  'use strict';

  class CollisionSystem {
    constructor(game) {
      this.game = game;
      this.targets = [];
      this.hitSfxT = 0;
    }

    buildTargets() {
      const g = this.game, T = this.targets, top = BB.ARENA.top + 1;
      T.length = 0;
      g.meteors.forEachAlive((m) => { if (m.y < top) T.push(m); });
      g.aliens.forEachAlive((a) => { if (a.y < top) T.push(a); });
      if (g.boss && g.boss.alive && !g.boss.intro && g.boss.dying <= 0) for (const h of g.boss.hits) T.push(h);
      for (const b of g.bullets.eb) if (b.alive && b.hp > 0) T.push(b);
      if (g.state === 'PVP' && g.pvp.rivalTarget && g.pvp.rivalTarget.alive && g.pvp.phase === 'match') T.push(g.pvp.rivalTarget);
      return T;
    }

    step(dt) {
      const g = this.game;
      this.hitSfxT -= dt;
      const T = this.buildTargets(), bs = g.bullets;
      // balas del jugador
      for (const b of bs.pb) {
        if (!b.alive) continue;
        for (let i = 0; i < T.length; i++) {
          const t = T[i];
          if (t === b.last || !isAlive(t)) continue;
          const dx = t.x - b.x, dy = t.y - b.y, rr = t.r + b.r;
          if (dx * dx + dy * dy < rr * rr) {
            g.damageTarget(t, b.dmg, 'bullet');
            this.impact(b.x, b.y, b.z, g.bullets.ptype ? g.bullets.ptype.color : [0.4, 0.9, 1]);
            if (b.pierce > 0) { b.pierce--; b.last = t; } else { b.alive = false; }
            break;
          }
        }
      }
      // balas rebotadoras de las mini naves
      for (const b of bs.mb) {
        if (!b.alive) continue;
        for (let i = 0; i < T.length; i++) {
          const t = T[i];
          if (t === b.last || !isAlive(t)) continue;
          const dx = t.x - b.x, dy = t.y - b.y, rr = t.r + b.r;
          if (dx * dx + dy * dy < rr * rr) {
            g.damageTarget(t, b.dmg, 'mini');
            this.impact(b.x, b.y, b.z, [0.4, 1, 0.6]);
            if (b.bounces > 0) {
              b.bounces--;
              b.last = t;
              const nt = g.nearestTarget(b.x, b.y, 12, t, false);
              const sp = Math.hypot(b.vx, b.vy) || 20;
              if (nt) {
                const ex = nt.x - b.x, ey = nt.y - b.y, l = Math.hypot(ex, ey) || 1;
                b.vx = (ex / l) * sp; b.vy = (ey / l) * sp;
              } else {
                // reflejo sobre la normal de impacto
                const l = Math.hypot(dx, dy) || 1, nx = -dx / l, ny = -dy / l;
                const d = b.vx * nx + b.vy * ny;
                b.vx -= 2 * d * nx; b.vy -= 2 * d * ny;
              }
              g.fx.emit(b.x, b.y, b.z, 0, 0, 0, 0.15, 0.3, 0.8, [0.5, 1, 0.7], 1, 2, true, 0, 0);
            } else b.alive = false;
            break;
          }
        }
      }
      // daños al jugador
      const p = g.player;
      if (!p || g.playerDead) return;
      const duel = g.state === 'PVP';
      for (const b of bs.eb) {
        if (!b.alive) continue;
        if (b.pvp) {
          // las balas del rival chocan con los meteoritos (cobertura)
          let blocked = false;
          g.meteors.forEachAlive((m) => {
            if (blocked) return;
            const mx = m.x - b.x, my = m.y - b.y, mr = m.r + b.r;
            if (mx * mx + my * my < mr * mr) { blocked = true; if (m.damage(b.dmg)) m.kill(); this.impact(b.x, b.y, b.z, b.col); }
          });
          if (blocked) { b.alive = false; continue; }
        }
        const dx = p.x - b.x, dy = p.y - b.y, rr = b.r + p.r * 0.75;
        if (dx * dx + dy * dy < rr * rr) {
          b.alive = false;
          g.fx.burst(b.x, b.y, b.z, b.col, duel ? 3 : 8, 4, 0.35, 0.35);
          if (duel) g.pvp.damageMe(b.dmg || 5); else g.hitPlayer('bullet');
        }
      }
      g.meteors.forEachAlive((m) => {
        const dx = p.x - m.x, dy = p.y - m.y, rr = m.r * 0.88 + p.r * 0.8;
        if (dx * dx + dy * dy < rr * rr) g.hitPlayer('meteor', m);
      });
      g.aliens.forEachAlive((a) => {
        const dx = p.x - a.x, dy = p.y - a.y, rr = a.r * 0.8 + p.r * 0.8;
        if (dx * dx + dy * dy < rr * rr) g.hitPlayer('alien', a);
      });
    }

    impact(x, y, z, col) {
      const g = this.game;
      g.fx.emit(x, y, z, 0, -1, 0, 0.1, 0.45, 0.9, col, 1, 3, true, 0, 0);
      if (Math.random() < 0.5) g.fx.sparks(x, y, z, col, 2, 5);
      if (this.hitSfxT <= 0) { this.hitSfxT = 0.05; g.audio.sfx('hit'); }
    }
  }

  function isAlive(t) { return t.owner ? t.owner.alive && t.owner.dying <= 0 : t.alive; }
  BB.CollisionSystem = CollisionSystem;
})(window.BB);
