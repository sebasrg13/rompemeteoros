/* managers/PvPManager.js — DUELO 1 VS 1: emparejamiento online (rápido o con código), IA de entrenamiento,
 * oleadas idénticas por semilla, ataques entre jugadores, trofeos (Elo) y ligas.
 */
(function (BB) {
  'use strict';
  const U = BB.U;
  const $ = (id) => document.getElementById(id);

  BB.LEAGUES = [
    { id: 'bronze', name: 'BRONCE', min: 0, color: '#d08a4e', reward: 0 },
    { id: 'silver', name: 'PLATA', min: 300, color: '#c7d2ea', reward: 300 },
    { id: 'gold', name: 'ORO', min: 700, color: '#ffc83d', reward: 600 },
    { id: 'plat', name: 'PLATINO', min: 1200, color: '#4ff0dc', reward: 1000 },
    { id: 'diamond', name: 'DIAMANTE', min: 1800, color: '#6fb6ff', reward: 1600 },
    { id: 'master', name: 'MAESTRO', min: 2500, color: '#c46bff', reward: 2500 },
    { id: 'legend', name: 'LEYENDA', min: 3500, color: '#ff4d6a', reward: 4000 },
  ];
  const DURATION = 90;
  const CODE_CHARS = 'ACDEFHJKMNPRTUVWXY34679';

  function leagueOf(tr) { let L = 0; for (let i = 0; i < BB.LEAGUES.length; i++) if (tr >= BB.LEAGUES[i].min) L = i; return L; }
  BB.leagueOf = leagueOf;
  function hash(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // Cambio de trofeos tipo Elo (K=40), con mínimos para que cada victoria cuente
  function trophyDelta(me, opp, S) {
    const E = 1 / (1 + Math.pow(10, (opp - me) / 400));
    let d = Math.round(40 * (S - E));
    if (S === 1) d = Math.max(12, d);
    if (S === 0) d = Math.min(-8, d);
    return d;
  }
  BB.trophyDelta = trophyDelta;

  // ---------- Rival IA (entrenamiento, sin trofeos): un cañón que apunta, esquiva y dispara ----------
  class BotOpponent {
    constructor(tr) {
      this.skill = U.clamp(0.7 + tr / 2600, 0.7, 1.5);
      const names = ['NOVA-7', 'ORION', 'KESTREL', 'VEGA-X', 'PULSAR', 'ATLAS-3'];
      this.name = 'IA · ' + U.pick(names);
      this.tr = Math.max(0, tr + U.randi(-60, 60));
      this.skin = U.pick(['crimson', 'phantom', 'venom', 'solar']);
      this.cannon = U.pick(['blaster', 'twin', 'titan', 'nova']);
      this.reset();
    }
    reset() { this.x = 0; this.tx = 0; this.hp = 100; this.thinkT = 0; this.boosts = {}; this.tier = 0; }
    has(k) { return (this.boosts[k] || 0) > 0; }
    give(k) { this.boosts[k] = 10; if (k === 'multi') this.tier = Math.min(4, this.tier + 1); }
    // x en el marco de ESTE jugador (el bot está arriba)
    update(dt, pvp) {
      const g = pvp.game, me = g.player;
      for (const k in this.boosts) { this.boosts[k] -= dt; if (k === 'multi' && this.boosts[k] <= 0) this.tier = 0; }
      this.thinkT -= dt;
      if (this.thinkT <= 0) {
        this.thinkT = U.rand(0.25, 0.6) / this.skill;
        // apuntar al jugador con error
        this.tx = U.clamp(me.x + U.rand(-1.6, 1.6) / this.skill, -3.7, 3.7);
        // esquivar balas que vienen hacia él
        for (const b of g.bullets.pb) {
          if (!b.alive || b.y < pvp.RY - 7) continue;
          if (Math.abs(b.x - this.x) < 0.9 && Math.random() < 0.55 * this.skill) { this.tx = U.clamp(this.x + (b.x > this.x ? -1.8 : 1.8), -3.7, 3.7); break; }
        }
      }
      this.x = U.damp(this.x, this.tx, 5 * this.skill, dt);
      return { x: this.x, hp: this.hp, alive: this.hp > 0, fr: 5.2 * this.skill * (this.has('rapid') ? 1.6 : 1), n: BB.MULTI_LEVELS[this.tier], big: this.has('big'), dmg: 1, dm: this.has('damage') ? 1.5 : 1, bt: 'solar', sh: this.has('shield'), done: this.hp <= 0 || pvp.matchT >= DURATION, skin: this.skin, cn: this.cannon };
    }
  }

  class PvPManager {
    constructor(game) {
      this.game = game;
      this.net = game.net;
      this.phase = 'lobby';
      this.mode = null;
      this.round = 0;
      this.history = [];
      this.searchT = 0;
      this.hudCache = {};
    }

    get data() {
      const d = this.game.save.data;
      if (!d.pvp || typeof d.pvp !== 'object') d.pvp = {};
      const p = d.pvp;
      for (const [k, v] of Object.entries({ trophies: 0, best: 0, wins: 0, losses: 0, draws: 0, streak: 0, rewarded: 0, history: [] })) if (p[k] === undefined) p[k] = v;
      return p;
    }
    inMatch() { return this.game.state === BB.STATES.PVP; }
    isOnlineMatch() { return this.mode === 'online' && (this.phase === 'match' || this.phase === 'ending'); }

    // ================= UI: lobby =================
    initUI() {
      const g = this.game;
      const on = (id, fn) => {
        const el = $(id);
        if (el) el.addEventListener('click', (e) => { e.stopPropagation(); g.audio.unlock(); g.audio.sfx('click'); try { fn(e); } catch (err) { BB.reportError('pvp-ui:' + id, err); } });
      };
      on('btn-pvp', () => this.openLobby());
      on('pvp-back', () => this.closeLobby());
      on('pvp-quick', () => this.quickMatch());
      on('pvp-friend', () => { $('pvp-codebox').hidden = !$('pvp-codebox').hidden; });
      on('pvp-create', () => this.createCode());
      on('pvp-join', () => this.joinCode(($('pvp-code-in').value || '').toUpperCase().replace(/[^A-Z0-9]/g, '')));
      on('pvp-bot', () => this.startBot());
      on('search-cancel', () => this.cancelSearch());
      on('search-bot', () => { this.cancelSearch(); this.startBot(); });
      on('res-rematch', () => this.requestRematch());
      on('res-new', () => { this.leaveMatch(); this.openLobby(); if (this.mode === 'online') this.quickMatch(); });
      on('res-menu', () => { this.leaveMatch(); this.game.toMenu(); });
      $('pvp-code-in').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('pvp-join').click(); });
      this.net.onChange(() => { if (this.game.state === BB.STATES.PVP_LOBBY) this.renderLobby(); });
      this.syncMenuChip();
    }

    syncMenuChip() {
      const el = $('m-trophies');
      if (el) el.textContent = U.fmt(this.data.trophies);
    }

    openLobby() {
      const g = this.game;
      if (g.state !== BB.STATES.PVP_LOBBY) g.setState(BB.STATES.PVP_LOBBY);
      if (g.world.camMode !== 'menu') g.enterMenuScene();
      this.phase = 'lobby';
      $('pvp-codebox').hidden = true;
      $('s-search').hidden = true;
      this.renderLobby();
      g.ui.show('s-pvp');
    }
    closeLobby() { this.cancelSearch(); this.game.toMenu(); }

    netStatus() {
      const n = this.net;
      if (!n.available) return { ok: false, cls: 'off', txt: n.status === 'connecting' ? 'Conectando al servidor de duelos…' : 'Online no disponible en esta vista. Abrí el juego desde claude.ai con tu sesión iniciada para jugar contra amigos. Podés entrenar contra la IA.' };
      if (!n.connected) return { ok: false, cls: 'wait', txt: 'Conectando…' };
      const c = n.peers.length;
      return { ok: true, cls: 'on', txt: 'EN LÍNEA · ' + (c === 0 ? 'nadie más conectado ahora' : c + (c === 1 ? ' jugador conectado' : ' jugadores conectados')) };
    }

    leagueBadge(i, size) {
      const L = BB.LEAGUES[i];
      return '<span class="crest" style="--lc:' + L.color + ';--s:' + (size || 44) + 'px"><b>' + (i + 1) + '</b></span>';
    }

    renderLobby() {
      const p = this.data, tr = p.trophies, li = leagueOf(tr), L = BB.LEAGUES[li], next = BB.LEAGUES[li + 1];
      $('pvp-tr').textContent = U.fmt(tr);
      const prog = next ? (tr - L.min) / (next.min - L.min) : 1;
      $('pvp-league').innerHTML = this.leagueBadge(li, 64) +
        '<div class="lg-inf"><small>LIGA</small><b style="color:' + L.color + '">' + L.name + '</b>' +
        '<div class="lg-bar"><i style="width:' + Math.round(prog * 100) + '%;background:' + L.color + '"></i></div>' +
        '<span>' + (next ? U.fmt(next.min - tr) + ' trofeos para ' + next.name : 'Liga máxima alcanzada') + '</span></div>' +
        '<div class="lg-rec"><div><b>' + p.wins + '</b><small>V</small></div><div><b>' + p.losses + '</b><small>D</small></div><div><b>' + p.draws + '</b><small>E</small></div></div>';
      const ns = this.netStatus();
      $('pvp-net').className = 'netline ' + ns.cls;
      $('pvp-net').textContent = ns.txt;
      $('pvp-quick').disabled = !ns.ok; $('pvp-friend').disabled = !ns.ok;
      // jugadores en la sala
      const n = this.net;
      const rows = [{ me: true, name: 'Vos', tr, st: 'idle' }].concat(n.peers.map((pe) => ({ name: n.nameOf(pe), tr: +pe.presence.tr || 0, st: pe.presence.st || 'idle', guest: pe.guest })));
      rows.sort((a, b) => b.tr - a.tr);
      const stTxt = { idle: 'en menú', queue: 'buscando rival', code: 'esperando amigo', pair: 'emparejando', match: 'en duelo', post: 'en resultados' };
      $('pvp-room').innerHTML = rows.map((r, i) => '<div class="rk' + (r.me ? ' me' : '') + '"><span class="pos">' + (i + 1) + '</span>' + this.leagueBadge(leagueOf(r.tr), 28) +
        '<span class="nm">' + esc(r.name) + (r.guest ? ' <em>invitado</em>' : '') + '<small>' + (r.me ? 'tu cuenta' : stTxt[r.st] || '') + '</small></span><b>' + U.fmt(r.tr) + '</b></div>').join('') +
        (n.peers.length ? '' : '<p class="empty">' + (n.available ? 'Cuando tus amigos abran este mismo juego aparecen acá. Compartilo desde el menú Share de la página.' : 'La lista se llena cuando el juego está abierto online.') + '</p>');
      $('pvp-leagues').innerHTML = BB.LEAGUES.map((l, i) => '<div class="lgrow' + (i === li ? ' cur' : '') + '">' + this.leagueBadge(i, 30) + '<span style="color:' + l.color + '">' + l.name + '</span><small>' + U.fmt(l.min) + '+</small><em>' + (l.reward ? '+' + U.fmt(l.reward) + ' monedas' : 'inicial') + '</em></div>').join('');
      const h = p.history || [];
      $('pvp-hist').innerHTML = h.length ? h.slice(0, 8).map((x) => '<div class="hs ' + x.r + '"><b>' + ({ w: 'VICTORIA', l: 'DERROTA', d: 'EMPATE' }[x.r]) + '</b><span>' + esc(x.opp) + '<small>' + U.fmt(x.sc) + ' – ' + U.fmt(x.os) + '</small></span><em>' + (x.bot ? 'IA' : (x.dt >= 0 ? '+' : '') + x.dt + ' 🏆') + '</em></div>').join('') : '<p class="empty">Todavía no jugaste duelos.</p>';
    }

    // ================= Emparejamiento =================
    basePresence() {
      const d = this.data;
      return { app: 'bb3d', v: 1, tr: d.trophies, lg: leagueOf(d.trophies), nick: (this.net.myName || '').slice(0, 18), uid: this.net.myId || null };
    }

    quickMatch() {
      if (!this.net.available || !this.net.connected) { this.game.ui.toast('Sin conexión online', '#ff3355'); return; }
      this.mode = 'online';
      this.phase = 'search';
      this.searchKind = 'queue';
      this.since = Date.now();
      this.searchT = 0;
      this.net.publish(Object.assign(this.basePresence(), { st: 'queue', since: this.since, code: null, opp: null, mid: null, ready: false, rm: false }), true);
      this.showSearch('BUSCANDO RIVAL…', null);
    }
    createCode() {
      if (!this.net.available) return;
      let c = '';
      for (let i = 0; i < 4; i++) c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
      this.joinCode(c, true);
    }
    joinCode(code, created) {
      if (!code || code.length < 4) { this.game.ui.toast('Ingresá un código de 4 caracteres', '#ffc83d'); return; }
      if (!this.net.available || !this.net.connected) { this.game.ui.toast('Sin conexión online', '#ff3355'); return; }
      this.mode = 'online';
      this.phase = 'search';
      this.searchKind = 'code';
      this.code = code.slice(0, 6);
      this.since = Date.now();
      this.searchT = 0;
      this.net.publish(Object.assign(this.basePresence(), { st: 'code', code: this.code, since: this.since, opp: null, mid: null, ready: false, rm: false }), true);
      this.showSearch(created ? 'ESPERANDO A TU AMIGO…' : 'BUSCANDO A TU AMIGO…', this.code);
    }
    showSearch(title, code) {
      $('s-search').hidden = false;
      $('search-title').textContent = title;
      $('search-code').hidden = !code;
      if (code) $('search-codev').textContent = code;
      $('search-bot').hidden = true;
      $('search-time').textContent = '0:00';
    }
    cancelSearch() {
      if (this.phase === 'search' || this.phase === 'pairing') this.net.publish({ st: 'idle', opp: null, mid: null, code: null }, true);
      this.phase = 'lobby';
      const s = $('s-search'); if (s) s.hidden = true;
    }

    // Llamado cada frame
    tick(dt) {
      if (!this.net.available) return;
      this.net.flush();
      if (this.phase === 'search') this.tickSearch(dt);
      else if (this.phase === 'pairing') this.tickPairing(dt);
      else if (this.phase === 'result' && this.mode === 'online') this.tickRematch(dt);
    }

    tickSearch(dt) {
      this.searchT += dt;
      const s = Math.floor(this.searchT);
      $('search-time').textContent = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
      if (this.searchT > 12) $('search-bot').hidden = false;
      const n = this.net;
      if (!n.myPeer) return;
      const mine = { peer: n.myPeer, since: this.since };
      const cands = n.peers.filter((p) => {
        const pr = p.presence;
        if (pr.st === 'pair' && pr.opp === n.myPeer) return true; // ya me eligió
        if (pr.st !== this.searchKind) return false;
        return this.searchKind === 'queue' || pr.code === this.code;
      }).map((p) => ({ peer: p.peer, since: +p.presence.since || 0 }));
      const chosen = n.peers.find((p) => p.presence.st === 'pair' && p.presence.opp === n.myPeer && (this.searchKind === 'queue' || p.presence.code === this.code));
      if (chosen) cands.length = 0, cands.push({ peer: chosen.peer, since: +chosen.presence.since || 0 });
      const list = cands.concat([mine]).sort((a, b) => (a.since - b.since) || (a.peer < b.peer ? -1 : 1));
      const idx = list.findIndex((x) => x.peer === n.myPeer);
      const partner = list[idx % 2 === 0 ? idx + 1 : idx - 1];
      if (!partner) return;
      const mid = [n.myPeer, partner.peer].sort().join('.');
      this.phase = 'pairing';
      this.pairT = 0;
      this.oppPeer = partner.peer;
      this.mid = mid;
      n.publish({ st: 'pair', opp: partner.peer, mid }, true);
    }

    tickPairing(dt) {
      const n = this.net;
      this.pairT += dt;
      const p = n.peer(this.oppPeer);
      if (p && (p.presence.st === 'pair' || p.presence.st === 'match') && p.presence.opp === n.myPeer && p.presence.mid === this.mid) {
        this.round = 1;
        this.beginVersus({ name: n.nameOf(p), tr: +p.presence.tr || 0, peer: p.peer });
        return;
      }
      if (this.pairT > 4 || !p) {
        // el rival eligió a otro: volver a la cola
        this.phase = 'search';
        n.publish({ st: this.searchKind, opp: null, mid: null }, true);
      }
    }

    // ================= Versus + cuenta regresiva =================
    beginVersus(opp) {
      const g = this.game;
      this.opp = opp;
      this.phase = 'versus';
      $('s-search').hidden = true;
      const me = this.data.trophies;
      const card = (name, tr, you) => '<div class="vs-card' + (you ? ' you' : '') + '">' + this.leagueBadge(leagueOf(tr), 58) + '<b>' + esc(name) + '</b><span>' + BB.LEAGUES[leagueOf(tr)].name + ' · ' + U.fmt(tr) + ' 🏆</span></div>';
      $('vs-cards').innerHTML = card('VOS', me, true) + '<div class="vs-x">VS</div>' + card(opp.name, opp.tr, false);
      const win = trophyDelta(me, opp.tr, 1), loss = trophyDelta(me, opp.tr, 0);
      $('vs-stakes').textContent = this.mode === 'online' ? 'Ganás +' + win + ' · Perdés ' + loss + ' trofeos' : 'Entrenamiento: no se juegan trofeos';
      g.ui.show('s-vs');
      g.audio.sfx('siren');
      this.seed = hash((this.mid || 'bot' + Math.random()) + ':' + this.round);
      if (this.mode === 'online') this.net.publish({ st: 'match', mid: this.mid, opp: opp.peer, r: this.round, sc: 0, sh: 3, x: 0, atk: 0, alive: true, done: false, rm: false }, true);
      let c = 3;
      $('vs-count').textContent = c;
      clearInterval(this.cdTimer);
      this.cdTimer = setInterval(() => {
        c--;
        if (c > 0) { $('vs-count').textContent = c; g.audio.sfx('click'); }
        else { clearInterval(this.cdTimer); this.startMatch(); }
      }, 900);
    }

    startBot() {
      this.mode = 'bot';
      this.bot = new BotOpponent(this.data.trophies);
      this.mid = null;
      this.round++;
      this.beginVersus({ name: this.bot.name, tr: this.bot.tr, peer: null });
    }

    // ================= Partida: combate directo =================
    // Cada jugador se ve abajo y ve al rival arriba (espejado). Cada uno es la autoridad sobre
    // el daño que RECIBE: simula las balas del rival con los datos que el rival publica.
    startMatch() {
      const g = this.game;
      if (this.mode === 'bot') { if (!this.bot) this.bot = new BotOpponent(this.data.trophies); this.bot.reset(); }
      g.startPvpArena();
      this.RY = 15.2;
      this.phase = 'match';
      this.matchT = 0;
      this.myHP = 100;
      this.rival = { x: 0, rx: 0, hp: 100, alive: true, fireT: 1.2, flash: 0, recoil: 0, fr: 7, n: 1, big: false, dmg: 1, dm: 1, bt: 'plasma', sh: false, done: false };
      this.oppState = { hp: 100, alive: true, done: false };
      this.lastOppSeen = performance.now();
      this.myDone = false; this.endT = 0; this.result = null;
      this.dealt = 0; this.taken = 0;
      this.koT = 0;
      this.obsRng = U.seeded((this.seed || 7) ^ 0x9e37);
      this.boostRng = U.seeded((this.seed || 7) ^ 0x51ab);
      this.obsT = [0.6, 2.2, 3.8];
      this.obs = [null, null, null];
      this.boostT = 7;
      this.ensureRivalNode();
      this.rivalNode.visible = true;
      this.hudCache = {};
      $('h-rival').hidden = false;
      $('h-timer').hidden = false;
      g.ui.banner('¡A PELEAR!', this.mode === 'bot' ? 'ENTRENAMIENTO VS IA' : 'DESTRUÍ EL CAÑÓN DE TU RIVAL', false, 1.6);
    }

    ensureRivalNode() {
      if (this.rivalNode) return;
      const g = this.game;
      const n = new BB.Node();
      n.boundR = 2;
      this.rivalMat = BB.mat({ spec: 0.9, shin: 38, rim: [1, 0.35, 0.45, 0.8], glow: 1.2 });
      this.rvBase = n.add(new BB.Node(null, this.rivalMat));
      this.rvTurret = n.add(new BB.Node(null, this.rivalMat));
      this.rvBarrel = n.add(new BB.Node(null, this.rivalMat));
      this.rvBarrel.pz = 0.72; this.rvBarrel.py = 0.25;
      this.rvBubble = n.add(new BB.Node(BB.Models.geo.bubble, BB.mat({ color: [1, 0.3, 0.5], spec: 0, glow: 0, rim: [1, 0.4, 0.6, 1.6], blend: 2, opacity: 0.35, depthWrite: false })));
      this.rvBubble.setScale(1.45); this.rvBubble.pz = 0.6; this.rvBubble.castShadow = false; this.rvBubble.visible = false;
      n.rz = Math.PI; // mirando hacia el jugador
      g.world.root.add(n);
      this.rivalNode = n;
      this.rivalTarget = { kind: 'rival', x: 0, y: 15.2, z: 0.8, r: 0.95, alive: true };
      this.setRivalLook('crimson', 'blaster');
    }
    setRivalLook(skin, cannon) {
      skin = BB.Models.SKINS[skin] ? skin : 'crimson';
      cannon = ['blaster', 'twin', 'titan', 'nova'].indexOf(cannon) >= 0 ? cannon : 'blaster';
      if (this.rvLook === skin + cannon) return;
      this.rvLook = skin + cannon;
      const parts = BB.Models.playerParts(skin, cannon);
      this.rvBase.geo = parts.base; this.rvTurret.geo = parts.turret; this.rvBarrel.geo = parts.barrel;
    }
    render(add) {
      if (!this.rivalNode || !this.rivalNode.visible || this.game.state !== 'PVP') return;
      const u = this.ringUV || (this.ringUV = BB.Tex.cellUV(5));
      const k = 1.5 + Math.sin(this.matchT * 4) * 0.08;
      add.quad(this.rival.rx, 0.06, -this.RY, k, 0, 0, 0, 0, k, u, 1, 0.25, 0.4, 0.55);
    }
    hideRival() { if (this.rivalNode) this.rivalNode.visible = false; }

    // Parámetros de disparo propios que se publican (el rival simula mis balas con esto)
    myFireState() {
      const g = this.game, B = g.boosts, st = g.stats, bt = g.bullets.ptype || BB.BULLET_TYPES.plasma;
      return {
        fr: +(st.rate * (B.isActive('rapid') ? 2 : 1)).toFixed(2),
        n: BB.MULTI_LEVELS[B.multiTier()],
        big: B.isActive('big'),
        dmg: +(st.dmg * bt.dmg).toFixed(2),
        dm: B.isActive('damage') ? 1.7 : 1,
        bt: st.bullet, sh: B.isActive('shield'),
      };
    }

    updateMatch(dt) {
      const g = this.game;
      if (this.phase !== 'match' && this.phase !== 'ending') return;
      if (!this.myDone) this.matchT += dt;
      this.updateObstacles(dt);
      // boosts idénticos para ambos (misma semilla)
      this.boostT -= dt;
      if (this.boostT <= 0 && !this.myDone) {
        this.boostT = 13;
        const k = ['multi', 'rapid', 'big', 'damage', 'shield'][Math.floor(this.boostRng() * 5)];
        const x = (this.boostRng() * 2 - 1) * 3.2;
        g.pickups.spawnBoost(x, 6, k);
        if (this.mode === 'bot' && Math.random() < 0.7) this.bot.give(k);
      }
      // estado del rival
      const R = this.rival;
      let os;
      if (this.mode === 'online') {
        const f = this.myFireState();
        this.net.publish(Object.assign({ x: +g.player.x.toFixed(2), hp: Math.max(0, Math.round(this.myHP)), alive: this.myHP > 0, done: this.myDone, skin: g.stats.skin, cn: g.stats.cannon }, f));
        const op = this.net.peer(this.opp.peer);
        if (op && op.presence.mid === this.mid && +op.presence.r === this.round) {
          const pr = op.presence;
          os = { x: -(+pr.x || 0), hp: pr.hp === undefined ? 100 : +pr.hp, alive: pr.alive !== false, done: !!pr.done, fr: U.clamp(+pr.fr || 7, 1, 20), n: U.clamp(+pr.n || 1, 1, 7), big: !!pr.big, dmg: U.clamp(+pr.dmg || 1, 0.2, 4), dm: U.clamp(+pr.dm || 1, 1, 2), bt: String(pr.bt || 'plasma'), sh: !!pr.sh, skin: pr.skin, cn: pr.cn };
          this.lastOppSeen = performance.now();
        } else if (performance.now() - this.lastOppSeen > 6000 && !this.result) {
          this.finish('abandon');
          return;
        }
      } else if (this.bot) {
        os = this.bot.update(dt, this);
      }
      if (os) {
        Object.assign(R, os);
        this.oppState = { hp: os.hp, alive: os.alive, done: os.done };
        this.setRivalLook(os.skin, os.cn);
      }
      // cañón rival en 3D
      R.rx = U.damp(R.rx, R.x, 14, dt);
      R.flash = Math.max(0, R.flash - dt * 6);
      R.recoil = Math.max(0, R.recoil - dt * 7);
      const n = this.rivalNode;
      n.visible = R.alive;
      n.px = R.rx; n.py = this.RY; n.pz = 0.05 + Math.sin(this.matchT * 3) * 0.05;
      n.ry = U.clamp((R.x - R.rx) * 0.12, -0.4, 0.4);
      this.rvBarrel.py = 0.25 - R.recoil * 0.22;
      for (const c of [this.rvBase, this.rvTurret, this.rvBarrel]) c.flash = R.flash;
      this.rvBubble.visible = !!R.sh;
      this.rivalTarget.x = R.rx; this.rivalTarget.y = this.RY; this.rivalTarget.alive = R.alive;
      // el rival dispara (simulado localmente con sus parámetros)
      if (R.alive && !R.done && !this.myDone && this.matchT > 1) {
        R.fireT -= dt;
        if (R.fireT <= 0) { R.fireT += 1 / R.fr; if (R.fireT < -0.2) R.fireT = 0; this.fireRival(); }
      }
      // fin de partida
      if (!this.myDone && this.matchT >= DURATION) this.localDone('time');
      if (!this.result) {
        if (!R.alive && this.myHP > 0) { if (!this.koT) { this.koT = 0.001; this.rivalKO(); } }
        if (this.koT) { this.koT += dt; if (this.koT > 1.3) this.finish('ko'); }
        else if (this.myDone && (R.done || !R.alive)) this.finish(this.doneReason);
        else if (this.myDone) { this.endT += dt; if (this.endT > 5) this.finish(this.doneReason); }
      }
      this.updateHud();
    }

    // Obstáculos: meteoritos flotando en el centro que bloquean los disparos de ambos
    updateObstacles(dt) {
      const g = this.game;
      for (let i = 0; i < 3; i++) {
        const m = this.obs[i];
        if (m && (!m.alive || m.pvpId !== this.round * 10 + i)) this.obs[i] = null;
        if (!this.obs[i]) {
          this.obsT[i] -= dt;
          if (this.obsT[i] <= 0 && !this.myDone) {
            const r = this.obsRng;
            const type = ['normal', 'armored', 'crystal', 'explosive', 'electric'][Math.floor(r() * 5)];
            const tier = r() < 0.4 ? 3 : 2;
            const nm = g.spawnMeteor({ type, tier, x: (r() * 2 - 1) * 3, y: 6 + i * 2.4, vx: (r() < 0.5 ? -1 : 1) * (0.8 + r() * 1.2), vy: 0, hp: tier === 3 ? 30 : 16, noSplit: true });
            if (nm) { nm.hover = true; nm.baseY = 6 + i * 2.4; nm.pvpId = this.round * 10 + i; this.obs[i] = nm; }
            this.obsT[i] = 5 + r() * 3;
          }
        }
      }
    }

    fireRival() {
      const g = this.game, R = this.rival;
      const bt = BB.BULLET_TYPES[R.bt] || BB.BULLET_TYPES.plasma;
      const pat = BB.firePattern(R.n);
      const per = BB.volleyFactor(R.n) / R.n;
      const dmg = R.dmg * R.dm * (R.big ? 1.5 : 1) * per;
      const r = bt.r * (R.big ? 2 : 1);
      const sp = bt.speed * 0.8;
      for (const p of pat) {
        g.bullets.fireEnemy(R.rx - p.ox, this.RY - 1.3, -Math.sin(p.ang) * sp, -Math.cos(p.ang) * sp, 'rival', { z: 0.78, r: r * 1.3, dmg, col: bt.color, life: 2, pvp: true });
      }
      R.recoil = 1;
      g.fx.emit(R.rx, this.RY - 1.35, 0.78, 0, -2, 0, 0.07, 0.5, 0.9, bt.color, 1, 3, true, 0, 0);
    }

    // Mi bala impacta al rival: visual (online) o daño real (IA)
    onHitRival(dmg) {
      const R = this.rival, g = this.game;
      if (!R.alive) return;
      R.flash = 0.6;
      g.fx.sparks(R.rx, this.RY, 0.9, [1, 0.5, 0.5], 3, 6);
      if (R.sh) return;
      this.dealt += dmg;
      if (this.mode === 'bot' && this.bot) {
        this.bot.hp = Math.max(0, this.bot.hp - dmg);
      }
    }

    // Una bala del rival me impacta: yo soy la autoridad de mi vida
    damageMe(dmg) {
      const g = this.game, p = g.player;
      if (this.myDone || this.myHP <= 0) return;
      if (g.boosts.isActive('shield')) {
        g.fx.emit(p.x, p.y + 0.3, 0.9, 0, 0, 0, 0.15, 0.8, 1.6, [0.4, 0.8, 1], 0.8, 2, true, 0, 0);
        return;
      }
      this.myHP = Math.max(0, this.myHP - dmg);
      this.taken += dmg;
      p.invuln = Math.max(p.invuln, 0.08);
      g.fx.sparks(p.x, p.y, 0.9, [1, 0.35, 0.35], 4, 6);
      if (!this.hurtT || performance.now() - this.hurtT > 250) { this.hurtT = performance.now(); g.ui.hurt(); g.audio.sfx('hit'); g.vibrate(12); g.world.addShake(0.12); }
      if (this.myHP <= 0) { g.shields = 0; this.onLocalDeath(); }
    }

    rivalKO() {
      const g = this.game, R = this.rival;
      g.fx.explode(R.rx, this.RY, 0.8, 2.2, [1, 0.45, 0.3], 1.7);
      g.fx.explode(R.rx, this.RY, 0.8, 1.2, [1, 0.9, 0.6], 1.2);
      g.world.addShake(1);
      g.audio.sfx('explodeBig');
      this.rivalNode.visible = false;
      g.ui.banner('¡K.O.!', 'RIVAL DESTRUIDO', false, 1.4);
      g.vibrate([80, 40, 120]);
    }

    localDone(reason) {
      if (this.myDone) return;
      this.myDone = true;
      this.doneReason = reason;
      this.phase = 'ending';
      this.endT = 0;
      if (this.mode === 'online') this.net.publish({ done: true, alive: this.myHP > 0, hp: Math.round(this.myHP) }, true);
      if (reason === 'time') this.game.ui.banner('¡TIEMPO!', this.mode === 'online' ? 'ESPERANDO AL RIVAL…' : null, false, 2);
    }

    onLocalDeath() {
      const g = this.game, p = g.player;
      g.fx.explode(p.x, p.y, 0.8, 2, [1, 0.5, 0.2], 1.6);
      p.node.visible = false;
      g.playerDead = true;
      g.squad.stop();
      g.world.addShake(1.1);
      g.audio.sfx('explodeBig');
      g.vibrate([150, 60, 200]);
      this.localDone('ko');
      g.ui.banner('DESTRUIDO', null, false, 1.8);
    }

    onKill() { /* en el duelo los meteoritos son solo cobertura */ }

    // ================= Resultado =================
    finish(reason) {
      if (this.result) return;
      const g = this.game, os = this.oppState, my = Math.round(this.myHP);
      const meAlive = this.myHP > 0;
      const oh = Math.round(os.hp);
      let S;
      if (reason === 'abandon') S = 1;
      else if (reason === 'forfeit') S = 0;
      else if (meAlive && !os.alive) S = 1;
      else if (!meAlive && os.alive) S = 0;
      else S = my > oh ? 1 : my < oh ? 0 : 0.5;
      this.hideRival();
      const d = this.data, before = d.trophies, liBefore = leagueOf(before);
      const online = this.mode === 'online';
      const dt = online ? trophyDelta(before, this.opp.tr, S) : 0;
      d.trophies = Math.max(0, before + dt);
      d.best = Math.max(d.best, d.trophies);
      if (S === 1) { d.wins++; d.streak = Math.max(0, d.streak) + 1; } else if (S === 0) { d.losses++; d.streak = Math.min(0, d.streak) - 1; } else d.draws++;
      const coins = online ? (S === 1 ? 80 : S === 0.5 ? 35 : 15) : (S === 1 ? 25 : 8);
      g.addCoins(coins);
      const liAfter = leagueOf(d.trophies);
      let promo = null;
      if (liAfter > liBefore) {
        promo = BB.LEAGUES[liAfter];
        if ((d.rewarded || 0) < liAfter) { g.addCoins(promo.reward); d.rewarded = liAfter; }
      }
      d.history = [{ r: S === 1 ? 'w' : S === 0 ? 'l' : 'd', opp: this.opp.name.slice(0, 24), sc: my, os: oh, dt, bot: !online, at: Date.now() }].concat(d.history || []).slice(0, 20);
      g.save.save(true);
      this.result = { S, reason, dt, before, after: d.trophies, coins, promo, demo: liAfter < liBefore ? BB.LEAGUES[liAfter] : null };
      this.phase = 'result';
      this.rematchAsked = false;
      if (online) this.net.publish({ st: 'post', done: true, rm: false, rr: this.round + 1 }, true);
      g.setState(BB.STATES.PVP_RESULT);
      g.audio.sfx(S === 1 ? 'victory' : S === 0 ? 'gameover' : 'levelUp');
      g.audio.playMusic(S === 1 ? 'menu' : 'over');
      if (S === 1) g.ui.whiteFlash();
      setTimeout(() => this.showResult(), 900);
      this.syncMenuChip();
    }

    showResult() {
      const r = this.result, g = this.game;
      if (!r || g.state !== BB.STATES.PVP_RESULT) return;
      $('h-rival').hidden = true; $('h-timer').hidden = true;
      const title = r.S === 1 ? 'VICTORIA' : r.S === 0 ? 'DERROTA' : 'EMPATE';
      const why = { ko: r.S === 1 ? 'Destruiste al rival' : r.S === 0 ? 'Tu cañón fue destruido' : 'Ambos destruidos', time: r.S === 0.5 ? 'Tiempo: misma vida' : 'Tiempo: gana quien tiene más vida', abandon: 'El rival se desconectó', forfeit: 'Abandonaste el duelo' }[r.reason] || '';
      $('pr-title').textContent = title;
      $('pr-title').className = r.S === 1 ? 'win' : r.S === 0 ? 'lose' : 'draw';
      $('pr-why').textContent = why;
      $('pr-scores').innerHTML = '<div><small>VOS · VIDA</small><b>' + Math.round(this.myHP) + '%</b></div><span>–</span><div><small>' + esc(this.opp.name) + '</small><b>' + Math.round(this.oppState.hp) + '%</b></div>';
      const li = leagueOf(r.after);
      $('pr-trophy').innerHTML = this.mode === 'online'
        ? this.leagueBadge(li, 52) + '<div><b class="' + (r.dt >= 0 ? 'up' : 'down') + '" id="pr-delta">' + (r.dt >= 0 ? '+' : '') + r.dt + '</b><span>🏆 <i id="pr-trv">' + U.fmt(r.before) + '</i> · ' + BB.LEAGUES[li].name + '</span></div>'
        : '<div><b class="neutral">ENTRENAMIENTO</b><span>Sin trofeos en juego</span></div>';
      $('pr-coins').textContent = '+' + U.fmt(r.coins);
      $('pr-promo').hidden = !r.promo && !r.demo;
      if (r.promo) $('pr-promo').innerHTML = '¡ASCENDISTE A <b style="color:' + r.promo.color + '">' + r.promo.name + '</b>!' + (r.promo.reward ? ' +' + U.fmt(r.promo.reward) + ' monedas' : '');
      else if (r.demo) $('pr-promo').innerHTML = 'Bajaste a <b style="color:' + r.demo.color + '">' + r.demo.name + '</b>';
      $('res-rematch').disabled = false;
      $('res-rematch').textContent = 'REVANCHA';
      $('res-new').textContent = this.mode === 'online' ? 'NUEVO RIVAL' : 'OTRO ENTRENAMIENTO';
      g.ui.show('s-pvpres');
      // animación del contador de trofeos
      if (this.mode === 'online') {
        const t0 = performance.now(), from = r.before, to = r.after;
        const step = () => {
          const k = Math.min(1, (performance.now() - t0) / 1200);
          const el = $('pr-trv'); if (el) el.textContent = U.fmt(Math.round(from + (to - from) * U.smooth(k)));
          if (k < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      }
    }

    requestRematch() {
      if (this.mode === 'bot') { this.startBot(); return; }
      this.rematchAsked = true;
      this.net.publish({ rm: true, rr: this.round + 1 }, true);
      $('res-rematch').disabled = true;
      $('res-rematch').textContent = 'ESPERANDO AL RIVAL…';
    }

    tickRematch() {
      const op = this.net.peer(this.opp && this.opp.peer);
      const btn = $('res-rematch');
      if (!op || op.presence.mid !== this.mid) {
        if (btn && this.game.state === BB.STATES.PVP_RESULT) { btn.disabled = true; btn.textContent = 'EL RIVAL SE FUE'; }
        return;
      }
      const pr = op.presence;
      if (this.rematchAsked && ((pr.rm === true && +pr.rr === this.round + 1) || (pr.st === 'match' && +pr.r === this.round + 1))) {
        this.round++;
        this.rematchAsked = false;
        this.beginVersus(this.opp);
      } else if (op.presence.rm === true && !this.rematchAsked && btn && !btn.dataset.hinted) {
        btn.textContent = 'REVANCHA · ¡EL RIVAL QUIERE!';
      }
    }

    forfeit() {
      if (!this.inMatch() && this.game.state !== BB.STATES.PAUSED) return;
      this.game.shields = 0; this.myHP = 0;
      if (this.mode === 'online') this.net.publish({ alive: false, done: true, hp: 0 }, true);
      this.finish('forfeit');
    }

    leaveMatch() {
      clearInterval(this.cdTimer);
      this.hideRival();
      if (this.mode === 'online' && this.net.available) this.net.publish({ st: 'idle', mid: null, opp: null, rm: false, done: false, code: null }, true);
      this.phase = 'lobby';
      const r = $('h-rival'); if (r) r.hidden = true;
      const t = $('h-timer'); if (t) t.hidden = true;
    }

    // ================= HUD del duelo =================
    updateHud() {
      const c = this.hudCache, R = this.rival;
      const left = Math.max(0, DURATION - this.matchT);
      const tt = Math.floor(left / 60) + ':' + String(Math.floor(left % 60)).padStart(2, '0');
      if (c.t !== tt) { c.t = tt; const el = $('h-timer'); el.textContent = tt; el.classList.toggle('low', left < 10); }
      const rh = Math.max(0, Math.round(R.hp)), mh = Math.max(0, Math.round(this.myHP));
      const key = this.opp.name + '|' + rh + '|' + mh + '|' + R.alive + '|' + R.sh;
      if (c.k !== key) {
        c.k = key;
        $('hr-name').textContent = this.opp.name;
        $('hr-score').textContent = rh + '%';
        $('hr-hp').style.width = rh + '%';
        $('hr-hp').classList.toggle('shield', !!R.sh);
        $('h-rival').classList.toggle('dead', !R.alive);
        $('my-hp').style.width = mh + '%';
        $('my-hpv').textContent = mh + '%';
        $('my-hpw').classList.toggle('low', mh <= 25);
        const lead = mh - rh;
        $('hr-lead').textContent = lead > 0 ? 'VENTAJA +' + lead : lead < 0 ? 'DESVENTAJA ' + lead : 'PAREJOS';
        $('hr-lead').className = lead > 0 ? 'up' : lead < 0 ? 'down' : '';
      }
      const rx = Math.round(((-R.rx + 4.6) / 9.2) * 100);
      if (c.rx !== rx) { c.rx = rx; $('hr-pos').style.left = U.clamp(rx, 0, 100) + '%'; }
    }
  }

  BB.PvPManager = PvPManager;
  BB.BotOpponent = BotOpponent;
  BB.PVP_DURATION = DURATION;
})(window.BB);
