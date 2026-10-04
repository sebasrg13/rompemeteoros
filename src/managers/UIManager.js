/* managers/UIManager.js — pantallas DOM, HUD, tienda, ajustes, info, récords, banners y toasts */
(function (BB) {
  'use strict';
  const U = BB.U;
  const $ = (id) => document.getElementById(id);
  const SCREENS = ['s-loading', 's-menu', 's-hud', 's-pause', 's-complete', 's-over', 's-shop', 's-settings', 's-info', 's-records', 's-error', 's-pvp', 's-vs', 's-pvpres', 's-cup', 's-cupres', 's-arsenal', 's-rank', 's-ship'];

  class UIManager {
    constructor(game) {
      this.game = game;
      this.cache = {};
      this.shopCat = 'cannons';
      this.rewardSel = -1;
      this.rewardOpts = [];
      this.returnTo = 'menu';
      this.bannerT = null;
    }

    init() {
      const g = this.game;
      const on = (id, fn) => {
        const el = $(id);
        if (!el) return;
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          g.audio.unlock();
          g.audio.sfx('click');
          try { fn(e); } catch (err) { BB.reportError('ui:' + id, err); }
        });
      };
      on('btn-play', () => g.startRun(g.campStart()));
      on('btn-shop', () => this.openShop('menu'));
      on('btn-records', () => this.openRecords());
      on('btn-settings', () => this.openSettings());
      on('btn-info', () => this.openInfo());
      on('lvl-prev', () => this.changeLevel(-1));
      on('lvl-next', () => this.changeLevel(1));
      on('btn-pause', () => g.pause());
      on('btn-resume', () => g.resume());
      on('btn-quit', () => g.toMenu());
      on('btn-next', () => g.nextLevel(this.rewardSel >= 0 ? this.rewardOpts[this.rewardSel] : null));
      on('btn-c-menu', () => g.cashOut());
      on('btn-c-shop', () => this.openShop('complete'));
      on('btn-retry', () => g.retry());
      on('btn-o-menu', () => g.toMenu());
      on('btn-o-shop', () => this.openShop('over'));
      on('shop-back', () => this.closeShop());
      on('set-back', () => this.back());
      on('s-upd', () => { try { window.RompeApp && window.RompeApp.checkUpdates(); } catch (e) { /* */ } });
      on('info-back', () => this.back());
      on('rec-back', () => this.game.rank.open());
      on('err-retry', () => window.location.reload());
      const toggles = [['p-sound', 'sound'], ['p-music', 'music'], ['p-vib', 'vibration'], ['s-sound', 'sound'], ['s-music', 'music'], ['s-vib', 'vibration']];
      for (const [id, key] of toggles) on(id, () => { g.setSetting(key, !g.save.data.settings[key]); this.syncToggles(); });
      $('s-quality').addEventListener('click', (e) => {
        const b = e.target.closest('button[data-q]');
        if (!b) return;
        g.setSetting('quality', b.dataset.q);
        this.syncToggles();
      });
      const sens = $('s-sens');
      sens.addEventListener('input', () => { g.setSetting('sensitivity', parseFloat(sens.value)); $('s-sensv').textContent = parseFloat(sens.value).toFixed(1); });
      let resetArm = false;
      on('s-reset', (e) => {
        const b = $('s-reset');
        if (!resetArm) { resetArm = true; b.textContent = 'TOCÁ DE NUEVO PARA CONFIRMAR'; setTimeout(() => { resetArm = false; b.textContent = 'REINICIAR PROGRESO'; }, 3000); return; }
        resetArm = false; b.textContent = 'PROGRESO REINICIADO';
        g.resetProgress();
      });
      $('shop-tabs').addEventListener('click', (e) => {
        const b = e.target.closest('button[data-cat]');
        if (!b) return;
        g.audio.sfx('click');
        this.shopCat = b.dataset.cat; this.renderShop();
      });
      $('shop-items').addEventListener('click', (e) => {
        const pm = e.target.closest('button[data-prem]');
        if (pm) {
          g.audio.unlock();
          const ok = g.premium.buy(pm.dataset.prem);
          if (ok) { g.audio.sfx('buy'); g.vibrate(30); } else g.audio.sfx('deny');
          this.renderShop();
          return;
        }
        if (e.target.closest('#shop-getml')) { g.audio.sfx('click'); this.closeShop(); g.cup.tab = 'ml'; g.cup.open(); return; }
        const b = e.target.closest('button[data-buy]');
        if (!b) { const sk = e.target.closest('.item[data-skin]'); if (sk) { g.audio.sfx('click'); this.trySkin(sk.dataset.skin); } return; }
        g.audio.unlock();
        const r = g.shop.buy(b.dataset.buy);
        if (r) this.previewSkin = null;
        if (r === 'buy') { g.audio.sfx('buy'); g.vibrate(20); }
        else if (r === 'equip') g.audio.sfx('click');
        else g.audio.sfx('deny');
        this.renderShop();
      });
      $('c-cards').addEventListener('click', (e) => {
        const c = e.target.closest('.card');
        if (!c) return;
        const i = parseInt(c.dataset.i, 10);
        this.rewardSel = this.rewardSel === i ? -1 : i;
        g.audio.sfx('click');
        this.renderCards();
      });
      $('h-inv').addEventListener('pointerdown', (e) => {
        const s = e.target.closest('.slot');
        if (!s) return;
        e.stopPropagation(); e.preventDefault();
        g.boosts.useInventory(parseInt(s.dataset.i, 10));
      });
      this.buildInfo();
    }

    show(id) {
      for (const s of SCREENS) { const el = $(s); if (el) el.hidden = s !== id && !(id === 's-pause' && s === 's-hud'); }
      this.current = id;
    }

    // ---------- carga ----------
    loading(p, txt) {
      $('load-bar').style.width = Math.round(p * 100) + '%';
      if (txt) $('load-txt').textContent = txt;
    }
    loadingReady(fn) {
      $('load-txt').textContent = 'LISTO';
      const b = $('btn-start');
      b.hidden = false;
      b.addEventListener('click', (e) => { e.stopPropagation(); fn(); }, { once: true });
    }
    showError(title, msg) {
      if (title) $('err-title').textContent = title;
      if (msg) $('err-msg').textContent = msg;
      this.show('s-error');
    }
    recovering(on, txt) { const r = $('recov'); r.hidden = !on; if (txt) r.textContent = txt; }

    // ---------- menú ----------
    showMenu() {
      const d = this.game.save.data;
      $('m-coins').textContent = U.fmt(d.coins);
      if (this.game.cup) { $('m-ml').textContent = U.fmt(this.game.cup.data.ml); }
      $('m-best').textContent = U.fmt(d.best);
      if (this.game.pvp) this.game.pvp.syncMenuChip();
      if (this.game.ship) this.game.ship.renderMenu();
      this.syncLevel();
      this.show('s-menu');
    }
    // salida de la campaña: nivel 1 o el último boss vencido (con multiplicador reducido)
    syncLevel() {
      const g = this.game, c = g.camp(), cp = c.checkpoint;
      if (!cp) c.startMode = 'start';
      const fromCp = c.startMode === 'cp' && cp > 0;
      $('m-lvl-lab').textContent = fromCp ? 'ATAJO · DESPUÉS DEL BOSS' : 'ARRANCÁS EN';
      $('m-level').textContent = fromCp ? 'NIVEL ' + (cp + 1) + ' · x' + BB.RISK.CP_MULT : 'NIVEL 1';
      const cyc = Math.min(BB.RISK.CYCLE_MAX, c.cycle);
      $('m-sub').textContent = cyc ? 'CICLO ' + c.cycle + ' · +' + Math.round(cyc * BB.RISK.CYCLE_METEORS * 100) + '% METEOROS · +' + Math.round(cyc * BB.RISK.CYCLE_COINS * 100) + '% MONEDAS' : 'CICLO 0 · CADA REINICIO SUMA METEOROS Y MONEDAS';
      $('m-sub').classList.toggle('cyc', cyc > 0);
      const on = cp > 0;
      for (const id of ['lvl-prev', 'lvl-next']) { $(id).disabled = !on; $(id).style.opacity = on ? 1 : 0.35; }
    }
    changeLevel() {
      const c = this.game.camp();
      if (!c.checkpoint) return;
      c.startMode = c.startMode === 'cp' ? 'start' : 'cp';
      this.game.save.save();
      this.syncLevel();
    }

    // ---------- HUD ----------
    showHud() { this.show('s-hud'); this.cache = {}; }
    set(id, v) { if (this.cache[id] !== v) { this.cache[id] = v; const el = $(id); if (el) el.textContent = v; } }
    updateHud(g) {
      const duel = g.state === BB.STATES.PVP || g.state === BB.STATES.PVP_RESULT || (g.state === BB.STATES.PAUSED && g.pausedFrom === BB.STATES.PVP);
      const cupM = !!g.cupMode && !duel;
      if (this.cache.duel !== duel || this.cache.cupM !== cupM) { this.cache.duel = duel; this.cache.cupM = cupM; $('bb').classList.toggle('duel', duel); $('bb').classList.toggle('cup', cupM); document.querySelector('.hud-lvl').firstChild.nodeValue = duel || cupM ? '' : 'NIVEL'; }
      this.set('h-level', duel ? 'DUELO' : g.cupMode ? 'COPA' : '' + g.level.num);
      this.set('h-score', U.fmt(g.score));
      const risk = !!g.inCampaign && !duel;
      if (this.cache.risk !== risk) { this.cache.risk = risk; $('bb').classList.toggle('risk', risk); }
      this.set('h-coins', U.fmt(risk ? g.bagValue() : g.save.data.coins));
      if (risk) this.set('h-mult', 'x' + (g.bagMult || 1).toFixed(1));
      const maxSh = duel ? 3 : g.stats.maxShields;
      const sk = g.shields + '/' + maxSh;
      if (this.cache.sh !== sk) {
        const had = this.cache.sh;
        this.cache.sh = sk;
        let h = '';
        for (let i = 0; i < maxSh; i++) h += '<svg viewBox="0 0 24 24" class="' + (i < g.shields ? '' : 'off') + '"><use href="#i-shield"/></svg>';
        $('h-shields').innerHTML = h;
        if (had) { const el = $('h-shields'); el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); }
      }
      const boss = g.boss && g.boss.alive;
      $('h-progw').style.display = boss || g.level.cfg.boss || duel ? 'none' : '';
      const pr = Math.round(g.level.progress() * 100);
      if (this.cache.pr !== pr) { this.cache.pr = pr; $('h-prog').style.width = pr + '%'; }
      // boss
      const bb = $('h-boss');
      if (g.boss && (g.boss.alive || g.boss.dying > 0)) {
        if (bb.hidden) { bb.hidden = false; this.set('h-bossname', g.boss.name); }
        const f = Math.round(g.boss.hpFrac() * 1000) / 10;
        if (this.cache.bf !== f) { this.cache.bf = f; $('h-bosshp').style.width = f + '%'; $('h-bosslag').style.width = f + '%'; }
        this.set('h-bossphase', g.boss.phase >= 4 ? 'FASE FINAL' : 'FASE ' + g.boss.phase);
      } else if (!bb.hidden) bb.hidden = true;
      // combo
      const c = g.combo;
      const ce = $('h-combo');
      if (c.mult >= 2) {
        if (ce.hidden) ce.hidden = false;
        if (this.cache.cm !== c.mult) { this.cache.cm = c.mult; $('h-combov').textContent = 'x' + c.mult; ce.classList.remove('pop'); void ce.offsetWidth; ce.classList.add('pop'); }
        $('h-combot').style.width = Math.round(U.clamp(c.timer / c.window, 0, 1) * 100) + '%';
      } else if (!ce.hidden) { ce.hidden = true; this.cache.cm = 0; }
      // boosts activos (cada 100ms)
      const now = performance.now();
      if (g.boosts.changed || now - (this.cache.bt || 0) > 100) {
        this.cache.bt = now;
        this.renderBoosts(g);
      }
    }

    renderBoosts(g) {
      const B = g.boosts, cont = $('h-boosts');
      const keys = BB.BOOST_KEYS.filter((k) => B.isActive(k));
      const sig = keys.join(',') + '|' + B.tier + '|' + B.inventory.join(',');
      if (sig !== this.cache.bsig || B.changed) {
        this.cache.bsig = sig;
        B.changed = false;
        cont.innerHTML = keys.map((k) => '<div class="bst" data-k="' + k + '" style="--c:' + BB.Tex.BOOST_COLORS[k] + ';--p:1"><img alt="" src="' + BB.Tex.iconURL[k] + '">' + (k === 'multi' ? '<b>x' + BB.MULTI_LEVELS[B.tier] + '</b>' : '') + '</div>').join('');
        let inv = '<span class="lab">BOOSTS</span>';
        for (let i = 0; i < 3; i++) {
          const k = B.inventory[i];
          inv += '<button class="slot' + (k ? ' full' : '') + '" data-i="' + i + '" aria-label="' + (k ? 'Activar ' + BB.BOOSTS[k].name : 'Espacio vacío') + '">' + (k ? '<img alt="" src="' + BB.Tex.iconURL[k] + '">' : '') + '</button>';
        }
        $('h-inv').innerHTML = inv;
      }
      for (const el of cont.children) {
        const a = B.active[el.dataset.k];
        if (a) el.style.setProperty('--p', (a.t / a.max).toFixed(3));
      }
    }

    hint(on) { $('h-hint').hidden = !on; }

    banner(t1, t2, boss, dur) {
      const b = $('banner');
      b.className = 'banner' + (boss ? ' boss' : '');
      b.innerHTML = (boss ? '<div class="stripe"></div>' : '') + '<div class="t1 bin">' + t1 + '</div>' + (t2 ? '<div class="t2">' + t2 + '</div>' : '') + (boss ? '<div class="stripe"></div>' : '');
      b.hidden = false;
      clearTimeout(this.bannerT);
      this.bannerT = setTimeout(() => { b.hidden = true; }, (dur || 2) * 1000);
    }
    hideBanner() { clearTimeout(this.bannerT); $('banner').hidden = true; }

    // aviso grande en el menú (aterrizar / pérdida de bolsa)
    menuNotice(html, cls, ms) {
      const el = $('m-notice');
      el.className = 'mnotice ' + (cls || '');
      el.innerHTML = html; el.hidden = false;
      void el.offsetWidth;
      clearTimeout(this._mn); this._mn = setTimeout(() => { el.hidden = true; }, ms || 3200);
    }
    cashBurst(amount, cycle) {
      this.menuNotice('¡ATERRIZASTE! +' + U.fmt(amount) + '<small>' + (cycle ? 'CICLO ' + cycle + ': MÁS METEOROS Y MÁS MONEDAS · VOLVÉS AL NIVEL 1' : 'LAS MONEDAS YA ESTÁN A SALVO EN TU BILLETERA') + '</small>', 'gold', 4200);
      const el = $('m-coins'), end = this.game.save.data.coins, start = Math.max(0, end - amount), t0 = performance.now();
      const step = () => { const k = Math.min(1, (performance.now() - t0) / 900); el.textContent = U.fmt(Math.round(start + (end - start) * k)); if (k < 1) requestAnimationFrame(step); };
      step();
    }
    cupNote(txt, cls) {
      const el = document.getElementById('cup-note');
      if (!el) return;
      el.className = 'cupnote ' + (cls || ''); el.textContent = txt; el.hidden = false;
      clearTimeout(this._cn); this._cn = setTimeout(() => { el.hidden = true; }, 3200);
    }
    toast(txt, col, isNew) {
      const t = document.createElement('div');
      t.className = 'toast' + (isNew ? ' new' : '');
      if (col) t.style.setProperty('--c', col);
      t.innerHTML = isNew ? '<b>NUEVO</b>' + txt : txt;
      const box = $('toasts');
      box.appendChild(t);
      while (box.children.length > 3) box.removeChild(box.firstChild);
      setTimeout(() => { if (t.parentNode) t.parentNode.removeChild(t); }, 2400);
    }

    bossPhase(ph) { this.toast(ph >= 4 ? '¡FASE FINAL!' : 'FASE ' + ph, '#ff3355'); }

    hurt() { const h = $('fx-hurt'); h.classList.add('on'); setTimeout(() => h.classList.remove('on'), 60); }
    whiteFlash() { const h = $('fx-white'); h.classList.add('on'); setTimeout(() => h.classList.remove('on'), 80); }

    // ---------- pausa ----------
    showPause() {
      this.syncToggles();
      const g = this.game, from = g.state === BB.STATES.PAUSED ? g.pausedFrom : g.state;
      $('btn-quit').textContent = from === BB.STATES.PVP ? 'ABANDONAR DUELO (DERROTA)' : (g.cupMode ? 'TERMINAR PARTIDA (QUEDA ESTE PUNTAJE)' : g.inCampaign && g.bag > 0 ? 'ABANDONAR · PERDÉS LA BOLSA (' + U.fmt(g.bagValue()) + ')' : 'SALIR AL MENÚ');
      $('s-pause').querySelector('h2').textContent = g.softPause ? 'PAUSA · EL DUELO SIGUE' : 'PAUSA';
      $('s-pause').hidden = false; this.current = 's-pause';
    }
    hidePause() { $('s-pause').hidden = true; this.current = 's-hud'; }
    syncToggles() {
      const s = this.game.save.data.settings;
      for (const [id, k] of [['p-sound', 'sound'], ['p-music', 'music'], ['p-vib', 'vibration'], ['s-sound', 'sound'], ['s-music', 'music'], ['s-vib', 'vibration']]) $(id).classList.toggle('on', !!s[k]);
      for (const b of $('s-quality').children) b.classList.toggle('on', b.dataset.q === s.quality);
      $('s-sens').value = s.sensitivity; $('s-sensv').textContent = Number(s.sensitivity).toFixed(1);
    }

    // ---------- nivel completado ----------
    showComplete(r) {
      $('c-title').textContent = r.boss ? '¡BOSS DERROTADO!' : 'NIVEL COMPLETADO';
      $('c-sub').textContent = 'NIVEL ' + r.level + (r.boss ? ' · ' + r.bossName : '');
      let h = '<div class="row"><span>PUNTUACIÓN</span><b>' + U.fmt(r.score) + '</b></div>';
      h += '<div class="row gold"><span>MONEDAS DEL NIVEL</span><b>+' + U.fmt(r.coins) + '</b></div>';
      h += '<div class="row mint"><span>BONIFICACIONES</span><b>+' + U.fmt(r.bonusTotal) + '</b></div>';
      for (const b of r.bonuses) h += '<div class="row small"><span>' + b[0] + '</span><b>+' + U.fmt(b[1]) + '</b></div>';
      $('c-rows').innerHTML = h;
      const cx = $('c-xp');
      cx.hidden = !r.ship;
      if (r.ship) { const up = r.ship.ups && r.ship.ups.length; cx.classList.toggle('up', !!up); const np = up ? BB.SHIP.passives.filter((x) => r.ship.ups.indexOf(x.lvl) >= 0).map((x) => x.name.toUpperCase()) : []; cx.innerHTML = '<span>' + (up ? '¡NAVE NV ' + r.ship.lvl + '!' + (np.length ? ' · PASIVA: ' + np.join(', ') : '') : 'NAVE NV ' + r.ship.lvl) + '</span><span class="xpbar"><i style="width:' + Math.round(r.ship.frac * 100) + '%"></i></span><b>+' + U.fmt(Math.round(r.ship.xp)) + ' XP</b>'; }
      const coin = '<svg viewBox="0 0 24 24"><use href="#i-coin"/></svg>';
      $('c-bag').innerHTML = '<small>BOLSA EN RIESGO</small><div class="amt">' + coin + U.fmt(r.cash) + '</div>' +
        '<div class="calc">' + U.fmt(r.bag) + ' × <b>x' + r.mult.toFixed(2).replace(/0$/, '') + '</b>' + (r.mult > r.prevMult ? ' (subió de x' + r.prevMult.toFixed(2).replace(/0$/, '') + ')' : '') + '</div>' +
        '<div class="warn">Si seguís y perdés, perdés toda la bolsa. Aterrizar o perder te devuelve al nivel 1 y sube el ciclo (más meteoros y más monedas).</div>';
      $('c-risk').textContent = 'ARRIESGAR · SUBE A x' + r.nextMult.toFixed(2).replace(/0$/, '') + (r.mult >= BB.RISK.MAX ? ' (MÁX)' : '');
      $('btn-c-menu').innerHTML = 'ATERRIZAR <b>+' + U.fmt(r.cash) + '</b>';
      this.rewardOpts = r.rewards;
      this.rewardSel = -1;
      this.renderCards();
      this.show('s-complete');
      this.returnTo = 'complete';
    }
    shipRow(s, label) {
      return '<div class="row xp"><span>' + label + '</span><span class="xpbar"><i style="width:' + Math.round(s.frac * 100) + '%"></i></span><b>+' + U.fmt(Math.round(s.xp)) + ' XP</b></div>';
    }
    renderCards() {
      const inv = this.game.boosts.inventory.length;
      $('c-cards').innerHTML = this.rewardOpts.map((k, i) => '<button class="card' + (i === this.rewardSel ? ' sel' : '') + '" data-i="' + i + '"><img alt="" src="' + BB.Tex.iconURL[k] + '">' + BB.BOOSTS[k].name + '</button>').join('') +
        (inv >= 3 ? '' : '');
    }

    // ---------- game over ----------
    showOver(r) {
      $('o-record').hidden = !r.newRecord;
      const lb = $('o-lost');
      lb.hidden = !(r.lost > 0);
      if (r.lost > 0) lb.innerHTML = '<small>BOLSA PERDIDA</small><div class="amt">−' + U.fmt(r.lost) + '</div><p>Todo lo ganado en esta partida se perdió. Tu billetera sigue en ' + U.fmt(r.wallet) + '.</p>';
      $('o-cycle').innerHTML = (r.cycleUp ? '<b>CICLO ' + r.cycle + '</b> · más meteoros y más monedas. ' : '') + 'Volvés a empezar en el <b>nivel ' + r.start + '</b>.';
      $('btn-retry').textContent = 'EMPEZAR EN NIVEL ' + r.start;
      $('o-rows').innerHTML =
        '<div class="row"><span>PUNTUACIÓN</span><b>' + U.fmt(r.score) + '</b></div>' +
        '<div class="row"><span>NIVEL</span><b>' + r.level + '</b></div>' +
        '<div class="row gold"><span>MONEDAS A SALVO</span><b>0</b></div>' +
        '<div class="row"><span>RÉCORD</span><b>' + U.fmt(r.best) + '</b></div>' +
        (r.ship ? this.shipRow(r.ship, 'NAVE NV ' + r.ship.lvl + ' · NO SE PIERDE') : '');
      this.show('s-over');
      this.returnTo = 'over';
    }

    // ---------- tienda ----------
    openShop(from) {
      this.returnTo = from || 'menu';
      this.game.enterShop();
      this.renderShop();
      this.show('s-shop');
    }
    closeShop() {
      if (this.previewSkin) { this.previewSkin = null; this.game.onLoadoutChanged(); }
      this.game.exitShop();
      if (this.returnTo === 'complete') this.show('s-complete');
      else if (this.returnTo === 'over') this.show('s-over');
      else this.showMenu();
    }
    renderShop() {
      const g = this.game, sh = g.shop, d = g.save.data;
      $('shop-coins').textContent = U.fmt(d.coins);
      $('shop-tabs').innerHTML = sh.cats.map((c) => '<button class="tab' + (c.id === this.shopCat ? ' on' : '') + '" data-cat="' + c.id + '">' + c.name + '</button>').join('');
      const coin = '<svg viewBox="0 0 24 24"><use href="#i-coin"/></svg>', moon = '<svg viewBox="0 0 24 24"><use href="#i-moon"/></svg>';
      const cost = (st) => coin + U.fmt(st.price);
      const prem = this.shopCat === 'premium', skins = this.shopCat === 'skins';
      $('shop-mlchip').hidden = !prem && !skins;
      if (!skins && this.previewSkin) { this.previewSkin = null; g.onLoadoutChanged(); }   // fin de la prueba de skin
      $('shop-ml').textContent = U.fmt(g.premium.ml);
      const bar = (st) => st.max > 15
        ? '<div class="lvbar"><i style="width:' + Math.round(st.level / st.max * 100) + '%"></i><span>NIVEL ' + st.level + ' / ' + st.max + '</span></div>'
        : '<div class="pips">' + Array.from({ length: st.max }, (_, i) => '<i class="' + (i < st.level ? 'on' : '') + '"></i>').join('') + '</div>';
      if (prem) {
        // PREMIUM de campaña: solo con Monedas Lunares, permanente
        let h = '<p class="cupinfo preminfo">Mejoras <b>permanentes</b> para la campaña. Se activan solo con <b>Monedas Lunares</b>. No valen en la Copa Semanal ni en el duelo.</p>';
        h += BB.PREMIUM.items.map((it) => {
          const st = g.premium.state(it);
          const btn = st.maxed ? '<button class="buy done">ACTIVO</button>' : '<button class="buy ml' + (st.affordable ? '' : ' no') + '" data-prem="' + it.id + '">' + moon + U.fmt(st.price) + '</button>';
          return '<div class="item prem' + (st.level ? ' eq' : '') + '"><div class="sw mlsw">' + it.ic + '</div><div class="inf"><div class="nm">' + it.name + '</div><div class="ds">' + it.desc + '</div>' + (it.max > 1 ? bar(st) : '') + '</div>' + btn + '</div>';
        }).join('');
        h += this.returnTo === 'menu'
          ? '<button class="btn small getml" id="shop-getml">' + moon + ' CONSEGUIR MONEDAS LUNARES</button>'
          : '<p class="empty">Las Monedas Lunares se consiguen desde el menú: COPA → MONEDAS LUNARES.</p>';
        $('shop-items').innerHTML = h;
        return;
      }
      const row = (it) => {
        const st = sh.state(it);
        let btn, extra = '', eq = false;
        if (it.kind === 'equip') {
          if (st.equipped) { btn = '<button class="buy done" data-buy="' + it.id + '">EQUIPADO</button>'; eq = true; }
          else if (st.owned) btn = '<button class="buy eqb" data-buy="' + it.id + '">EQUIPAR</button>';
          else if (st.ml) btn = '<button class="buy ml' + (st.affordable ? '' : ' no') + '" data-buy="' + it.id + '">' + moon + U.fmt(st.price) + '</button>';
          else btn = '<button class="buy' + (st.affordable ? '' : ' no') + '" data-buy="' + it.id + '">' + cost(st) + '</button>';
          if (it.slot === 'skin') {
            const tags = (it.cc && it.cc === mine ? '<em class="tag">TU PAÍS</em>' : '') + (this.previewSkin === it.val && !st.equipped ? '<em class="tag try">PROBANDO</em>' : '');
            return '<div class="item skin' + (eq ? ' eq' : '') + (st.ml ? ' paid' : '') + (this.previewSkin === it.val ? ' trying' : '') + '" data-skin="' + it.val + '"><div class="sw' + (it.cc ? ' flag' : '') + '" style="' + this.swatch(it) + '"></div><div class="inf"><div class="nm">' + it.name + tags + '</div><div class="ds">' + it.desc + '</div></div>' + btn + '</div>';
          }
        } else {
          extra = bar(st);
          if (it.core && st.maxed && !g.premium.hasCore()) extra += '<div class="corehint">★ Con el Núcleo de Poder (PREMIUM) sube hasta nivel 50</div>';
          btn = st.maxed ? '<button class="buy done" data-buy="' + it.id + '">MÁX</button>' : '<button class="buy' + (st.affordable ? '' : ' no') + '" data-buy="' + it.id + '">' + cost(st) + '</button>';
        }
        return '<div class="item' + (eq ? ' eq' : '') + '"><div class="sw" style="' + this.swatch(it) + '">' + this.swLabel(it) + '</div><div class="inf"><div class="nm">' + it.name + '</div><div class="ds">' + it.desc + '</div>' + extra + '</div>' + btn + '</div>';
      };
      const mine = g.rank && g.rank.prof ? g.rank.prof.country : null;
      const list = sh.list(this.shopCat);
      if (!skins) { $('shop-items').innerHTML = list.map(row).join(''); return; }
      // SKINS: clásicas (monedas del juego), países y especiales (Monedas Lunares). Tocar una skin la prueba en la nave.
      const head = (t, s) => '<div class="shead"><b>' + t + '</b><small>' + s + '</small></div>';
      const countries = list.filter((i) => i.group === 'country').sort((a, b) => (b.cc === mine) - (a.cc === mine) || sh.state(b).owned - sh.state(a).owned || a.name.localeCompare(b.name, 'es'));
      let h = '<p class="cupinfo preminfo">Las skins solo cambian el aspecto de la nave y se ven en la campaña, la copa y el duelo. <b>Tocá una skin para probarla</b> antes de comprarla.</p>';
      h += head('PAÍSES', moon + BB.SKIN_ML.country + ' cada una') + countries.map(row).join('');
      h += head('ESPECIALES', moon + BB.SKIN_ML.special + ' cada una') + list.filter((i) => i.group === 'special').map(row).join('');
      h += head('CLÁSICAS', 'con monedas del juego') + list.filter((i) => !i.group).map(row).join('');
      h += this.returnTo === 'menu'
        ? '<button class="btn small getml" id="shop-getml">' + moon + ' CONSEGUIR MONEDAS LUNARES</button>'
        : '<p class="empty">Las Monedas Lunares se consiguen desde el menú: COPA → MONEDAS LUNARES.</p>';
      $('shop-items').innerHTML = h;
    }
    // probar una skin en la nave de la tienda sin comprarla
    trySkin(val) {
      const g = this.game;
      if (!BB.Models.SKINS[val]) return;
      this.previewSkin = val === g.stats.skin ? null : val;
      g.player.rebuild(this.previewSkin || g.stats.skin, g.stats.cannon);
      this.renderShop();
    }
    swatch(it) {
      const c = (a) => 'rgb(' + a.map((v) => Math.round(Math.min(1, v) * 255)).join(',') + ')';
      if (it.slot === 'skin') {
        const s = BB.Models.SKINS[it.val];
        const fu = s.cc && BB.Tex.flagURL[s.cc];
        if (fu) return 'background:#fff url(' + fu + ') center/cover no-repeat;box-shadow:inset 0 0 0 1px rgba(255,255,255,.55)';
        if (s.left) return 'background:linear-gradient(90deg,' + c(s.left) + ' 0 33.3%,' + c(s.hull) + ' 33.3% 66.6%,' + c(s.right) + ' 66.6%);box-shadow:inset 0 0 0 2px ' + c(s.accent) + ',inset 0 -9px 0 2px ' + c(s.dark);
        return 'background:linear-gradient(135deg,' + c(s.hull) + ',' + c(s.dark) + ');box-shadow:inset 0 0 0 3px ' + c(s.accent);
      }
      if (it.slot === 'bullet') { const b = BB.BULLET_TYPES[it.val]; return 'background:radial-gradient(circle,#fff 0 18%,' + c(b.color) + ' 40%,rgba(0,0,0,.3) 75%)'; }
      const map = { cannons: '#3be8ff', shields: '#5ca8ff', minis: '#5cff9d' };
      return 'background:rgba(255,255,255,.06);border:1.5px solid ' + (map[it.cat] || '#fff') + ';color:' + (map[it.cat] || '#fff');
    }
    swLabel(it) {
      if (it.slot === 'skin' || it.slot === 'bullet') return '';
      const m = { cannon_blaster: 'I', cannon_twin: 'II', cannon_titan: 'T', cannon_nova: 'N', up_power: '⚔', up_rate: '»', up_shield: '+', up_invuln: '◆', up_bubble: '○', up_squadCount: '▲', up_squadTime: '⏱', up_squadBounce: '↯' };
      return m[it.id] || '•';
    }

    // ---------- ajustes / info / récords ----------
    openSettings() {
      this.syncToggles();
      // dentro de la app de Android: versión instalada y buscar actualizaciones
      const app = window.RompeApp;
      $('s-app').hidden = !app;
      if (app) { try { $('s-appv').textContent = app.version(); } catch (e) { /* */ } }
      this.show('s-settings');
    }
    back() { this.showMenu(); }
    openRecords() {
      const d = this.game.save.data, s = d.stats;
      const t = (l, v, hl) => '<div class="stat' + (hl ? ' hl' : '') + '"><small>' + l + '</small><b>' + v + '</b></div>';
      $('rec-grid').innerHTML = t('MEJOR PUNTUACIÓN', U.fmt(d.best), true) + t('NIVEL MÁXIMO', s.maxLevel) + t('BOSSES DERROTADOS', s.bosses) +
        t('ENEMIGOS DESTRUIDOS', U.fmt(s.kills)) + t('MONEDAS GANADAS', U.fmt(s.coinsTotal)) + t('MEJOR ATERRIZAJE', U.fmt(s.bestCash || 0)) + t('CICLO MÁXIMO', s.maxCycle || 0) + t('MEJOR PUNTAJE EN COPA', U.fmt(s.cupBest || 0)) + t('MONEDAS PERDIDAS', U.fmt(s.coinsLost || 0)) + t('PARTIDAS', s.games) + t('NIVEL DESBLOQUEADO', d.unlocked);
      this.show('s-records');
    }
    openInfo() { this.show('s-info'); }
    buildInfo() {
      const dot = (c) => '<span class="dot" style="background:radial-gradient(circle at 35% 30%,#fff 0,' + c + ' 35%,#000 120%)"></span>';
      const ic = (k) => '<img alt="" src="' + (BB.Tex.iconURL[k] || '') + '">';
      let h = '<div class="sect"><h3>CÓMO JUGAR</h3><p>Arrastrá el dedo en cualquier parte de la pantalla para mover el cañón de izquierda a derecha. El disparo es automático.</p><p>Destruí los meteoritos antes de que te golpeen. Los grandes se parten en piezas más chicas. Juntá monedas, activá boosts y derrotá al BOSS cada 5 niveles.</p><p><b>Bolsa en riesgo:</b> las monedas que ganás en la campaña van a una bolsa. Al terminar cada nivel elegís: <b>ATERRIZAR</b> (las monedas pasan a tu billetera) o <b>SEGUIR</b>, y el multiplicador sube (+0.15 por nivel, +0.5 por boss, hasta x5). Si perdés o abandonás, la bolsa se pierde entera.</p><p><b>Premium (Monedas Lunares):</b> en TIENDA → ★ PREMIUM podés activar mejoras permanentes para la campaña: la <b>Escolta</b> de mini naves, el <b>Escudo de emergencia</b> (botón extra: 15 s de escudo cada minuto) y el <b>Núcleo de Poder</b> (Potencia y Cadencia hasta nivel 50 + Lanzallamas Zigzag).</p><p><b>Nivel de nave:</b> tu nave gana experiencia en la campaña y nunca la pierde. Cada nivel le suma +4% de daño al Lanzallamas Zigzag y, al subir, se activan solas las <b>pasivas</b> (gratis): Esquivar (nv 3), Destello (nv 6), Parpadeo (nv 10), Imán (nv 14), Segunda llama (nv 18), Blindaje (nv 22), Última chance (nv 26) y Destello helado (nv 30). Miralas tocando la barra NAVE del menú.</p><p><b>Skins:</b> en TIENDA → SKINS hay naves con los colores de cada país y skins especiales (con Monedas Lunares), además de las clásicas con monedas del juego. Solo cambian el aspecto; tocá una para probarla antes de comprar.</p><p><b>Arsenal:</b> armá un set de 3 armas especiales (ofensivas, de control, de defensa o de economía) que se compran y mejoran con monedas del juego. Cada una se usa 1 vez por tramo con los botones de la derecha (o las teclas 1, 2 y 3) y se recargan al vencer al boss.</p><p><b>Ranking:</b> tu mejor recorrido de campaña compite en el top 100 global, de tu continente, tu país y tu ciudad.</p><p><b>Ciclos:</b> aterrizar o perder te devuelve al nivel 1 y sube el ciclo: cada ciclo trae +25% de meteoros, +20% de monedas y un poco más de vida en los enemigos. Si ya venciste un boss, podés usar el atajo y arrancar después de él, con el multiplicador en x0.8.</p><p>En PC: arrastrá con el mouse o usá ← → / A D. Pausa con P o Esc.</p></div>';
      h += '<div class="sect"><h3>METEORITOS</h3>' +
        '<div class="li">' + dot('#a08070') + '<span><b>Normal.</b> Roca clásica, se divide al destruirse.</span></div>' +
        '<div class="li">' + dot('#9aa8c0') + '<span><b>Blindado.</b> Recibe menos daño por disparo.</span></div>' +
        '<div class="li">' + dot('#ff6a2b') + '<span><b>Explosivo.</b> Al estallar daña a todo lo cercano.</span></div>' +
        '<div class="li">' + dot('#3be8ff') + '<span><b>Eléctrico.</b> Descarga rayos en cadena sobre otros enemigos.</span></div>' +
        '<div class="li">' + dot('#b36bff') + '<span><b>Cristal.</b> Se parte en 3 fragmentos.</span></div>' +
        '<div class="li">' + dot('#8a3a20') + '<span><b>Gigante.</b> Enorme, lento y se divide en 3 grandes.</span></div></div>';
      h += '<div class="sect"><h3>ALIENS</h3>' +
        '<div class="li">' + dot('#5cff9d') + '<span><b>Alien.</b> Patrulla y dispara ácido.</span></div>' +
        '<div class="li">' + dot('#ffc83d') + '<span><b>Rápido.</b> Se lanza en picada hacia vos.</span></div>' +
        '<div class="li">' + dot('#b36bff') + '<span><b>Tanque.</b> Mucha vida y orbes pesados.</span></div>' +
        '<div class="li">' + dot('#ff3355') + '<span><b>Shooter.</b> Ráfagas triples apuntadas.</span></div></div>';
      h += '<div class="sect"><h3>BOOSTS</h3>' + BB.BOOST_KEYS.map((k) => '<div class="li">' + ic(k) + '<span><b>' + BB.BOOSTS[k].name + '.</b> ' + BB.BOOSTS[k].desc + '.</span></div>').join('') +
        '<p style="margin-top:8px">Al completar un nivel podés guardar un boost opcional. Aparece abajo a la derecha: tocalo cuando quieras activarlo.</p></div>';
      h += '<div class="sect"><h3>BOSSES</h3>' + BB.BOSS_DEFS.map((b, i) => '<div class="li">' + dot('rgb(' + b.color.map((v) => Math.round(v * 255)).join(',') + ')') + '<span><b>Nivel ' + (i + 1) * 5 + ' · ' + b.name + '.</b> ' + ['Lluvia de meteoritos, ondas de choque y ataques laterales.', 'Torretas, misiles, drones y rayos láser.', 'Genera aliens, escupe ácido y huevos explosivos.', 'Curva la trayectoria de todo y te atrae hacia su centro.', 'Combina las mecánicas de todos los anteriores.'][i] + '</span></div>').join('') +
        '<p style="margin-top:8px">Cada boss tiene 4 fases (100%, 70%, 40% y 15% de vida). En la fase final cambia la música y la iluminación.</p></div>';
      h += '<div class="sect"><h3>DUELO 1 VS 1</h3><p>Peleás directamente contra otro jugador: vos abajo, tu rival arriba. Esquivá sus disparos, usá los meteoritos del centro como cobertura y juntá los boosts que caen. Gana quien destruye el cañón del otro o, al terminar los 90 segundos, quien tiene más vida.</p><p>Online sube o baja tus trofeos según el rival (estilo Elo). Hay 7 ligas: Bronce, Plata, Oro, Platino, Diamante, Maestro y Leyenda; al ascender ganás monedas. Contra la IA entrenás sin arriesgar trofeos.</p></div>';
      h += '<div class="sect"><h3>PUNTUACIÓN</h3><p>Meteorito pequeño +100 · mediano +250 · grande +500 · alien +750 · boss +10.000. Destruí enemigos seguidos para subir el COMBO hasta x5.</p></div>';
      $('info-body').innerHTML = h;
    }
  }
  BB.UIManager = UIManager;
})(window.BB);
