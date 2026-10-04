/* managers/CupManager.js — COPA SEMANAL
 * Modo competitivo separado de la campaña:
 *  - Nave de copa propia: las mejoras de campaña NO cuentan acá. Solo se mejora con MONEDAS LUNARES (ML),
 *    que se obtienen únicamente comprando con dinero real (1 USD = 300 ML).
 *  - Oleadas infinitas y cada vez más duras, generadas con la semilla de la semana (mismas oleadas para todos).
 *  - Ranking semanal (db del artifact) con premios para 1.º, 2.º y 3.º. Cierra el lunes 00:00 (hora Argentina).
 *  - Mientras CUP.live sea false, los pagos son de PRUEBA (no se cobra nada) y los premios no están activos.
 */
(function (BB) {
  'use strict';
  const U = BB.U;
  const $ = (id) => document.getElementById(id);

  const CUP = BB.CUP = {
    live: false,                 // true solo con servidor de pagos + ranking validado
    tzOffsetH: -3,               // la semana corre en hora de Argentina (UTC−3)
    prizes: [40, 25, 10],        // USD
    usdToML: 300,
    startLevel: 3,               // el nivel 1 de copa equivale al nivel 3 de campaña
    hpK: 1.2,                    // la copa es más dura que la campaña
    levelSec: 6,                 // cada nivel dura 6 s: al llegar a 6 arranca el siguiente, más difícil
    triesPerDay: 3,
    bossEvery: 5,                // cada 5 niveles aparece un BOSS (el contador se frena hasta vencerlo)              // 3 partidas por día; cuenta SIEMPRE la última
    packs: [
      { id: 'p1', usd: 1, ml: 300 },
      { id: 'p3', usd: 3, ml: 950, bonus: '+5%' },
      { id: 'p5', usd: 5, ml: 1650, bonus: '+10%' },
      { id: 'p10', usd: 10, ml: 3500, bonus: '+17%', hot: true },
      { id: 'p20', usd: 20, ml: 7500, bonus: '+25%' },
    ],
  };

  const costCurve = (base, k) => (l) => Math.round(base * Math.pow(k, l) / 10) * 10;
  // mejoras de la nave de copa (solo ML)
  const UPGRADES = CUP.upgrades = [
    { key: 'power', name: 'Potencia', desc: '+15% de daño por nivel.', max: 10, cost: (l) => [120, 160, 220, 300, 400, 540, 730, 980, 1330, 1790][l], ic: '⚔' },
    { key: 'rate', name: 'Cadencia', desc: '+7% de disparos por segundo por nivel.', max: 10, cost: (l) => [140, 200, 270, 380, 540, 750, 1050, 1470, 2060, 2890][l], ic: '»' },
    { key: 'shield', name: 'Escudo extra', desc: '+1 escudo al empezar la copa.', max: 2, cost: (l) => [600, 1500][l], ic: '+' },
    { key: 'armor', name: 'Blindaje reactivo', desc: '+0,35 s de invulnerabilidad tras un impacto.', max: 3, cost: costCurve(250, 1.8), ic: '◆' },
    { key: 'squad', name: 'Escuadrón inicial', desc: 'Arrancás la copa con MINI SQUAD (6 s por nivel).', max: 3, cost: (l) => [300, 600, 1100][l], ic: '▲' },
  ];

  // modificador de la semana (misma semilla para todos)
  const MODS = [
    { id: 'rain', name: 'LLUVIA DENSA', desc: 'Más meteoritos a la vez.', apply: (c) => { c.maxMass += 3; c.interval *= 0.85; } },
    { id: 'invasion', name: 'INVASIÓN', desc: 'Más aliens en cada oleada.', apply: (c) => { c.maxAliens += 2; } },
    { id: 'gravity', name: 'GRAVEDAD ALTA', desc: 'Los meteoritos caen más rápido.', apply: (c) => { c.gravity *= 1.25; c.speedScale *= 1.1; } },
    { id: 'armor', name: 'ROCAS BLINDADAS', desc: '+15% de vida en todos los meteoritos.', apply: (c) => { c.hpScale *= 1.15; c.levelHp *= 1.15; } },
  ];

  function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

  class CupManager {
    constructor(game) {
      this.game = game;
      this.db = null; this.user = null; this.uid = null;
      this.board = []; this.names = {}; this.lastWinners = [];
      this.online = 'connecting';
      this.tab = 'rank';
      this.unsub = null;
      this.active = false;
    }
    get data() {
      const d = this.game.save.data;
      if (!d.cup || typeof d.cup !== 'object') d.cup = {};
      const c = d.cup;
      if (typeof c.ml !== 'number') c.ml = 0;
      if (!c.up || typeof c.up !== 'object') c.up = {};
      if (!c.best || typeof c.best !== 'object') c.best = {};
      if (!Array.isArray(c.purchases)) c.purchases = [];
      if (!c.last || typeof c.last !== 'object') c.last = {};   // semana -> {score, level, t}
      if (!c.days || typeof c.days !== 'object') c.days = {};   // día -> partidas usadas
      return c;
    }

    // ---------- semana ----------
    weekInfo(now) {
      const t = (now || Date.now()) + CUP.tzOffsetH * 3600000;       // "hora local" de la copa en UTC
      const d = new Date(t);
      const dow = (d.getUTCDay() + 6) % 7;                              // lunes = 0
      const start = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - dow * 86400000;
      const end = start + 7 * 86400000;
      const sd = new Date(start);
      const id = sd.getUTCFullYear() + '-' + String(sd.getUTCMonth() + 1).padStart(2, '0') + '-' + String(sd.getUTCDate()).padStart(2, '0'); // lunes de inicio
      return { id, start: start - CUP.tzOffsetH * 3600000, end: end - CUP.tzOffsetH * 3600000 };
    }
    dayId() { const d = new Date(Date.now() + CUP.tzOffsetH * 3600000); return d.toISOString().slice(0, 10); }
    triesLeft() { return Math.max(0, CUP.triesPerDay - (this.data.days[this.dayId()] || 0)); }
    myLast() { return this.data.last[this.weekInfo().id] || null; }
    msToMidnight() { const t = Date.now() + CUP.tzOffsetH * 3600000; return 86400000 - (t % 86400000); }
    prevWeekId() { return this.weekInfo(Date.now() - 7 * 86400000).id; }
    seed() { return hashStr('bb3d-cup-' + this.weekInfo().id); }
    mod() { return MODS[this.seed() % MODS.length]; }

    // ---------- nave de copa ----------
    stats() {
      const up = this.data.up, base = this.game.shop.computeStats();
      return Object.assign({}, base, {
        dmg: 1 * (1 + 0.15 * (up.power || 0)),
        rate: 8.5 * (1 + 0.07 * (up.rate || 0)),
        maxShields: 3 + (up.shield || 0),
        invuln: 1.6 + 0.35 * (up.armor || 0),
        shieldBonus: 0, squadCount: 3, squadDur: 6 * (up.squad || 0), squadBounces: 2,
        bullet: 'plasma', cannon: 'blaster', skin: base.skin,   // la skin es solo estética
      });
    }
    upState(u) {
      const lvl = this.data.up[u.key] || 0, maxed = lvl >= u.max, price = maxed ? 0 : u.cost(lvl);
      return { level: lvl, max: u.max, maxed, price, affordable: this.data.ml >= price };
    }
    buyUpgrade(key) {
      const u = UPGRADES.find((x) => x.key === key); if (!u) return false;
      const st = this.upState(u);
      if (st.maxed) return false;
      if (!st.affordable) { this.tab = 'ml'; this.render(); this.game.ui.cupNote('Te faltan ' + U.fmt(st.price - this.data.ml) + ' ML. Comprá Monedas Lunares.', 'bad'); this.game.audio.sfx('error'); return false; }
      this.data.ml -= st.price;
      this.data.up[key] = st.level + 1;
      this.game.save.save(true);
      this.game.audio.sfx('buy');
      this.game.vibrate(20);
      this.render();
      return true;
    }

    // ---------- pagos (proveedor intercambiable) ----------
    // En producción: reemplazar por Mercado Pago / Stripe (web) o la compra de la tienda (Play / App Store).
    // El servidor confirma el pago y recién ahí acredita las ML.
    buyPack(id) {
      const p = CUP.packs.find((x) => x.id === id); if (!p) return;
      const m = $('cup-modal');
      $('cup-modal-body').innerHTML = '<h3>' + U.fmt(p.ml) + ' MONEDAS LUNARES</h3><div class="price">USD ' + p.usd + '</div>' +
        (CUP.live ? '<p>Serás redirigido al pago seguro.</p>' : '<p class="test"><b>MODO PRUEBA.</b> No se cobra dinero real: las monedas se acreditan para probar las mejoras. Los pagos reales se activan cuando el juego esté publicado con su servidor.</p>');
      $('cup-confirm').textContent = CUP.live ? 'PAGAR' : 'ACREDITAR (PRUEBA)';
      $('cup-cancel').textContent = 'CANCELAR';
      this.confirmMode = 'pack';
      m.hidden = false;
      this.pendingPack = p;
    }
    confirmPack() {
      const p = this.pendingPack; this.pendingPack = null;
      if (!p) return;
      if (CUP.live) { this.game.ui.cupNote('Pagos reales todavía no conectados.', 'bad'); return; }
      const c = this.data;
      c.ml += p.ml;
      c.purchases.push({ id: p.id, usd: p.usd, ml: p.ml, t: Date.now(), test: true });
      this.game.save.save(true);
      this.game.audio.sfx('coin');
      this.game.ui.cupNote('+' + U.fmt(p.ml) + ' ML acreditadas (prueba)', 'gold');
      this.render();
    }

    // ---------- ranking online (db del artifact) ----------
    async init() {
      const C = window.claude;
      if (!C || typeof C.use !== 'function') { this.online = 'offline'; return; }
      try {
        const [db, user] = await Promise.all([C.use('db'), C.use('user')]);
        this.user = user || null;
        if (user) { try { this.uid = await user.id(); } catch (e) { this.uid = null; } }
        if (!db) { this.online = 'offline'; this.render(); return; }
        this.db = db;
        this.online = 'online';
        this.subscribe();
        this.loadLastWinners();
      } catch (e) { BB.reportError('cup-init', e); this.online = 'offline'; }
    }
    coll(week) { return this.db.collection('cup/' + week + '/scores'); }
    subscribe() {
      if (!this.db) return;
      const wk = this.weekInfo().id;
      if (this.subWeek === wk && this.unsub) return;
      if (this.unsub) { try { this.unsub(); } catch (e) { /* */ } }
      this.subWeek = wk;
      this.unsub = this.coll(wk).orderBy('score', 'desc').limit(50).onSnapshot((snap) => {
        this.board = snap.docs.map((d) => Object.assign({ id: d.id }, d.data() || {})).filter((r) => typeof r.score === 'number');
        this.resolveNames(this.board.map((r) => r.id));
        this.render();
      }, (err) => { this.online = 'offline'; BB.reportError('cup-db', new Error(err && err.code)); this.render(); });
    }
    async loadLastWinners() {
      try {
        const snap = await this.coll(this.prevWeekId()).orderBy('score', 'desc').limit(3).get();
        this.lastWinners = snap.docs.map((d) => Object.assign({ id: d.id }, d.data() || {}));
        this.resolveNames(this.lastWinners.map((r) => r.id));
        this.render();
      } catch (e) { /* sin historial */ }
    }
    async resolveNames(ids) {
      if (!this.user || !this.user.profiles || !ids.length) return;
      try {
        const ps = await this.user.profiles(ids);
        for (const id of ids) if (ps[id]) this.names[id] = ps[id].name || '';
        this.render();
      } catch (e) { /* sin nombres */ }
    }
    nameOf(id) { return (id === this.uid ? 'VOS' : this.names[id]) || 'Piloto ' + String(id).slice(-4).toUpperCase(); }
    // cuenta SIEMPRE la última partida: se sobrescribe aunque sea menor
    async submit(score, level, final) {
      const c = this.data, wk = this.weekInfo().id;
      c.last[wk] = { score, level, t: Date.now(), final: !!final };
      if (final) c.best[wk] = Math.max(c.best[wk] || 0, score);
      this.game.save.save(true);
      if (!this.db || !this.uid) return;
      const up = c.up;
      try {
        await this.coll(wk).doc(this.uid).set({ score, level, final: !!final, t: Date.now(), ship: [up.power || 0, up.rate || 0, up.shield || 0, up.armor || 0, up.squad || 0], v: 2 });
      } catch (e) { BB.reportError('cup-submit', e); }
    }
    myRank() {
      const i = this.board.findIndex((r) => r.id === this.uid);
      return i >= 0 ? i + 1 : 0;
    }

    // ---------- partida ----------
    requestStart() {
      const g = this.game;
      if (this.triesLeft() <= 0) { this.open(); g.ui.cupNote('Ya usaste tus ' + CUP.triesPerDay + ' partidas de hoy. Vuelven en ' + this.fmtDur(this.msToMidnight()) + '.', 'bad'); g.audio.sfx('deny'); return; }
      const last = this.myLast();
      if (last && last.score > 0) {
        if ($('s-cup').hidden) this.open();
        this.confirmMode = 'play';
        $('cup-modal-body').innerHTML = '<h3>¿JUGAR DE NUEVO?</h3><div class="price">' + U.fmt(last.score) + '</div>' +
          '<p>Ese es tu puntaje actual en el ranking. <b>Si jugás, se reemplaza por el de la nueva partida, aunque sea menor.</b></p><p class="test">Te quedan ' + this.triesLeft() + ' de ' + CUP.triesPerDay + ' partidas hoy.</p>';
        $('cup-confirm').textContent = 'JUGAR Y ARRIESGAR';
        $('cup-cancel').textContent = 'ATERRIZAR';
        $('cup-modal').hidden = false;
        return;
      }
      this.start();
    }
    start() {
      const g = this.game;
      if (this.triesLeft() <= 0) { this.requestStart(); return; }
      const c = this.data;
      c.days[this.dayId()] = (c.days[this.dayId()] || 0) + 1;   // la partida se descuenta al empezar
      this.submit(0, 1, false);                                   // si se cierra el juego a mitad, queda 0
      this.active = true;
      this.stage = 1;
      this.stageT = 0; this.lastSec = 0;
      g.cupMode = true;
      g.inCampaign = false;
      g.score = 0; g.runCoins = 0;
      g.boosts.inventory = [];
      g.arsenal.resetRun();
      g.premium.resetRun();
      g.save.data.stats.cupRuns = (g.save.data.stats.cupRuns || 0) + 1;
      if (g.state !== BB.STATES.MENU && g.state !== BB.STATES.GAME_OVER) g.toMenu();
      this.bossStage = false;
      g.startLevel(this.normalLevel(1), { cup: true });
      g.level.timer = 0.4;
      this.hudStage();
    }
    isBossStage(stage) { return stage % CUP.bossEvery === 0; }
    // niveles normales: se toman de la campaña salteando los de boss
    normalLevel(stage) { return this.levelFor(stage - Math.floor(stage / CUP.bossEvery)); }
    // boss N.º k de la partida = boss del nivel 5·k de campaña (después del 25 vuelven más fuertes)
    bossLevel(stage) { return 5 * Math.round(stage / CUP.bossEvery); }
    levelFor(stage) { let L = CUP.startLevel, n = 1; for (;;) { if (L % 5 !== 0) { if (n === stage) return L; n++; } L++; } }
    tweakCfg(cfg) {
      cfg.hpScale *= CUP.hpK; cfg.levelHp *= CUP.hpK;
      cfg.intro = null;
      cfg.interval = Math.min(cfg.interval, Math.max(0.55, 1.4 - (this.stage || 1) * 0.04));
      this.mod().apply(cfg);
      cfg.title = 'NIVEL ' + (this.stage || 1) + ' · ' + this.mod().name;
    }
    update(dt) {
      const g = this.game;
      if (!this.active || !g.cupMode || g.state !== BB.STATES.PLAYING || g.playerDead) return;
      this.stageT += dt;
      const sec = Math.min(CUP.levelSec, 1 + Math.floor(this.stageT));
      if (sec !== this.lastSec) { this.lastSec = sec; this.hudStage(); if (this.stageT > 0.05) g.audio.sfx('click'); }
      else this.hudBar();
      if (this.stageT >= CUP.levelSec) this.nextStage();
    }
    // arranca el nivel siguiente sin limpiar la pantalla: más vida, más velocidad, más enemigos
    nextStage() {
      const g = this.game;
      if (!this.active) return;
      const fromBoss = this.bossStage;
      const bonus = fromBoss ? 2500 + this.stage * 150 : 150 + this.stage * 60;
      g.score += bonus;
      this.stage++;
      this.stageT = 0; this.lastSec = 0;
      if (this.isBossStage(this.stage)) { this.startBoss(bonus); return; }
      this.bossStage = false;
      if (fromBoss) {
        g.setState(BB.STATES.PLAYING);
        g.world.camMode = 'game'; g.warpTarget = 0;
        g.audio.playMusic('game');
        if (g.shields < g.stats.maxShields) { g.shields++; g.after(0.4, () => g.ui.toast('+1 ESCUDO POR VENCER AL BOSS', '#5cff9d')); }
      }
      const L = this.normalLevel(this.stage);
      const rnd = Math.random;
      Math.random = U.seeded(this.seed() + L * 7919);
      let cfg;
      try { cfg = g.level.start(L); } finally { Math.random = rnd; }
      this.tweakCfg(cfg);
      g.levelHp = cfg.levelHp;
      g.level.timer = 0.2;
      g.levelEnding = false;
      g.ui.toast('NIVEL ' + this.stage + ' · +' + U.fmt(bonus), '#ffc83d');
      g.audio.sfx('levelUp');
      g.world.addShake(0.25);
      this.hudStage();
    }
    // BOSS: se limpia la pantalla, el contador se frena y hay que vencerlo para seguir
    startBoss(bonus) {
      const g = this.game;
      this.bossStage = true;
      g.meteors.forEachAlive((m) => { m.noSplit = true; m.kill(); });
      g.aliens.forEachAlive((a) => a.kill());
      for (const e of g.bullets.eb) if (e.alive) e.alive = false;
      g.gravityWells.length = 0; g.playerPull = 0;
      g.level.start(this.bossLevel(this.stage));   // cfg de boss (sin cola de meteoritos)
      g.levelEnding = false;
      g.ui.toast('NIVEL ' + this.stage + ' · +' + U.fmt(bonus), '#ffc83d');
      g.setState(BB.STATES.BOSS_INTRO);
      g.audio.playMusic('boss');
      g.after(0.8, () => { if (this.active && this.bossStage && g.state === BB.STATES.BOSS_INTRO) g.spawnBoss(); });
      this.hudStage();
    }
    hudBar() { const b = $('ch-bar'); if (b) b.style.width = Math.min(100, ((this.stageT || 0) / CUP.levelSec) * 100) + '%'; }
    hudStage() {
      const el = $('cup-hud'); if (!el) return;
      el.hidden = !this.active;
      if (!this.active) return;
      $('ch-lvl').textContent = 'NIVEL ' + this.stage;
      el.classList.toggle('boss', !!this.bossStage);
      if (this.bossStage) { $('ch-n').textContent = 'BOSS'; $('ch-bar').style.width = '100%'; el.classList.remove('hot'); return; }
      const sec = Math.min(CUP.levelSec, 1 + Math.floor(this.stageT || 0));
      $('ch-n').textContent = sec;
      this.hudBar();
      el.classList.toggle('hot', sec >= CUP.levelSec - 1);
      const n = $('ch-n'); n.classList.remove('pop'); void n.offsetWidth; n.classList.add('pop');
    }
    onWaveCleared() { this.nextStage(); }   // si limpiaste antes de los 6 s, pasás directo
    async end(reason) {
      const g = this.game;
      if (!this.active) return null;
      this.active = false; this.bossStage = false;
      this.hudStage();
      g.cupMode = false;
      const score = g.score, level = this.stage;
      const d = g.save.data;
      d.stats.cupBest = Math.max(d.stats.cupBest || 0, score);
      await this.submit(score, level, true);
      g.onLoadoutChanged();
      return { score, level, reason };
    }
    fmtDur(ms) { const h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60; return h + 'h ' + String(m).padStart(2, '0') + 'm'; }

    // ---------- UI ----------
    initUI() {
      const g = this.game;
      const on = (id, fn) => { const el = $(id); if (el) el.addEventListener('click', (e) => { e.preventDefault(); g.audio.unlock(); g.audio.sfx('click'); fn(e); }); };
      on('btn-cup', () => this.open());
      on('cup-back', () => g.ui.showMenu());
      on('cup-play', () => this.requestStart());
      on('cup-cancel', () => { $('cup-modal').hidden = true; this.pendingPack = null; this.confirmMode = null; });
      on('cup-confirm', () => { const m = this.confirmMode; this.confirmMode = null; $('cup-modal').hidden = true; if (m === 'play') this.start(); else this.confirmPack(); });
      on('cr-retry', () => this.requestStart());
      on('cr-rank', () => { this.tab = 'rank'; this.open(); });
      on('cr-menu', () => g.toMenu());
      on('cr-up', () => { this.tab = 'up'; this.open(); });
      $('cup-tabs').addEventListener('click', (e) => { const b = e.target.closest('button[data-tab]'); if (!b) return; g.audio.sfx('click'); this.tab = b.dataset.tab; this.render(); });
      $('cup-body').addEventListener('click', (e) => {
        const u = e.target.closest('button[data-up]'); if (u) { this.buyUpgrade(u.dataset.up); return; }
        const p = e.target.closest('button[data-pack]'); if (p) { g.audio.sfx('click'); this.buyPack(p.dataset.pack); }
      });
      setInterval(() => { if (!$('s-cup').hidden) { this.subscribe(); this.renderHead(); } }, 1000);
    }
    open() {
      const g = this.game;
      if (g.state !== BB.STATES.MENU) g.toMenu();
      this.subscribe();
      g.ui.show('s-cup');
      this.render();
    }
    countdown() {
      const ms = Math.max(0, this.weekInfo().end - Date.now());
      const d = Math.floor(ms / 86400000), h = Math.floor(ms / 3600000) % 24, m = Math.floor(ms / 60000) % 60, s = Math.floor(ms / 1000) % 60;
      return d > 0 ? d + 'd ' + h + 'h ' + m + 'm' : h + 'h ' + String(m).padStart(2, '0') + 'm ' + String(s).padStart(2, '0') + 's';
    }
    renderHead() {
      $('cup-close').textContent = this.countdown();
      $('cup-ml').textContent = U.fmt(this.data.ml);
    }
    render() {
      if (!$('s-cup') || $('s-cup').hidden) return;
      this.renderHead();
      const wk = this.weekInfo(), mod = this.mod(), c = this.data;
      const sd = new Date(wk.start), ed = new Date(wk.end - 1), f = (x) => x.getDate() + '/' + (x.getMonth() + 1);
      $('cup-week').textContent = 'SEMANA ' + f(sd) + ' – ' + f(ed);
      $('cup-mod').innerHTML = '<b>' + mod.name + '</b> · ' + mod.desc;
      $('cup-test').hidden = CUP.live;
      for (const b of $('cup-tabs').children) b.classList.toggle('on', b.dataset.tab === this.tab);
      const last = this.myLast(), rank = this.myRank(), tl = this.triesLeft();
      $('cup-me').innerHTML = '<div><small>TU PUNTAJE</small><b>' + (last ? U.fmt(last.score) : '—') + '</b></div><div><small>PUESTO</small><b>' + (rank ? '#' + rank : '—') + '</b></div><div><small>PARTIDAS HOY</small><b>' + tl + '/' + CUP.triesPerDay + '</b></div>';
      const pb = $('cup-play');
      pb.innerHTML = tl > 0 ? (last && last.score > 0 ? 'JUGAR DE NUEVO' : 'JUGAR COPA') + '<small>' + tl + ' DE ' + CUP.triesPerDay + ' PARTIDAS HOY · CUENTA LA ÚLTIMA</small>' : 'SIN PARTIDAS HOY<small>VUELVEN EN ' + this.fmtDur(this.msToMidnight()) + '</small>';
      pb.classList.toggle('off', tl <= 0);
      let h = '';
      if (this.tab === 'rank') h = this.rankHTML();
      else if (this.tab === 'up') h = this.upHTML();
      else if (this.tab === 'ml') h = this.mlHTML();
      else h = this.rulesHTML();
      $('cup-body').innerHTML = h;
    }
    power() { const up = this.data.up; let n = 0; for (const u of UPGRADES) n += up[u.key] || 0; return 'NV ' + n; }
    rankHTML() {
      const medal = ['g', 's', 'b'];
      let h = '<div class="podium">' + CUP.prizes.map((p, i) => {
        const r = this.board[i];
        return '<div class="pd ' + medal[i] + '"><small>' + (i + 1) + '.º PUESTO</small><b>USD ' + p + '</b><span>' + (r ? this.esc(this.nameOf(r.id)) + ' · ' + U.fmt(r.score) : 'libre') + '</span></div>';
      }).join('') + '</div>';
      if (this.online !== 'online') h += '<p class="empty">Ranking online no disponible en esta vista. Tu mejor puntaje se guarda en este dispositivo.</p>';
      else if (!this.board.length) h += '<p class="empty">Todavía nadie jugó esta semana. ¡El primer puesto está libre!</p>';
      else {
        h += '<div class="rank">' + this.board.slice(0, 50).map((r, i) => '<div class="rr' + (r.id === this.uid ? ' me' : '') + (i < 3 ? ' top' : '') + '"><i>' + (i + 1) + '</i><span>' + this.esc(this.nameOf(r.id)) + '</span><em>NV ' + (r.level || 1) + (r.final === false ? ' · JUGANDO' : '') + '</em><b>' + U.fmt(r.score) + '</b></div>').join('') + '</div>';
      }
      if (this.lastWinners.length) h += '<div class="sect"><h3>GANADORES DE LA SEMANA PASADA</h3>' + this.lastWinners.map((r, i) => '<div class="rr"><i>' + (i + 1) + '</i><span>' + this.esc(this.nameOf(r.id)) + '</span><b>' + U.fmt(r.score) + '</b></div>').join('') + '</div>';
      return h;
    }
    upHTML() {
      let h = '<p class="cupinfo">La nave de copa es distinta a la de campaña: todos arrancan igual y solo se mejora con <b>Monedas Lunares</b>.</p><div class="items">';
      h += UPGRADES.map((u) => {
        const st = this.upState(u);
        const pips = '<div class="pips">' + Array.from({ length: st.max }, (_, i) => '<i class="' + (i < st.level ? 'on' : '') + '"></i>').join('') + '</div>';
        const btn = st.maxed ? '<button class="buy done">MÁX</button>' : '<button class="buy ml' + (st.affordable ? '' : ' no') + '" data-up="' + u.key + '"><svg viewBox="0 0 24 24"><use href="#i-moon"/></svg>' + U.fmt(st.price) + '</button>';
        return '<div class="item"><div class="sw mlsw">' + u.ic + '</div><div class="inf"><div class="nm">' + u.name + '</div><div class="ds">' + u.desc + '</div>' + pips + '</div>' + btn + '</div>';
      }).join('');
      return h + '</div>';
    }
    mlHTML() {
      let h = '<p class="cupinfo"><b>1 USD = 300 ML.</b> Las Monedas Lunares solo sirven para mejorar la nave de copa. Las monedas de campaña no se pueden usar acá.</p><div class="packs">';
      h += CUP.packs.map((p) => '<button class="pack' + (p.hot ? ' hot' : '') + '" data-pack="' + p.id + '">' + (p.hot ? '<em>MÁS ELEGIDO</em>' : '') + '<svg viewBox="0 0 24 24"><use href="#i-moon"/></svg><b>' + U.fmt(p.ml) + '</b><small>ML' + (p.bonus ? ' · ' + p.bonus : '') + '</small><span>USD ' + p.usd + '</span></button>').join('');
      return h + '</div>' + (CUP.live ? '' : '<p class="empty">Modo prueba: no se cobra dinero real.</p>');
    }
    rulesHTML() {
      return '<div class="sect rules"><h3>BASES DE LA COPA SEMANAL</h3><ol>' +
        '<li>La copa va de lunes 00:00 a domingo 23:59 (hora de Argentina, UTC−3).</li>' +
        '<li>Cada nivel dura ' + CUP.levelSec + ' segundos: al llegar a ' + CUP.levelSec + ' arranca el siguiente, más difícil. Sumás puntos por destruir enemigos, monedas y cada nivel superado.</li>' +
        '<li>Cada ' + CUP.bossEvery + ' niveles aparece un <b>BOSS</b>: el contador se frena hasta que lo destruyas. Vencerlo da muchos puntos y +1 escudo.</li>' +
        '<li>Tenés ' + CUP.triesPerDay + ' partidas por día (se renuevan a las 00:00). <b>En el ranking queda el puntaje de tu ÚLTIMA partida</b>, aunque sea menor que el anterior. Pensá bien si volvés a jugar o aterrizás con ese puntaje.</li>' +
        '<li>La partida se descuenta al empezar. Si salís a mitad, cuenta lo que hiciste hasta ahí; si se cierra el juego, queda en 0.</li>' +
        '<li>Todos juegan los mismos niveles y el mismo modificador semanal.</li>' +
        '<li>Premios: 1.º USD ' + CUP.prizes[0] + ', 2.º USD ' + CUP.prizes[1] + ', 3.º USD ' + CUP.prizes[2] + '. Solo cobran los tres primeros.</li>' +
        '<li>Para cobrar: ser mayor de 18 años, una sola cuenta por persona y verificar identidad.</li>' +
        '<li>Antes de pagar se revisa la partida de los tres primeros. Trampas o puntajes imposibles = descalificación.</li>' +
        '<li>Los premios se pagan dentro de las 72 h hábiles posteriores al cierre.</li>' +
        '</ol>' + (CUP.live ? '' : '<p class="empty">Temporada de prueba: los premios todavía no están activos.</p>') + '</div>';
    }
    esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

    showResult(r) {
      const g = this.game, tl = this.triesLeft();
      $('cr-rows').innerHTML =
        '<div class="row"><span>PUNTAJE</span><b>' + U.fmt(r.score) + '</b></div>' +
        '<div class="row"><span>NIVEL ALCANZADO</span><b>' + r.level + '</b></div>' +
        '<div class="row gold"><span>PARTIDAS QUE TE QUEDAN HOY</span><b>' + tl + '</b></div>';
      $('cr-note').innerHTML = 'Este puntaje ya quedó en el ranking. ' + (tl > 0 ? 'Si volvés a jugar, <b>se reemplaza por el nuevo aunque sea menor</b>. ¿Aterrizás o seguís?' : 'No te quedan partidas hoy: este es tu puntaje hasta mañana.');
      const rb = $('cr-retry');
      rb.textContent = tl > 0 ? 'ARRIESGAR (' + tl + ' HOY)' : 'SIN PARTIDAS HOY';
      rb.classList.toggle('off', tl <= 0);
      const setRank = () => { const rk = this.myRank(); $('cr-rank-txt').textContent = rk ? 'PUESTO #' + rk + (rk <= 3 ? ' · ¡EN ZONA DE PREMIO!' : '') : (this.online === 'online' ? 'Calculando puesto…' : 'Ranking online no disponible'); };
      setRank();
      g.ui.show('s-cupres');
      setTimeout(() => { if (!$('s-cupres').hidden) setRank(); }, 1500);
    }
  }
  BB.CupManager = CupManager;
})(window.BB);
