/* game/Game.js — motor de juego: estados, bucle principal, entrada táctil, flujo de campaña, puntuación y recuperación de errores */
(function (BB) {
  'use strict';
  const U = BB.U;

  // bolsa en riesgo + ciclos de campaña
  BB.RISK = {
    STEP: 0.15, BOSS_STEP: 0.5, MAX: 5,   // multiplicador de la bolsa por nivel / boss superado
    CP_MULT: 0.8,                          // arrancar desde el último boss vencido: multiplicador reducido
    CYCLE_MAX: 10,                         // cada reinicio (cobrar o perder) sube el ciclo
    CYCLE_METEORS: 0.25, CYCLE_COINS: 0.2, CYCLE_HP: 0.08,
  };
  const S = BB.STATES = {
    LOADING: 'LOADING', MENU: 'MENU', PLAYING: 'PLAYING', PAUSED: 'PAUSED', LEVEL_COMPLETE: 'LEVEL_COMPLETE',
    BOSS_INTRO: 'BOSS_INTRO', BOSS_FIGHT: 'BOSS_FIGHT', GAME_OVER: 'GAME_OVER', SHOP: 'SHOP',
    PVP_LOBBY: 'PVP_LOBBY', PVP: 'PVP', PVP_RESULT: 'PVP_RESULT',
  };
  // transiciones permitidas
  const TRANS = {
    LOADING: ['MENU'],
    MENU: ['PLAYING', 'BOSS_INTRO', 'SHOP', 'PVP_LOBBY'],
    PLAYING: ['PAUSED', 'LEVEL_COMPLETE', 'GAME_OVER', 'MENU', 'BOSS_INTRO'],
    BOSS_INTRO: ['BOSS_FIGHT', 'PAUSED', 'GAME_OVER', 'MENU'],
    BOSS_FIGHT: ['PAUSED', 'LEVEL_COMPLETE', 'GAME_OVER', 'MENU', 'BOSS_INTRO', 'PLAYING'],
    PAUSED: ['PLAYING', 'BOSS_INTRO', 'BOSS_FIGHT', 'MENU', 'PVP', 'PVP_RESULT'],
    LEVEL_COMPLETE: ['PLAYING', 'BOSS_INTRO', 'MENU', 'SHOP'],
    GAME_OVER: ['PLAYING', 'BOSS_INTRO', 'MENU', 'SHOP'],
    SHOP: ['MENU', 'LEVEL_COMPLETE', 'GAME_OVER'],
    PVP_LOBBY: ['MENU', 'PVP'],
    PVP: ['PVP_RESULT', 'PAUSED', 'MENU'],
    PVP_RESULT: ['PVP', 'PVP_LOBBY', 'MENU'],
  };

  class Game {
    constructor(canvas) {
      this.canvas = canvas;
      this.state = S.LOADING;
      this.prevState = null;
      this.t = 0;
      this.timeScale = 1;
      this.score = 0;
      this.shields = 3;
      this.gravityWells = [];
      this.playerPull = 0;
      this.boss = null;
      this.combo = { count: 0, mult: 1, timer: 0, window: 1.6, max: 1 };
      this.timers = [];
      this.frames = 0;
      this.renderOk = 0;
      this.blackChecks = 0;
      this.input = { active: false, id: null, sx: 0, st: 0, keys: {}, moved: 0 };
    }

    // ---------- inicialización (por pasos, con barra de progreso) ----------
    async boot() {
      const ui = (this.ui = new BB.UIManager(this));
      const step = async (p, txt, fn) => { ui.loading(p, txt); await U.nextFrame(); fn(); };
      this.save = new BB.StorageManager();
      this.save.load();
      this.audio = new BB.AudioManager(this);
      this.audio.setSound(this.save.data.settings.sound);
      this.audio.setMusic(this.save.data.settings.music);
      this.shop = new BB.ShopManager(this);
      this.perf = new BB.PerformanceManager(this);
      await step(0.08, 'INICIANDO GRÁFICOS 3D', () => {
        this.renderer = new BB.Renderer(this.canvas);
        this.renderer.init();
        this.renderer.onLost = () => this.onContextLost();
        this.renderer.onRestored = () => this.onContextRestored();
      });
      await step(0.2, 'CARGANDO TIPOGRAFÍAS', () => {});
      try { if (document.fonts && document.fonts.load) await Promise.race([Promise.all([document.fonts.load('40px "Russo One"'), document.fonts.load('16px "Chakra Petch"')]), new Promise((r) => setTimeout(r, 1500))]); } catch (e) { /* sin fuentes: se usan las de respaldo */ }
      await step(0.3, 'GENERANDO TEXTURAS', () => { this.atlas = BB.Tex.makeAtlas(); BB.Tex.makeIcons(); });
      await step(0.45, 'MODELANDO METEORITOS Y NAVES', () => BB.Models.buildAll());
      await step(0.6, 'CONSTRUYENDO LA ARENA', () => {
        this.world = new BB.World(this);
        this.world.build(this.perf.q);
      });
      await step(0.72, 'PREPARANDO ENTIDADES', () => this.createEntities());
      await step(0.84, 'CONFIGURANDO CONTROLES', () => {
        this.ui.init();
        this.pvp.initUI();
        this.cup.initUI();
        this.arsenal.initUI();
        this.rank.initUI();
        this.net.init();
        this.cup.init();
        this.rank.init();
        this.bindInput();
        this.bindLifecycle();
        this.perf.onChange = (q) => this.applyQuality(q);
        this.perf.setMode(this.save.data.settings.quality);
        this.resize(true);
      });
      await step(0.95, 'COMPILANDO SHADERS', () => {
        this.enterMenuScene();
        this.world.update(0.016, 0);
        this.world.root.updateWorld(null);
        this.render();
      });
      this.last = performance.now();
      this.loopBound = (t) => this.frame(t);
      requestAnimationFrame(this.loopBound);
      ui.loading(1, 'LISTO');
      ui.loadingReady(() => { this.audio.unlock(); this.audio.sfx('click'); this.setState(S.MENU); const rb = this.recoverPendingBag(); this.ui.showMenu(); if (rb > 0) this.ui.menuNotice('SE COBRÓ TU BOLSA PENDIENTE +' + U.fmt(rb), 'gold', 4200); this.audio.playMusic('menu'); });
      window.__BB_READY = true;
    }

    createEntities() {
      const root = this.world.root;
      this.fx = new BB.Particles(this);
      this.fx.init(root);
      this.meteors = new BB.Pool(() => new BB.Meteor(this, root), 64);
      this.aliens = new BB.Pool(() => new BB.Alien(this, root), 18);
      this.player = new BB.Player(this);
      root.add(this.player.node);
      this.bullets = new BB.BulletSystem(this);
      this.squad = new BB.MiniSquad(this, root);
      this.pickups = new BB.Pickups(this, root);
      this.boosts = new BB.BoostManager(this);
      this.collision = new BB.CollisionSystem(this);
      this.level = new BB.LevelManager(this);
      this.level.cfg = this.level.build(1);
      this.sprAdd = new BB.SpriteBatch(this.atlas, 3600, true, true);
      this.sprAlpha = new BB.SpriteBatch(this.atlas, 1400, false, true);
      this.sprOver = new BB.SpriteBatch(this.atlas, 900, false, false);
      this.net = new BB.NetManager(this);
      this.pvp = new BB.PvPManager(this);
      this.cup = new BB.CupManager(this);
      this.arsenal = new BB.Arsenal(this);
      this.rank = new BB.RankManager(this);
      this.onLoadoutChanged();
    }

    onLoadoutChanged() {
      this.stats = this.shop.computeStats();
      this.player.rebuild(this.stats.skin, this.stats.cannon);
      this.bullets.setPlayerType(this.stats.bullet);
    }

    applyQuality(q) {
      this.world.applyQuality(q);
      this.fx.setQuality(q);
      this.resize(true);
    }

    setSetting(k, v) {
      const s = this.save.data.settings;
      s[k] = v;
      if (k === 'sound') this.audio.setSound(v);
      if (k === 'music') { this.audio.setMusic(v); }
      if (k === 'quality') this.perf.setMode(v);
      if (k === 'vibration' && v) this.vibrate(30);
      this.save.save();
    }

    vibrate(p) {
      if (!this.save || !this.save.data.settings.vibration) return;
      try { if (navigator.vibrate) navigator.vibrate(p); } catch (e) { /* no soportado */ }
    }

    setState(s) {
      const allowed = TRANS[this.state];
      if (allowed && allowed.indexOf(s) < 0 && this.state !== s) BB.reportError('state', new Error('Transición no prevista ' + this.state + ' -> ' + s));
      this.prevState = this.state;
      this.state = s;
    }
    isPlaying() { return this.state === S.PLAYING || this.state === S.BOSS_INTRO || this.state === S.BOSS_FIGHT || this.state === S.PVP; }
    after(sec, fn) { this.timers.push({ t: sec, fn }); }

    // ---------- entrada ----------
    bindInput() {
      const el = document.getElementById('bb');
      const isUI = (t) => !!(t && t.closest && t.closest('button,.panel,.view,input,.slot'));
      el.addEventListener('pointerdown', (e) => {
        this.audio.unlock();
        if (!this.isPlaying() || isUI(e.target)) return;
        const inp = this.input;
        inp.active = true; inp.id = e.pointerId; inp.sx = e.clientX; inp.st = this.player.targetX; inp.moved = 0;
        try { el.setPointerCapture(e.pointerId); } catch (err) { /* opcional */ }
        e.preventDefault();
      }, { passive: false });
      el.addEventListener('pointermove', (e) => {
        const inp = this.input;
        if (!inp.active || e.pointerId !== inp.id || !this.isPlaying()) return;
        const dx = e.clientX - inp.sx;
        const sens = this.save.data.settings.sensitivity || 1;
        this.player.targetX = U.clamp(inp.st + (dx / this.world.pxPerUnit) * sens * 1.15, -BB.ARENA.halfW + 0.8, BB.ARENA.halfW - 0.8);
        inp.moved += Math.abs(e.movementX || 0) + 0.5;
        if (Math.abs(dx) > 24 && this.hintOn) { this.hintOn = false; this.ui.hint(false); this.save.data.tutorialDone = true; this.save.save(); }
        e.preventDefault();
      }, { passive: false });
      const end = (e) => { if (e.pointerId === this.input.id) { this.input.active = false; this.input.id = null; } };
      el.addEventListener('pointerup', end);
      el.addEventListener('pointercancel', end);
      el.addEventListener('lostpointercapture', end);
      // bloquear scroll/zoom durante la partida
      document.addEventListener('touchmove', (e) => { if (this.isPlaying() || (e.target && !e.target.closest('.vbody,.tabs'))) e.preventDefault(); }, { passive: false });
      document.addEventListener('gesturestart', (e) => e.preventDefault());
      document.addEventListener('dblclick', (e) => e.preventDefault());
      el.addEventListener('contextmenu', (e) => e.preventDefault());
      window.addEventListener('keydown', (e) => {
        const k = e.key;
        this.input.keys[k.toLowerCase()] = true;
        if ((k === 'p' || k === 'P' || k === 'Escape') && (this.isPlaying() || this.state === S.PAUSED)) { (this.state === S.PAUSED || this.softPause) ? this.resume() : this.pause(); }
        if (k.startsWith('Arrow') && this.isPlaying()) e.preventDefault();
      });
      window.addEventListener('keyup', (e) => { this.input.keys[e.key.toLowerCase()] = false; });
    }

    bindLifecycle() {
      let rt = null;
      const onResize = () => { clearTimeout(rt); rt = setTimeout(() => this.resize(), 80); };
      window.addEventListener('resize', onResize);
      window.addEventListener('orientationchange', () => setTimeout(() => this.resize(), 250));
      if (window.visualViewport) window.visualViewport.addEventListener('resize', onResize);
      const hide = () => { if (this.isPlaying() && !this.pvp.isOnlineMatch()) this.pause(); this.audio.suspend(); };
      document.addEventListener('visibilitychange', () => { if (document.hidden) hide(); else { this.audio.resume(); this.last = performance.now(); } });
      window.addEventListener('pagehide', hide);
      window.addEventListener('blur', () => { if (this.isPlaying() && !this.pvp.isOnlineMatch()) this.pause(); });
      window.addEventListener('focus', () => { this.audio.resume(); this.last = performance.now(); });
    }

    resize(force) {
      try {
        const w = Math.max(1, window.innerWidth), h = Math.max(1, window.innerHeight);
        if (!force && w === this.vw && h === this.vh && this._dpr === this.perf.pixelRatio()) return;
        this.vw = w; this.vh = h; this._dpr = this.perf.pixelRatio();
        this.renderer.setSize(w, h, this._dpr);
        this.world.fitCamera(w, h);
      } catch (e) { BB.reportError('resize', e); }
    }

    // ---------- contexto WebGL ----------
    onContextLost() {
      if (this.isPlaying()) this.pause();
      this.ui.recovering(true, 'Recuperando gráficos…');
      this.lostAt = performance.now();
    }
    onContextRestored() {
      this.ui.recovering(false);
      this.resize(true);
    }

    // ---------- bucle principal ----------
    frame(now) {
      requestAnimationFrame(this.loopBound);
      let rdt = (now - this.last) / 1000;
      this.last = now;
      if (!(rdt > 0)) rdt = 0.016;
      this.perf.sample(rdt);
      const dt = Math.min(rdt, 1 / 20);
      try { this.update(dt); } catch (e) { BB.reportError('update', e); this.onErrorBurst(); }
      try { if (this.render()) this.renderOk++; } catch (e) { BB.reportError('render', e); this.onErrorBurst(); }
      this.watchdog();
    }

    safe(name, fn) { try { fn(); } catch (e) { BB.reportError(name, e); this.onErrorBurst(); } }

    onErrorBurst() {
      if (BB.recentErrorCount(3000) > 25 && !this.recovering) {
        this.recovering = true;
        this.ui.recovering(true, 'Se recuperó el juego tras un error');
        this.safe('recover', () => this.softClear());
        setTimeout(() => { this.recovering = false; this.ui.recovering(false); }, 2500);
      }
    }

    watchdog() {
      const r = this.renderer;
      if (r.lost) {
        if (this.lostAt && performance.now() - this.lostAt > 6000 && !this.lostWarned) {
          this.lostWarned = true;
          this.ui.recovering(true, 'Los gráficos no se recuperaron. Tocá para recargar.');
          document.getElementById('recov').onclick = () => window.location.reload();
        }
        return;
      }
      // Detección de pantalla negra: muestrea un píxel del fondo
      this.frames++;
      if ((this.frames === 45 || this.frames === 200) && this.blackChecks < 3) {
        try {
          this.render();
          const px = r.samplePixel(r.width * 0.5, r.height * 0.97);
          const px2 = r.samplePixel(r.width * 0.1, r.height * 0.5);
          const sum = px[0] + px[1] + px[2] + px2[0] + px2[1] + px2[2];
          this.lastPixel = [px, px2];
          if (sum < 4) {
            this.blackChecks++;
            BB.reportError('blackscreen', new Error('Pixel negro detectado'));
            // degradación controlada: bajar calidad y forzar resubida
            this.perf.tier = 0; this.perf.dprScale = 0.8; this.perf.apply();
            r.gen++;
            if (this.blackChecks >= 2) this.ui.showError('La escena 3D no se está mostrando', 'Tu dispositivo reportó un problema con WebGL. Probá recargar; si continúa, cerrá otras apps o pestañas pesadas.');
          }
        } catch (e) { BB.reportError('watchdog', e); }
      }
    }

    update(dt) {
      this.t += dt;
      if (this.state !== S.PAUSED) for (let i = this.timers.length - 1; i >= 0; i--) {
        const tm = this.timers[i];
        tm.t -= dt;
        if (tm.t <= 0) { this.timers.splice(i, 1); this.safe('timer', tm.fn); }
      }
      const w = this.world;
      w.danger = U.damp(w.danger, w.dangerTarget || 0, 2, dt);
      w.stars.warp = U.damp(w.stars.warp, this.warpTarget || 0, 1.5, dt);
      const st = this.state;
      this.safe('pvp', () => this.pvp.tick(dt));
      if (this.isPlaying() || st === S.LEVEL_COMPLETE || st === S.GAME_OVER || st === S.PVP_RESULT) {
        if (this.slowmo > 0) { this.slowmo -= dt; this.timeScale = U.damp(this.timeScale, 0.3, 8, dt); } else this.timeScale = U.damp(this.timeScale, 1, 4, dt);
        const gdt = dt * this.timeScale;
        const playing = this.isPlaying();
        // teclado (PC)
        const K = this.input.keys;
        if (playing && (K.arrowleft || K.a)) this.player.targetX -= 10 * dt;
        if (playing && (K.arrowright || K.d)) this.player.targetX += 10 * dt;
        if (!this.playerDead) this.safe('player', () => this.player.update(gdt, playing && !this.levelEnding));
        if (st === S.PLAYING) this.safe('level', () => this.level.update(gdt));
        if (this.cupMode) this.safe('cup', () => this.cup.update(gdt));
        if (st === S.PVP) this.safe('pvp-match', () => this.pvp.updateMatch(gdt));
        if (st === S.BOSS_FIGHT && !this.boss && !this.levelEnding) this.safe('boss-guard', () => { this.spawnBoss(); this.setState(S.BOSS_INTRO); });
        const es = this.arsenal.enemyScale(), edt = gdt * es;
        if (this.boss) this.safe('boss', () => { const b = this.boss; let bdt = edt; if (b.frozenT > 0) { b.frozenT -= gdt; bdt *= 0.3; } b.update(bdt); if (this.state === S.BOSS_INTRO && b.entered) this.beginBossFight(); });
        this.safe('meteors', () => this.meteors.forEachAlive((m) => { if (m.frozenT > 0) { m.frozenT -= gdt; m.node.flash = 0.25 + 0.1 * Math.sin(m.t * 20); return; } this.applyWells(m, edt); m.update(edt); }));
        this.safe('aliens', () => this.aliens.forEachAlive((a) => { if (a.frozenT > 0) { a.frozenT -= gdt; return; } a.update(edt); }));
        if (playing) this.safe('arsenal', () => this.arsenal.update(gdt));
        this.safe('bullets', () => this.bullets.update(gdt));
        this.safe('squad', () => this.squad.update(gdt));
        this.safe('pickups', () => this.pickups.update(gdt));
        this.safe('boosts', () => this.boosts.update(gdt));
        if (playing) this.safe('collision', () => this.collision.step(gdt));
        this.safe('combo', () => this.updateCombo(gdt));
        this.safe('fx', () => this.fx.update(gdt));
        this.safe('hud', () => this.ui.updateHud(this));
      } else if (st === S.MENU || st === S.LOADING || st === S.PVP_LOBBY) {
        this.safe('menu', () => this.updateMenuScene(dt));
        this.fx.update(dt);
      } else if (st === S.SHOP) {
        this.player.node.rz += dt * 0.8;
        this.player.core.glow = 1 + Math.sin(this.t * 5) * 0.3;
        this.player.barrel.py = 0.25;
      }
      this.safe('world', () => w.update(dt, this.t));
      w.root.updateWorld(null);
    }

    applyWells(m, dt) {
      if (!this.gravityWells.length) return;
      for (const w of this.gravityWells) {
        const dx = w.x - m.x, dy = w.y - m.y, d2 = dx * dx + dy * dy + 2;
        const f = (w.strength * 6) / d2;
        const l = Math.sqrt(d2);
        m.vx += (dx / l) * f * dt; m.vy += (dy / l) * f * dt * 0.5;
      }
    }

    render() {
      const r = this.renderer;
      if (!r || r.lost) return false;
      const cam = this.world.camera;
      this.sprAdd.reset(cam); this.sprAlpha.reset(cam); this.sprOver.reset(cam);
      this.safe('fx-render', () => this.fx.render(this.sprAdd, this.sprAlpha, this.sprOver));
      this.safe('bullets-render', () => this.bullets.render(this.sprAdd));
      this.safe('pickups-render', () => this.pickups.render(this.sprAdd, this.sprAlpha));
      if (this.state === S.PVP) this.safe('pvp-render', () => this.pvp.render(this.sprAdd));
      if (this.boss) this.safe('boss-render', () => this.boss.render(this.sprAdd, this.sprAlpha));
      this.safe('labels', () => this.renderLabels());
      const h = this.world.hooks();
      const model = this.world.root.world;
      h.inst = [
        { batch: this.bullets.batchP, model }, { batch: this.bullets.batchM, model }, { batch: this.bullets.batchE, model },
        { batch: this.bullets.batchMis, model }, { batch: this.pickups.coinBatch, model },
      ];
      h.spritesAdd = this.sprAdd; h.spritesAlpha = this.sprAlpha; h.spritesOverlay = this.sprOver;
      return r.render(this.world.root, cam, this.world.env, h);
    }

    renderLabels() {
      const cam = this.world.camera, e = cam.eye, top = BB.ARENA.top + 1.5;
      const lab = (x, y, z, r, hp, col) => {
        const wx = x, wy = z, wz = -y;
        let dx = e[0] - wx, dy = e[1] - wy, dz = e[2] - wz;
        const l = Math.hypot(dx, dy, dz) || 1;
        dx /= l; dy /= l; dz /= l;
        const px = x + dx * r * 1.02, pz = -(wz + dz * r * 1.02), py = wy + dy * r * 1.02;
        this.fx.drawText(this.sprOver, px, pz, py, U.short(hp), 0.3 + r * 0.26, col, 1);
      };
      this.meteors.forEachAlive((m) => { if (m.y < top && !m.idle) lab(m.x, m.y, m.z, m.r, m.hp, m.flash > 0.3 ? [1, 0.9, 0.5] : [1, 1, 1]); });
      this.aliens.forEachAlive((a) => { if (a.y < top && !a.idle) lab(a.x, a.y, a.z + 0.5, a.r * 0.6, a.hp, [0.8, 1, 0.85]); });
    }

    // ---------- escena del menú ----------
    enterMenuScene() {
      this.clearEntities();
      this.world.camMode = 'menu';
      this.world.snapCam = true;
      this.world.dangerTarget = 0;
      this.warpTarget = 0.6;
      this.player.reset();
      this.player.node.visible = true;
      const A = BB.ARENA;
      const types = ['giant', 'crystal', 'explosive', 'electric', 'armored', 'normal', 'normal'];
      types.forEach((t, i) => {
        const m = this.meteors.get();
        if (!m) return;
        m.spawn({ type: t, tier: t === 'giant' ? 4 : 1 + (i % 3), x: U.rand(-A.halfW + 1, A.halfW - 1), y: 4 + i * 2.2, hp: 10 });
        m.idle = true; m.baseY = m.y; m.baseX = m.x;
      });
      const a = this.aliens.get();
      if (a) { a.spawn('normal', 1.5, 1, 1, { y: 12, targetY: 12 }); a.idle = true; }
    }
    updateMenuScene(dt) {
      this.meteors.forEachAlive((m) => {
        if (!m.idle) return;
        m.t += dt;
        const n = m.node;
        n.rx += m.wr[0] * dt * 0.4; n.ry += m.wr[1] * dt * 0.4;
        m.y = m.baseY + Math.sin(m.t * 0.5) * 0.6; m.x = m.baseX + Math.cos(m.t * 0.35) * 0.5;
        m.updateNode();
      });
      this.aliens.forEachAlive((a) => { a.state = 'patrol'; a.fireT = 99; a.update(dt); });
      this.player.node.pz = 0.05 + Math.sin(this.t * 2) * 0.06;
      this.player.core.glow = 1 + Math.sin(this.t * 5) * 0.3;
    }

    // Limpieza parcial tras errores: conserva jugador, boss y progreso del nivel
    softClear() {
      this.meteors.forEachAlive((m) => { m.alive = false; m.node.visible = false; });
      this.aliens.forEachAlive((a) => { a.alive = false; a.node.visible = false; });
      for (const b of this.bullets.eb) b.alive = false;
      this.fx.clear();
    }

    clearEntities() {
      this.meteors.forEachAlive((m) => { m.alive = false; m.node.visible = false; m.idle = false; });
      this.aliens.forEachAlive((a) => { a.alive = false; a.node.visible = false; });
      this.bullets.clear();
      this.pickups.clear();
      this.fx.clear();
      this.squad.stop();
      if (this.boss) { this.world.root.remove(this.boss.node); this.boss = null; }
      this.gravityWells.length = 0;
      this.playerPull = 0;
    }

    // ---------- flujo de campaña ----------
    // datos de campaña: ciclo, checkpoint (último boss vencido) y desde dónde arrancar
    camp() {
      const d = this.save.data;
      if (!d.camp || typeof d.camp !== 'object') d.camp = {};
      const c = d.camp;
      if (typeof c.cycle !== 'number') c.cycle = 0;
      if (typeof c.checkpoint !== 'number') c.checkpoint = 0;
      if (c.startMode !== 'cp') c.startMode = 'start';
      return c;
    }
    campStart() { const c = this.camp(); return c.startMode === 'cp' && c.checkpoint > 0 ? c.checkpoint + 1 : 1; }
    cycleK(kind) { const c = Math.min(BB.RISK.CYCLE_MAX, this.camp().cycle); return 1 + c * BB.RISK['CYCLE_' + kind]; }
    // cobrar o perder = reinicio: vuelve a empezar y sube el ciclo (si superaste al menos un nivel)
    endRun() {
      const c = this.camp();
      if (this.rank) this.rank.submitRun(this.score || 0, this.level.num || 1, c.cycle);
      const up = (this.runCleared || 0) > 0;
      if (up) { c.cycle = Math.min(BB.RISK.CYCLE_MAX, c.cycle + 1); this.save.data.stats.maxCycle = Math.max(this.save.data.stats.maxCycle || 0, c.cycle); }
      this.runCleared = 0;
      return up;
    }
    startRun(L) {
      if (L === undefined) L = this.campStart();
      this.score = 0; this.runCoins = 0; this.runCleared = 0;
      // bolsa en riesgo: todo lo que se gana en la campaña queda acá hasta COBRAR
      this.inCampaign = true; this.bag = 0; this.bagMult = L > 1 ? BB.RISK.CP_MULT : 1;
      this.arsenal.resetRun();
      this.save.data.runBag = null;
      this.boosts.inventory = [];
      this.save.data.stats.games++;
      this.startLevel(L);
    }

    startLevel(L, opt) {
      opt = opt || {};
      const cup = !!opt.cup;
      const keepSh = opt.keepShields ? this.shields : 0;
      this.clearEntities();
      if (cup) { this.stats = this.cup.stats(); this.player.rebuild(this.stats.skin, this.stats.cannon); this.bullets.setPlayerType(this.stats.bullet); }
      else { this.cupMode = false; this.onLoadoutChanged(); }
      this.timers.length = 0;
      this.player.reset();
      this.player.node.rz = 0;
      this.playerDead = false;
      this.levelEnding = false;
      this.shields = keepSh > 0 ? keepSh : this.stats.maxShields;
      this.boosts.reset(true);
      this.combo = { count: 0, mult: 1, timer: 0, window: 1.6, max: 1 };
      this.levelCoins = 0; this.hitsTaken = 0; this.levelKills = 0; this.levelStartScore = this.score;
      this.slowmo = 0; this.timeScale = 1;
      let cfg;
      if (cup) {
        // mismas oleadas para todos: la generación usa la semilla de la semana
        const rnd = Math.random, sr = U.seeded(this.cup.seed() + L * 7919);
        Math.random = sr;
        try { cfg = this.level.start(L); } finally { Math.random = rnd; }
        this.cup.tweakCfg(cfg);
        
      } else { cfg = this.level.start(L); if (this.inCampaign) this.applyCycle(cfg); }
      this.levelHp = cfg.levelHp;
      this.world.camMode = 'game';
      this.world.dangerTarget = 0;
      this.warpTarget = 0;
      this.guaranteedDrop = cup ? null : { 1: ['multi', 3], 2: ['squad', 4], 3: ['rapid', 5], 4: ['shield', 5] }[L] || null;
      if (cup && (this.cup.data.up.squad || 0) > 0) this.after(cfg.boss ? 3.6 : 1.2, () => {
        if (!this.cupMode || !this.isPlaying()) return;
        const st = this.stats, d0 = st.squadDur; st.squadDur = 6 * this.cup.data.up.squad; this.boosts.activate('squad'); st.squadDur = d0;
      });
      this.ui.showHud();
      this.ui.hideBanner();
      this.input.active = false;
      this.arsenal.renderHud();
      if (cfg.boss) {
        this.setState(S.BOSS_INTRO);
        this.audio.playMusic('boss');
        this.after(0.3, () => this.spawnBoss());
      } else {
        this.setState(S.PLAYING);
        this.audio.playMusic('game');
        this.ui.banner(cup ? 'NIVEL ' + (this.cup.stage || 1) : 'NIVEL ' + L, cup ? this.cup.mod().name : cfg.title + (cfg.cycle ? ' · CICLO ' + cfg.cycle : ''), false, 2.2);
        if (cfg.intro) cfg.intro.forEach((it, i) => this.after(2.4 + i * 1.3, () => this.ui.toast(it[1], null, true)));
        this.hintOn = !cup && (L === 1 || !this.save.data.tutorialDone);
        this.ui.hint(this.hintOn);
        if (this.hintOn) this.after(9, () => { this.hintOn = false; this.ui.hint(false); });
      }
    }

    // cada ciclo: más meteoritos (más monedas), más vida y más ritmo
    applyCycle(cfg) {
      const c = Math.min(BB.RISK.CYCLE_MAX, this.camp().cycle);
      if (!c) return;
      cfg.hpScale *= this.cycleK('HP'); cfg.levelHp *= this.cycleK('HP');
      cfg.cycle = c;
      if (cfg.boss) return;
      const q = this.level.queue, ms = q.filter((e) => e.k === 'm' && e.type !== 'giant');
      const extra = Math.round(ms.length * c * BB.RISK.CYCLE_METEORS);
      for (let i = 0; i < extra && ms.length; i++) {
        const e = ms[Math.floor(Math.random() * ms.length)];
        q.splice(1 + Math.floor(Math.random() * q.length), 0, { k: 'm', tier: e.tier, type: e.type });
      }
      cfg.maxMass += c;
      cfg.interval *= Math.max(0.6, 1 - 0.05 * c);
      this.level.total = q.reduce((a, e) => a + BB.LevelManager.weight(e), 0) || 1;
    }

    spawnBoss() {
      const L = this.level.num;
      const def = BB.BOSS_DEFS[BB.LevelManager.bossIndex(L)];
      const Cls = BB.BossClasses[def.id];
      this.boss = new Cls(this, this.world.root, def, L);
      if (this.cupMode) { this.boss.maxHp = this.boss.hp = Math.round(this.boss.hp * BB.CUP.hpK); }
      else if (this.inCampaign && this.camp().cycle > 0) { this.boss.maxHp = this.boss.hp = Math.round(this.boss.hp * this.cycleK('HP')); }
      this.world.camMode = 'boss';
      this.warpTarget = 3;
      this.ui.banner('BOSS INCOMING', def.name, true, 3.2);
      this.audio.sfx('siren');
      this.audio.sfx('roar');
      this.world.addShake(0.5);
      this.vibrate([80, 60, 80]);
    }

    beginBossFight() {
      this.setState(S.BOSS_FIGHT);
      this.world.camMode = 'game';
      this.warpTarget = 0;
      this.ui.toast('¡DESTRUÍ AL BOSS!', '#ff3355');
    }

    spawnMeteor(o) {
      const m = this.meteors.get();
      if (!m) return null;
      m.idle = false;
      return m.spawn(o);
    }

    spawnAlien(type, x, opts) {
      const a = this.aliens.get();
      if (!a) return null;
      a.idle = false;
      const cfg = this.level.cfg || { hpScale: 1, speedScale: 1 };
      return a.spawn(type, x, cfg.hpScale, cfg.speedScale, opts || {});
    }

    // ---------- daño y puntuación ----------
    damageTarget(t, dmg, src) {
      if (t.frozenT > 0 || (t.owner && t.owner.frozenT > 0)) dmg *= 1.5;   // congelado: +50% de daño
      if (t.owner) {
        const b = t.owner;
        if (b.damage(dmg)) this.onBossKilled(b);
        return;
      }
      if (t.kind === 'rival') { this.pvp.onHitRival(dmg); return; }
      if (t.kind === 'meteor' || t.kind === 'alien') {
        if (t.damage(dmg)) this.onKill(t);
        return;
      }
      // proyectil enemigo destructible (misil / huevo)
      t.hp -= dmg;
      if (t.hp <= 0 && t.alive) {
        t.alive = false;
        this.fx.explode(t.x, t.y, t.z, 0.45, t.col || [1, 0.5, 0.2], 0.6);
        this.addScore(50, t.x, t.y, t.z);
      }
    }

    onKill(t) {
      t.kill();
      this.levelKills++;
      this.save.data.stats.kills++;
      this.comboKill();
      this.addScore(t.score * this.combo.mult, t.x, t.y, t.z + 0.8);
      const L = this.level.num;
      const coinK = (1 + L * 0.09) * (this.inCampaign ? this.cycleK('COINS') : 1) * this.arsenal.lootMult();
      if (!t.fromBoss || Math.random() < 0.5) this.pickups.spawnCoins(t.x, t.y, t.z, Math.max(1, Math.round(t.coins * coinK)));
      // boosts
      if (this.state === S.PVP) this.pvp.onKill(t);
      const gd = this.guaranteedDrop;
      if (gd && this.levelKills >= gd[1]) { this.pickups.spawnBoost(t.x, t.y, gd[0]); this.guaranteedDrop = null; return; }
      let p = t.kind === 'alien' ? 0.2 : t.tier >= 4 ? 0.4 : t.tier >= 3 ? 0.11 : 0.035;
      if (t.fromBoss) p *= 0.5;
      if (Math.random() < p) this.pickups.spawnBoost(t.x, t.y);
    }

    onBossKilled(b) {
      b.startDeath();
      this.slowmo = 1.6;
      this.levelEnding = true;
      this.audio.sfx('explodeBig');
      this.vibrate([100, 50, 100, 50, 200]);
      this.ui.whiteFlash();
    }

    onBossDefeated(b) {
      const g = this;
      this.after(1.2, () => this.arsenal.recharge());
      this.save.data.stats.bosses++;
      this.addScore(10000, b.x, b.y, b.z + 2, 1.8);
      // limpieza: destruir enemigos restantes
      this.meteors.forEachAlive((m) => { m.noSplit = true; m.kill(); });
      this.aliens.forEachAlive((a) => a.kill());
      for (const e of this.bullets.eb) if (e.alive) { e.alive = false; this.fx.burst(e.x, e.y, e.z, e.col, 3, 3, 0.3, 0.3); }
      this.gravityWells.length = 0; this.playerPull = 0;
      this.pickups.spawnCoins(b.x, b.y, b.z, Math.round(120 + this.level.num * 12), 40);
      this.after(0.6, () => this.pickups.collectAll());
      this.audio.sfx('victory');
      this.ui.whiteFlash();
      this.ui.banner('¡VICTORIA!', b.name + ' DESTRUIDO', false, 2.2);
      this.after(2.6, () => { if (g.boss === b) { g.world.root.remove(b.node); g.boss = null; } g.levelComplete(); });
    }

    addScore(v, x, y, z, scale) {
      v = Math.round(v);
      this.score += v;
      if (x !== undefined) this.fx.text(x, y, z, '+' + v, v >= 1000 ? [1, 0.85, 0.3] : [1, 1, 1], scale || (v >= 500 ? 1.3 : 1));
    }

    addCoins(v) {
      const d = this.save.data;
      if (this.arsenal) v *= this.arsenal.coinMult();
      this.runCoins = (this.runCoins || 0) + v;
      this.levelCoins = (this.levelCoins || 0) + v;
      if (this.cupMode) { this.score += v * 10; return; } // en la copa las monedas suman puntos
      if (this.inCampaign) { this.bag = (this.bag || 0) + v; return; } // en riesgo
      d.coins += v; d.stats.coinsTotal += v;
      this.save.save();
    }
    bagValue() { return Math.round((this.bag || 0) * (this.bagMult || 1)); }
    // COBRAR Y RETIRARSE: la bolsa (con multiplicador) pasa a la billetera
    cashOut() {
      if (!this.inCampaign) { this.toMenu(); return; }
      const d = this.save.data, amount = this.bagValue();
      d.coins += amount; d.stats.coinsTotal += amount;
      d.stats.bestCash = Math.max(d.stats.bestCash || 0, amount);
      d.stats.cashouts = (d.stats.cashouts || 0) + 1;
      const up = this.endRun();
      this.inCampaign = false; this.bag = 0; this.bagMult = 1; d.runBag = null;
      this.save.save(true);
      this.toMenu();
      this.audio.sfx('coin');
      this.ui.cashBurst(amount, up ? this.camp().cycle : 0);
    }
    // perder la bolsa (game over o abandonar)
    loseBag() {
      this.cycleUp = false;
      if (!this.inCampaign) return 0;
      const d = this.save.data, lost = this.bagValue();
      d.stats.coinsLost = (d.stats.coinsLost || 0) + lost;
      this.cycleUp = this.endRun();
      this.inCampaign = false; this.bag = 0; this.bagMult = 1; d.runBag = null;
      this.save.save(true);
      return lost;
    }
    // si la app se cerró en la pantalla de nivel completado, la bolsa se cobra al volver
    recoverPendingBag() {
      const d = this.save.data, rb = d.runBag;
      d.runBag = null;
      if (!rb || !(rb.bag > 0)) return 0;
      const amount = Math.round(rb.bag * (rb.mult || 1));
      d.coins += amount; d.stats.coinsTotal += amount;
      const c = this.camp(); c.cycle = Math.min(BB.RISK.CYCLE_MAX, c.cycle + 1);
      this.save.save(true);
      return amount;
    }

    comboKill() {
      const c = this.combo;
      c.count++;
      c.timer = c.window;
      const m = Math.min(5, 1 + Math.floor(c.count / 4));
      if (m > c.mult) { c.mult = m; if (m >= 2) this.audio.sfx('levelUp'); }
      c.max = Math.max(c.max, c.mult);
    }
    updateCombo(dt) {
      const c = this.combo;
      if (c.timer > 0) { c.timer -= dt; return; }
      if (c.mult > 1) { c.mult--; c.count = (c.mult - 1) * 4; c.timer = 0.9; c.window = 1.6; } else c.count = 0;
    }

    hitPlayer(src, obj) {
      const p = this.player;
      if (this.state === S.PVP) { this.pvp.damageMe(12); return; }
      if (this.playerDead || p.invuln > 0 || this.levelEnding || this.state === S.BOSS_INTRO) return;
      if (obj && obj.kind === 'meteor') { obj.vy = Math.sqrt(2 * obj.g * Math.max(2, obj.bounceH - obj.r)); obj.vx = (obj.x < p.x ? -1 : 1) * Math.max(2, Math.abs(obj.vx)); }
      if (obj && obj.kind === 'alien' && obj.state === 'dive') { obj.state = 'return'; obj.vy = 8; }
      if (this.boosts.isActive('shield')) {
        this.boosts.consume('shield');
        p.invuln = 1.0;
        this.fx.shock(p.x, p.y, 4, [0.4, 0.8, 1], 0.5);
        this.fx.burst(p.x, p.y, 0.8, [0.5, 0.85, 1], 20, 6, 0.4, 0.5);
        this.audio.sfx('shieldBlock');
        this.vibrate(30);
        return;
      }
      this.shields--;
      this.hitsTaken++;
      p.invuln = this.stats.invuln;
      this.fx.explode(p.x, p.y, 0.8, 0.8, [1, 0.3, 0.3], 0.8);
      this.ui.hurt();
      this.world.addShake(0.9);
      this.audio.sfx('hurt');
      this.vibrate([70, 40, 70]);
      this.combo.mult = 1; this.combo.count = 0;
      if (this.shields <= 0) { if (this.state === S.PVP) this.pvp.onLocalDeath(); else this.gameOver(); }
    }

    onWaveCleared() {
      if (this.cupMode) { this.cup.onWaveCleared(); return; }
      this.levelEnding = true;
      this.pickups.collectAll();
      this.ui.banner('¡SECTOR LIMPIO!', null, false, 1.4);
      this.after(1.5, () => this.levelComplete());
    }

    levelComplete() {
      if (this.state === S.GAME_OVER) return;
      if (this.cupMode) { this.cup.onWaveCleared(); return; }
      const L = this.level.num, boss = this.level.cfg.boss;
      const d = this.save.data;
      const bonuses = [];
      const lvlCoins = Math.round((boss ? 150 + L * 20 : 15 + L * 6) * (this.inCampaign ? this.cycleK('COINS') : 1));
      if (this.inCampaign) { this.runCleared = (this.runCleared || 0) + 1; if (boss) { const cp = this.camp(); cp.checkpoint = Math.max(cp.checkpoint, L); } }
      bonuses.push([boss ? 'BONO DE BOSS (MONEDAS)' : 'BONO DE NIVEL (MONEDAS)', lvlCoins]);
      let scoreBonus = 1000 + L * 150;
      bonuses.push(['NIVEL SUPERADO (PUNTOS)', scoreBonus]);
      if (this.hitsTaken === 0) { const nb = 2000 + L * 100; scoreBonus += nb; bonuses.push(['SIN DAÑO (PUNTOS)', nb]); }
      if (this.combo.max >= 2) { const cb = this.combo.max * 400; scoreBonus += cb; bonuses.push(['COMBO MÁX x' + this.combo.max + ' (PUNTOS)', cb]); }
      this.score += scoreBonus;
      this.addCoins(lvlCoins);
      const prevMult = this.bagMult || 1;
      if (this.inCampaign) {
        this.bagMult = Math.min(BB.RISK.MAX, Math.round((prevMult + (boss ? BB.RISK.BOSS_STEP : BB.RISK.STEP)) * 100) / 100);
        d.runBag = { bag: this.bag, mult: this.bagMult, level: L };
      }
      d.unlocked = Math.max(d.unlocked, L + 1);
      d.selected = L + 1;
      d.stats.maxLevel = Math.max(d.stats.maxLevel, L + 1);
      if (this.score > d.best) d.best = this.score;
      this.save.save(true);
      this.setState(S.LEVEL_COMPLETE);
      this.audio.sfx('levelUp');
      this.audio.playMusic('menu');
      this.ui.hideBanner();
      this.ui.hint(false);
      const keys = BB.BOOST_KEYS.slice().sort(() => Math.random() - 0.5).slice(0, 3);
      this.ui.showComplete({
        level: L, boss, bossName: boss ? BB.BOSS_DEFS[BB.LevelManager.bossIndex(L)].name : '',
        score: this.score, coins: this.levelCoins, bonusTotal: scoreBonus, bonuses, rewards: keys,
        bag: this.bag || 0, mult: this.bagMult || 1, prevMult, cash: this.bagValue(),
        nextMult: Math.min(BB.RISK.MAX, (this.bagMult || 1) + BB.RISK.STEP),
      });
    }

    nextLevel(rewardKey) {
      if (rewardKey) this.boosts.addInventory(rewardKey);
      this.save.data.runBag = null; // vuelve a estar en riesgo
      this.save.save(true);
      this.startLevel(this.level.num + 1);
    }

    retry() { this.startRun(this.campStart()); }

    gameOver() {
      this.playerDead = true;
      this.input.active = false;
      const p = this.player;
      this.fx.explode(p.x, p.y, 0.8, 2, [1, 0.5, 0.2], 1.6);
      this.fx.explode(p.x, p.y, 0.8, 1.2, [0.4, 0.8, 1], 1.2);
      p.node.visible = false;
      this.squad.stop();
      this.world.addShake(1.2);
      this.slowmo = 1.2;
      this.audio.sfx('explodeBig');
      this.vibrate([200, 80, 300]);
      const d = this.save.data;
      const newRecord = this.score > d.best;
      if (newRecord) d.best = this.score;
      const lostMult = this.bagMult || 1;
      const lost = this.loseBag();
      const cupRun = this.cupMode ? this.cup.end('ko') : null;
      this.save.save(true);
      this.setState(S.GAME_OVER);
      if (cupRun) {
        this.after(1.6, () => {
          if (this.state !== S.GAME_OVER) return;
          this.audio.playMusic('over'); this.audio.sfx('gameover');
          this.world.dangerTarget = 0; this.ui.hideBanner();
          cupRun.then((r) => { if (this.state === S.GAME_OVER && r) this.cup.showResult(r); });
        });
        return;
      }
      this.after(1.6, () => {
        if (this.state !== S.GAME_OVER) return;
        this.audio.playMusic('over');
        this.audio.sfx('gameover');
        this.world.dangerTarget = 0;
        this.ui.hideBanner();
        this.ui.showOver({ score: this.score, level: this.level.num, coins: this.runCoins || 0, best: d.best, newRecord, lost, lostMult, wallet: d.coins, cycle: this.camp().cycle, cycleUp: this.cycleUp, start: this.campStart() });
      });
    }

    pause() {
      if (!this.isPlaying()) return;
      if (this.pvp.isOnlineMatch()) { this.softPause = true; this.ui.showPause(); return; }
      this.pausedFrom = this.state;
      this.setState(S.PAUSED);
      this.input.active = false;
      this.ui.showPause();
    }
    resume() {
      if (this.softPause) { this.softPause = false; this.ui.hidePause(); return; }
      if (this.state !== S.PAUSED) return;
      this.setState(this.pausedFrom || S.PLAYING);
      this.ui.hidePause();
      this.last = performance.now();
      this.audio.resume();
    }

    toMenu() {
      const inDuel = this.state === S.PVP || (this.state === S.PAUSED && this.pausedFrom === S.PVP);
      if (inDuel && !this.pvp.result) this.pvp.forfeit();
      const lostBag = this.inCampaign ? this.loseBag() : 0;
      if (this.cupMode) this.cup.end('quit');
      if (this.softPause) this.softPause = false;
      this.pvp.leaveMatch();
      this.ui.hidePause();
      this.timers.length = 0;
      this.levelEnding = false;
      this.playerDead = false;
      this.player.node.visible = true;
      this.save.save(true);
      this.setState(S.MENU);
      this.enterMenuScene();
      this.ui.hideBanner();
      this.ui.hint(false);
      this.audio.playMusic('menu');
      this.ui.showMenu();
      if (lostBag > 0) this.ui.menuNotice('ABANDONASTE · BOLSA PERDIDA −' + U.fmt(lostBag), 'bad');
    }

    // Arena del duelo PvP (misma escena 3D, reglas del duelo)
    startPvpArena() {
      this.inCampaign = false; this.cupMode = false;
      if (this.arsenal) this.arsenal.renderHud();
      this.clearEntities();
      this.onLoadoutChanged();
      this.timers.length = 0;
      this.player.reset();
      this.player.node.visible = true;
      this.playerDead = false; this.levelEnding = false;
      this.shields = 3;
      this.stats = Object.assign({}, this.stats, { dmg: 1.2, rate: 7 });
      this.boosts.reset(false);
      this.combo = { count: 0, mult: 1, timer: 0, window: 1.6, max: 1 };
      this.score = 0; this.levelCoins = 0; this.hitsTaken = 0; this.levelKills = 0;
      this.slowmo = 0; this.timeScale = 1; this.guaranteedDrop = null;
      this.level.cfg = { num: 0, boss: false, hpScale: 2.4, speedScale: 1.15, levelHp: 26, title: 'DUELO' };
      this.level.queue = []; this.level.done = true; this.levelHp = 26;
      this.world.camMode = 'game'; this.world.dangerTarget = 0; this.warpTarget = 0;
      this.softPause = false;
      this.setState(S.PVP);
      this.ui.showHud(); this.ui.hideBanner(); this.ui.hint(false);
      this.input.active = false;
      this.audio.playMusic('boss');
    }

    enterShop() {
      this.shopFrom = this.state;
      this.setState(S.SHOP);
      this.clearEntities();
      this.player.reset();
      this.player.node.visible = true;
      this.world.camMode = 'shop';
      this.world.snapCam = true;
      this.world.dangerTarget = 0;
    }
    exitShop() {
      const from = this.shopFrom;
      if (from === S.LEVEL_COMPLETE || from === S.GAME_OVER) {
        this.setState(from);
        this.world.camMode = 'game';
        this.player.node.rz = 0;
        if (from === S.GAME_OVER) this.player.node.visible = false;
      } else {
        this.setState(S.MENU);
        this.enterMenuScene();
      }
    }

    resetProgress() {
      this.save.reset();
      this.audio.setSound(true); this.audio.setMusic(true);
      this.perf.setMode('auto');
      this.onLoadoutChanged();
      this.ui.syncToggles();
    }

    // ---------- consultas para entidades ----------
    nearestTarget(x, y, range, exclude, ahead) {
      const T = this.collision.buildTargets();
      let best = null, bd = range * range;
      for (const t of T) {
        if (t === exclude || (t.owner && exclude && exclude.owner === t.owner)) continue;
        if (t.owner ? !t.owner.alive : !t.alive) continue;
        if (ahead && t.y < y - 1) continue;
        const dx = t.x - x, dy = t.y - y, d = dx * dx + dy * dy;
        if (d < bd) { bd = d; best = t; }
      }
      return best;
    }
    nearestTargets(x, y, n, range, exclude) {
      const T = this.collision.buildTargets().filter((t) => t !== exclude && (t.owner ? t.owner.alive : t.alive));
      return T.map((t) => ({ t, d: Math.hypot(t.x - x, t.y - y) })).filter((o) => o.d < range && o.t !== exclude).sort((a, b) => a.d - b.d).slice(0, n).map((o) => o.t);
    }
    areaDamage(x, y, R, dmg, src) {
      const T = this.collision.buildTargets().slice();
      for (const t of T) {
        if (t === src) continue;
        if (Math.hypot(t.x - x, t.y - y) < R + t.r) this.damageTarget(t, dmg, 'area');
      }
    }
  }
  BB.Game = Game;
})(window.BB);
