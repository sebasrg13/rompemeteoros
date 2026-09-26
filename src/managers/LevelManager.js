/* managers/LevelManager.js — campaña, parámetros por nivel y sistema de spawn controlado */
(function (BB) {
  'use strict';
  const U = BB.U;

  const TITLES = {
    1: 'TUTORIAL', 2: 'LLUVIA DE ROCAS', 3: 'METEORITOS ESPECIALES', 4: 'PRIMER CONTACTO',
    6: 'TORMENTA ELÉCTRICA', 7: 'FUEGO ENEMIGO', 8: 'GIGANTES', 9: 'BLINDADOS',
    11: 'CAMPO DE CRISTAL', 12: 'GRAVEDAD ALTA', 13: 'REACCIÓN EN CADENA', 14: 'ENJAMBRE',
    16: 'NÚCLEO INESTABLE', 17: 'INVASIÓN', 18: 'COLOSOS', 19: 'CAOS TOTAL',
    21: 'ECO DE CRISTAL', 22: 'LLUVIA ÍGNEA', 23: 'FLOTA ALIENÍGENA', 24: 'ANTESALA REAL',
  };
  // Mecánicas que se introducen progresivamente
  const INTRO = {
    3: [['armored', 'METEORITO BLINDADO: resiste el daño'], ['crystal', 'METEORITO DE CRISTAL: se parte en 3']],
    4: [['explosive', 'METEORITO EXPLOSIVO: daña a los cercanos'], ['a_normal', 'ALIENS: disparan y se mueven']],
    6: [['electric', 'METEORITO ELÉCTRICO: descarga en cadena'], ['a_fast', 'ALIEN RÁPIDO: se lanza en picada']],
    7: [['a_shooter', 'ALIEN SHOOTER: ráfagas apuntadas']],
    8: [['giant', 'METEORITO GIGANTE: se divide en 3']],
    9: [['a_tank', 'ALIEN TANQUE: blindado y lento']],
  };
  const AVAIL_M = { normal: 1, armored: 3, crystal: 3, explosive: 4, electric: 6, giant: 8 };
  const AVAIL_A = { normal: 4, fast: 6, shooter: 7, tank: 9 };
  const TIER_HP = [0, 5, 11, 22, 46];

  class LevelManager {
    constructor(game) {
      this.game = game;
      this.num = 1;
      this.cfg = null;
      this.queue = [];
    }

    static isBoss(L) { return L % 5 === 0; }
    static bossIndex(L) { return (Math.floor(L / 5) - 1) % 5; }
    static title(L) {
      if (L % 5 === 0) return 'BOSS · ' + BB.BOSS_DEFS[LevelManager.bossIndex(L)].name;
      const base = ((L - 1) % 25) + 1;
      return TITLES[L] || TITLES[base] || 'SECTOR ' + L;
    }
    static hpScale(L) { const n = L - 1; return 1 + 0.24 * n + 0.011 * n * n; }

    build(L) {
      const hs = LevelManager.hpScale(L);
      const cfg = {
        num: L, boss: LevelManager.isBoss(L), hpScale: hs,
        speedScale: 1 + Math.min(0.5, 0.022 * (L - 1)),
        gravity: 7.2 * (1 + Math.min(0.35, 0.015 * (L - 1))),
        bounceK: 1, interval: Math.max(1.0, 3.0 - L * 0.08), maxMass: Math.min(13, 5 + L * 0.3),
        maxAliens: Math.min(4, 1 + Math.floor(L / 6)),
        title: LevelManager.title(L), intro: INTRO[L] || null,
        levelHp: TIER_HP[2] * hs,
      };
      const q = [];
      if (cfg.boss) { this.cfg = cfg; this.queue = q; return cfg; }
      const mt = Object.keys(AVAIL_M).filter((k) => AVAIL_M[k] <= L && k !== 'giant');
      const at = Object.keys(AVAIL_A).filter((k) => AVAIL_A[k] <= L);
      const base = ((L - 1) % 25) + 1;
      let bias = null, alienK = 1, giants = L >= 8 ? 1 + Math.floor((L - 8) / 5) : 0;
      switch (base) {
        case 11: case 21: bias = 'crystal'; break;
        case 12: cfg.gravity *= 1.3; cfg.bounceK = 0.85; break;
        case 13: case 22: bias = 'explosive'; break;
        case 14: case 23: alienK = 1.8; cfg.maxAliens += 1; break;
        case 16: bias = 'electric'; break;
        case 17: alienK = 2.2; cfg.maxAliens += 2; break;
        case 18: giants += 2; break;
        case 9: bias = 'armored'; break;
        case 19: case 24: alienK = 1.5; giants += 1; cfg.maxMass += 2; break;
      }
      if (L === 1) {
        [[2, 'normal'], [2, 'normal'], [1, 'normal'], [2, 'normal'], [3, 'normal']].forEach((e) => q.push({ k: 'm', tier: e[0], type: e[1] }));
        cfg.interval = 3.2; cfg.maxMass = 4;
      } else if (L === 2) {
        [3, 2, 2, 3, 1, 2, 3].forEach((t) => q.push({ k: 'm', tier: t, type: 'normal' }));
      } else {
        const n = Math.min(22, Math.round(5 + L * 0.85));
        const p3 = Math.min(0.5, 0.18 + L * 0.018);
        for (let i = 0; i < n; i++) {
          let type;
          if (bias && Math.random() < 0.45) type = bias;
          else {
            const w = mt.map((k) => (k === 'normal' ? 4 : 2));
            let r = Math.random() * w.reduce((a, b) => a + b, 0);
            type = mt[mt.length - 1];
            for (let j = 0; j < mt.length; j++) { r -= w[j]; if (r <= 0) { type = mt[j]; break; } }
          }
          const rr = Math.random();
          const tier = rr < p3 ? 3 : rr < p3 + 0.45 ? 2 : 1;
          q.push({ k: 'm', tier, type });
        }
        // garantizar que las mecánicas nuevas aparezcan
        if (cfg.intro) cfg.intro.forEach((it, idx) => { if (!it[0].startsWith('a_')) q.splice(1 + idx * 2, 0, { k: 'm', tier: 2, type: it[0] === 'giant' ? 'normal' : it[0] }); });
        for (let i = 0; i < giants; i++) q.splice(Math.floor(q.length * (0.4 + 0.5 * Math.random())), 0, { k: 'm', tier: 4, type: 'giant' });
        const na = at.length ? Math.min(9, Math.round((1 + (L - 4) * 0.35) * alienK)) : 0;
        for (let i = 0; i < na; i++) {
          let type = U.pick(at);
          if (cfg.intro && i < cfg.intro.length && cfg.intro[i][0].startsWith('a_')) type = cfg.intro[i][0].slice(2);
          q.splice(Math.floor(q.length * (0.25 + 0.7 * ((i + 1) / (na + 1)))), 0, { k: 'a', type });
        }
      }
      this.cfg = cfg;
      this.queue = q;
      return cfg;
    }

    start(L) {
      this.num = L;
      const cfg = this.build(L);
      this.timer = 1.4;
      this.total = this.queue.reduce((s, e) => s + weight(e), 0) || 1;
      this.progressMax = 0;
      this.introShown = 0;
      this.done = false;
      return cfg;
    }

    aliveMass() {
      let m = 0;
      this.game.meteors.forEachAlive((o) => { m += o.tier; });
      return m;
    }

    update(dt) {
      const g = this.game, cfg = this.cfg;
      if (!cfg || cfg.boss || this.done) return;
      this.timer -= dt;
      const mass = this.aliveMass();
      const aliens = g.aliens.countAlive();
      if (mass === 0 && aliens === 0 && this.timer > 0.5) this.timer = 0.5;
      if (this.timer <= 0 && this.queue.length) {
        const e = this.queue[0];
        const fits = e.k === 'm' ? mass + e.tier <= cfg.maxMass || mass === 0 : aliens < cfg.maxAliens;
        if (fits) {
          this.queue.shift();
          this.spawnEntry(e);
          this.timer = cfg.interval * U.rand(0.75, 1.2);
        } else this.timer = 0.35;
      }
      if (!this.queue.length && g.meteors.countAlive() === 0 && g.aliens.countAlive() === 0) {
        this.done = true;
        g.onWaveCleared();
      }
    }

    spawnEntry(e) {
      const g = this.game, cfg = this.cfg, A = BB.ARENA;
      if (e.k === 'm') {
        const hp = TIER_HP[e.tier] * cfg.hpScale * (e.type === 'armored' ? 1.25 : e.type === 'crystal' ? 0.85 : 1);
        const x = U.rand(-A.halfW + 1.5, A.halfW - 1.5);
        g.spawnMeteor({
          type: e.type, tier: e.tier, x, y: A.spawnY + (e.tier >= 4 ? 2 : 0), vx: (x > 0 ? -1 : 1) * U.rand(1.0, 2.2) * cfg.speedScale,
          vy: -2.5, hp, g: cfg.gravity, bounceK: cfg.bounceK,
        });
      } else {
        g.spawnAlien(e.type, U.rand(-3, 3), {});
      }
    }

    progress() {
      const g = this.game;
      if (!this.cfg || this.cfg.boss) return 0;
      let rem = this.queue.reduce((s, e) => s + weight(e), 0);
      g.meteors.forEachAlive((m) => { rem += Math.pow(2, m.tier) - 1; });
      g.aliens.forEachAlive(() => { rem += 3; });
      const p = U.clamp(1 - rem / this.total, 0, 1);
      this.progressMax = Math.max(this.progressMax, p);
      return this.progressMax;
    }
  }

  function weight(e) { return e.k === 'm' ? Math.pow(2, e.tier) - 1 : 3; }
  LevelManager.weight = weight;
  BB.LevelManager = LevelManager;
})(window.BB);
