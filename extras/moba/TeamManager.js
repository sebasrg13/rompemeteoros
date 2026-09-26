/* managers/TeamManager.js — GUERRA ESTELAR 5 VS 5: MOBA espacial con carriles.
 * Roles: TOP (Coloso), JUNGLA (Cazador), MID (Arcano), ADC (Artillero), SUPPORT (Ingeniero).
 * Mapa (columnas, vista fija): carril TOP, MID y BOT; torretas por carril; drones que avanzan por los carriles;
 * jungla entre carriles con monstruos neutrales (Nebulosa Roja, Nebulosa Azul y el Titán en el río).
 * El núcleo solo se puede dañar cuando el equipo perdió al menos una torreta.
 *
 * Red (presence de la room):
 *  - Cada humano es autoridad de su vida, posición, disparo y habilidades.
 *  - El ANFITRIÓN (primer humano conectado de la alineación) es autoridad del mundo compartido:
 *    bots, drones, torretas, núcleos, monstruos y mejoras. Si se va, lo toma el siguiente humano.
 *  - Cada cliente simula las balas de todos con los parámetros publicados.
 *  - Marco canónico = el del equipo 0. Cada cliente ve a su equipo abajo: el equipo 1 ve todo espejado (x -> -x).
 */
(function (BB) {
  'use strict';
  const U = BB.U;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const ROLES = {
    top: { key: 'top', name: 'TOP', title: 'Coloso', hp: 190, rate: 4.5, dmg: 1.05, speed: 6, cannon: 'titan', ab: 'MURO', cd: 12, color: '#5c8dff', icon: 'tank', home: -5.4, lane: 0,
      desc: 'Carril TOP. Resistente: recibe la mitad de daño. MURO: barrera de energía de 4 s que frena todas las balas enemigas.' },
    jungle: { key: 'jungle', name: 'JUNGLA', title: 'Cazador', hp: 125, rate: 6, dmg: 1.15, speed: 11, cannon: 'twin', ab: 'CASTIGO', cd: 9, color: '#e0b341', icon: 'jungle', home: -2.7, lane: -1,
      desc: 'Recorre la jungla entre carriles: hace el doble de daño a los monstruos. CASTIGO: 90 de daño al monstruo o dron en su columna para robar mejoras.' },
    mid: { key: 'mid', name: 'MID', title: 'Arcano', hp: 95, rate: 6, dmg: 1.25, speed: 8, cannon: 'nova', ab: 'ONDA', cd: 9, color: '#b46bff', icon: 'mid', home: 0, lane: 1,
      desc: 'Carril central. Daño de área: ONDA golpea una franja ancha del lado enemigo (naves, drones y torretas).' },
    adc: { key: 'adc', name: 'ADC', title: 'Artillero', hp: 85, rate: 8, dmg: 1.4, speed: 8.5, cannon: 'nova', ab: 'PERFORANTE', cd: 8, color: '#ff8a3b', icon: 'adc', home: 4.6, lane: 2,
      desc: 'Carril BOT junto al support. El que más daño hace, pero frágil. PERFORANTE: rayo que atraviesa todo en su columna.' },
    support: { key: 'support', name: 'SUPPORT', title: 'Ingeniero', hp: 105, rate: 5, dmg: 0.75, speed: 7.5, cannon: 'twin', ab: 'ESCUDO', cd: 16, color: '#3ddc84', icon: 'heal', home: 6.2, lane: 2,
      desc: 'Carril BOT. Cura sin parar al aliado más herido cerca. ESCUDO: protege a todo el equipo durante 3 s.' },
  };
  const ROLE_ORDER = ['top', 'jungle', 'mid', 'adc', 'support'];
  BB.ROLES = ROLES;
  const C = {
    DURATION: 300, HALFW: 7.3, PY: 0.9, RY: 15.2, CORE_LOW: -2.4, CORE_HIGH: 17.6, CORE_HP: 1500, CORE_R: 1.25,
    WALL_T: 4, WALL_W: 1.8, SHIELD_T: 3, PIERCE_DMG: 30, PIERCE_CORE: 45, ONDA_DMG: 24, ONDA_W: 2.3, SMITE: 90,
    HEAL_RATE: 9, HEAL_RANGE: 6.5, UNIT_R: 0.7, SCALE: 0.8, FORM_WAIT: 12,
    LANES: [-5.4, 0, 5.4], LANE_NAMES: ['TOP', 'MID', 'BOT'],
    TOWER_HP: 700, TOWER_R: 0.85, TOWER_D: 1.2, TOWER_CD: 1.1, TOWER_SHOT: 10,
    D0: 2.0, DL: 12.2, DRONE_HP: 45, DRONE_SPEED: 1.4, DRONE_DPS: 7, WAVE_EVERY: 20, MAX_DRONES: 36,
    MIDY: 8.05, CAMPS: [{ k: 'red', x: -2.7, hp: 260, respawn: 50, first: 0 }, { k: 'blue', x: 2.7, hp: 260, respawn: 50, first: 0 }, { k: 'titan', x: 0, hp: 700, respawn: 90, first: 60 }],
    BUFF_T: 60,
  };
  BB.TEAM = C;
  C.SLOTS = ROLE_ORDER.map((r) => ROLES[r].home);

  function hash(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

  class TeamManager {
    constructor(game) {
      this.game = game;
      this.net = game.net;
      this.phase = 'lobby';
      this.role = 'adc';
      this.units = [];
      this.hudCache = {};
    }

    get data() {
      const d = this.game.save.data;
      if (!d.pvp || typeof d.pvp !== 'object') d.pvp = {};
      if (!d.pvp.team || typeof d.pvp.team !== 'object') d.pvp.team = {};
      const t = d.pvp.team;
      for (const [k, v] of Object.entries({ trophies: 0, wins: 0, losses: 0, draws: 0, rewarded: 0, role: 'adc', mvp: 0 })) if (t[k] === undefined) t[k] = v;
      return t;
    }
    inMatch() { return this.game.state === BB.STATES.TEAM; }
    isOnlineMatch() { return this.mode === 'online' && (this.phase === 'match' || this.phase === 'ending'); }
    icon(role) { return BB.Tex.iconURL[ROLES[role].icon] || ''; }

    // ================= UI =================
    initUI() {
      const g = this.game;
      const on = (id, fn) => {
        const el = $(id);
        if (el) el.addEventListener('click', (e) => { e.stopPropagation(); g.audio.unlock(); g.audio.sfx('click'); try { fn(e); } catch (err) { BB.reportError('team-ui:' + id, err); } });
      };
      this.role = ROLES[this.data.role] ? this.data.role : 'adc';
      on('btn-team', () => this.openLobby());
      on('team-back', () => { this.cancelSearch(); g.toMenu(); });
      on('team-quick', () => this.quickQueue());
      on('team-friends', () => { $('team-codebox').hidden = !$('team-codebox').hidden; });
      on('team-create', () => this.joinCode(this.makeCode(), true));
      on('team-join', () => this.joinCode(($('team-code-in').value || '').toUpperCase().replace(/[^A-Z0-9]/g, ''), false));
      on('team-solo', () => this.startPractice());
      on('t-cancel', () => this.cancelSearch());
      on('t-start', () => this.formMatch());
      on('tr-again', () => { const m = this.mode; this.leave(); this.openLobby(); if (m === 'online') this.quickQueue(); else this.startPractice(); });
      on('tr-lobby', () => { this.leave(); this.openLobby(); });
      on('tr-menu', () => { this.leave(); g.toMenu(); });
      $('team-roles').addEventListener('click', (e) => {
        const b = e.target.closest('[data-role]');
        if (!b) return;
        g.audio.sfx('click');
        this.role = b.dataset.role; this.data.role = this.role; g.save.save();
        this.renderRoles();
        if (this.phase === 'queue' || this.phase === 'code') this.net.publish({ role: this.role }, true);
      });
      $('t-abil').addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); this.useAbility(); });
      this.net.onChange(() => { if (g.state === BB.STATES.TEAM_LOBBY) this.renderLobby(); });
      window.addEventListener('keydown', (e) => { if ((e.key === ' ' || e.key === 'e' || e.key === 'E') && this.inMatch()) { e.preventDefault(); this.useAbility(); } });
    }

    openLobby() {
      const g = this.game;
      if (g.state !== BB.STATES.TEAM_LOBBY) g.setState(BB.STATES.TEAM_LOBBY);
      if (g.world.camMode !== 'menu') g.enterMenuScene();
      this.phase = 'lobby';
      $('team-codebox').hidden = true;
      $('t-search').hidden = true;
      this.renderLobby();
      g.ui.show('s-team');
    }

    renderRoles() {
      $('team-roles').innerHTML = ROLE_ORDER.map((k) => {
        const r = ROLES[k];
        return '<button class="rolecard' + (k === this.role ? ' on' : '') + '" data-role="' + k + '" style="--rc:' + r.color + '">' +
          '<img alt="" src="' + this.icon(k) + '"><b>' + r.name + '</b><small>' + r.title + '</small></button>';
      }).join('');
      $('team-roledesc').textContent = ROLES[this.role].desc;
    }

    renderLobby() {
      const t = this.data, tr = t.trophies, li = BB.leagueOf(tr), L = BB.LEAGUES[li], next = BB.LEAGUES[li + 1];
      const pvp = this.game.pvp;
      $('team-tr').textContent = U.fmt(tr);
      const prog = next ? (tr - L.min) / (next.min - L.min) : 1;
      $('team-league').innerHTML = pvp.leagueBadge(li, 64) +
        '<div class="lg-inf"><small>LIGA 5 VS 5</small><b style="color:' + L.color + '">' + L.name + '</b>' +
        '<div class="lg-bar"><i style="width:' + Math.round(prog * 100) + '%;background:' + L.color + '"></i></div>' +
        '<span>' + (next ? U.fmt(next.min - tr) + ' trofeos para ' + next.name : 'Liga máxima alcanzada') + '</span></div>' +
        '<div class="lg-rec"><div><b>' + t.wins + '</b><small>V</small></div><div><b>' + t.losses + '</b><small>D</small></div><div><b>' + t.mvp + '</b><small>MVP</small></div></div>';
      const ns = pvp.netStatus();
      $('team-net').className = 'netline ' + ns.cls;
      $('team-net').textContent = ns.txt;
      $('team-quick').disabled = !ns.ok; $('team-friends').disabled = !ns.ok;
      this.renderRoles();
    }

    makeCode() { const A = 'ACDEFHJKMNPRTUVWXY34679'; let c = ''; for (let i = 0; i < 4; i++) c += A[Math.floor(Math.random() * A.length)]; return c; }

    // ================= Cola / sala =================
    base() { const d = this.data; return { app: 'bb3d', v: 1, tr: d.trophies, nick: (this.net.myName || '').slice(0, 18), role: this.role }; }

    quickQueue() {
      if (!this.net.available || !this.net.connected) { this.game.ui.toast('Sin conexión online', '#ff3355'); return; }
      this.mode = 'online'; this.kind = 'tq'; this.code = null;
      this.enterQueue('BUSCANDO PARTIDA 5 VS 5…');
    }
    joinCode(code, created) {
      if (!code || code.length < 4) { this.game.ui.toast('Ingresá un código de 4 caracteres', '#ffc83d'); return; }
      if (!this.net.available || !this.net.connected) { this.game.ui.toast('Sin conexión online', '#ff3355'); return; }
      this.mode = 'online'; this.kind = 'tc'; this.code = code.slice(0, 6);
      this.enterQueue(created ? 'SALA CREADA' : 'EN LA SALA');
    }
    enterQueue(title) {
      this.phase = this.kind === 'tq' ? 'queue' : 'code';
      this.since = Date.now();
      this.qT = 0;
      this.qKey = null;
      this.net.publish(Object.assign(this.base(), { st: this.kind, since: this.since, code: this.code, mid: null, lu: null, w: null, bots: null }), true);
      $('t-search').hidden = false;
      $('t-title').textContent = title;
      $('t-code').hidden = !this.code;
      if (this.code) $('t-codev').textContent = this.code;
      $('t-start').hidden = true;
    }
    cancelSearch() {
      if (this.phase === 'queue' || this.phase === 'code') this.net.publish({ st: 'idle', code: null, mid: null, lu: null }, true);
      if (this.phase !== 'match') this.phase = 'lobby';
      const s = $('t-search'); if (s) s.hidden = true;
    }

    queued() {
      const n = this.net;
      const list = n.peers.filter((p) => p.presence.st === this.kind && (this.kind === 'tq' || p.presence.code === this.code))
        .map((p) => ({ peer: p.peer, since: +p.presence.since || 0, role: ROLES[p.presence.role] ? p.presence.role : 'adc', tr: +p.presence.tr || 0, name: n.nameOf(p) }));
      list.push({ peer: n.myPeer || 'me', since: this.since, role: this.role, tr: this.data.trophies, name: 'Vos', me: true });
      list.sort((a, b) => (a.since - b.since) || (a.peer < b.peer ? -1 : 1));
      return list;
    }

    tick() {
      if (this.phase === 'queue' || this.phase === 'code') this.tickQueue();
    }

    tickQueue() {
      const n = this.net;
      this.qT = (Date.now() - this.since) / 1000; // tiempo real (no depende de los FPS)
      const q = this.queued().slice(0, 10);
      const iAmHost = q[0] && q[0].me;
      const left = Math.max(0, Math.ceil(C.FORM_WAIT - this.qT));
      $('t-qinfo').textContent = q.length + '/10 JUGADORES' + (this.kind === 'tq' ? (iAmHost ? ' · EMPIEZA EN ' + left + ' S (EL RESTO CON IA)' : ' · ESPERANDO…') : iAmHost ? ' · VOS SOS EL ANFITRIÓN' : ' · ESPERANDO AL ANFITRIÓN');
      const key = q.map((x) => x.peer + x.role).join();
      if (key !== this.qKey) {
        this.qKey = key;
        $('t-qlist').innerHTML = q.map((x) => '<div class="qrow"><img alt="" src="' + this.icon(x.role) + '"><span>' + esc(x.name) + '</span><em>' + ROLES[x.role].name + '</em></div>').join('');
      }
      $('t-start').hidden = !(this.kind === 'tc' && iAmHost);
      if (this.kind === 'tq' && iAmHost && (q.length >= 10 || this.qT >= C.FORM_WAIT)) { this.formMatch(); return; }
      if (!n.myPeer) return;
      for (const p of n.peers) {
        const pr = p.presence;
        if (pr.st === 'th' && Array.isArray(pr.lu) && pr.lu.some((e) => e[0] === n.myPeer)) { this.joinLineup(p.peer, pr); return; }
      }
    }

    // El anfitrión arma los equipos: un jugador por rol en cada equipo; la IA completa
    formMatch() {
      const q = this.queued().slice(0, 10);
      const humans = q.slice().sort((a, b) => b.tr - a.tr);
      const teams = [[], []];
      const snake = [0, 1, 1, 0, 0, 1, 1, 0, 0, 1];
      const myId = this.mode === 'solo' ? 'me' : this.net.myPeer;
      humans.forEach((h, i) => {
        let ti = snake[i];
        if (teams[ti].length >= 5) ti = 1 - ti;
        teams[ti].push({ id: h.me ? myId : h.peer, want: h.role, human: 1, name: h.me ? (this.net.myName || 'Anfitrión') : h.name, tr: h.tr });
      });
      const lineup = [];
      teams.forEach((tm, ti) => {
        const free = ROLE_ORDER.slice();
        for (const u of tm) { const i = free.indexOf(u.want); if (i >= 0) { u.role = u.want; free.splice(i, 1); } }
        for (const u of tm) if (!u.role) u.role = free.shift();
        for (const r of free) tm.push({ id: 'b' + ti + r, role: r, human: 0, name: 'IA · ' + ROLES[r].name, tr: 0 });
        tm.sort((a, c) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(c.role));
        tm.forEach((u) => lineup.push([u.id, ti, ROLE_ORDER.indexOf(u.role), u.role, u.human, String(u.name).slice(0, 20), u.tr]));
      });
      const mid = 't' + hash(lineup.map((e) => e[0]).join() + Date.now()).toString(36);
      const solo = this.mode !== 'online';
      if (!solo) this.net.publish({ st: 'th', mid, lu: lineup, seed: hash(mid) }, true);
      this.begin(mid, lineup, hash(mid));
    }

    joinLineup(hostPeer, pr) {
      this.begin(pr.mid, pr.lu, +pr.seed || 1);
      this.net.publish({ st: 'tm', mid: pr.mid }, true);
    }

    startPractice() {
      this.mode = 'solo';
      this.kind = 'solo';
      this.since = Date.now();
      this.qT = 0;
      this.formMatch();
    }

    // ================= Preparación (VS) =================
    begin(mid, lineup, seed) {
      const g = this.game, n = this.net;
      this.mid = mid; this.seed = seed; this.lineup = lineup;
      this.myId = this.mode === 'solo' ? 'me' : n.myPeer;
      const meEntry = lineup.find((e) => e[0] === this.myId) || lineup.find((e) => e[4]);
      this.myTeam = meEntry[1];
      this.role = meEntry[3];
      this.phase = 'versus';
      $('t-search').hidden = true;
      const card = (e) => '<div class="tv-u' + (e[0] === this.myId ? ' me' : '') + '"><img alt="" src="' + this.icon(e[3]) + '"><b>' + esc(e[0] === this.myId ? 'VOS' : e[5]) + '</b><small>' + ROLES[e[3]].name + (e[4] ? '' : ' · IA') + '</small></div>';
      const bySlot = (t) => lineup.filter((e) => e[1] === t).sort((a, b) => a[2] - b[2]);
      $('tvs-enemy').innerHTML = bySlot(1 - this.myTeam).map(card).join('');
      $('tvs-ally').innerHTML = bySlot(this.myTeam).map(card).join('');
      const hEnemy = lineup.filter((e) => e[1] !== this.myTeam && e[4]).length;
      this.ranked = this.mode === 'online' && hEnemy > 0;
      $('tvs-stakes').textContent = (this.ranked ? 'Partida con trofeos · ' + hEnemy + ' rival' + (hEnemy > 1 ? 'es humanos' : ' humano') : 'Práctica: no se juegan trofeos') + ' · Tu rol: ' + ROLES[this.role].name;
      g.ui.show('s-tvs');
      g.audio.sfx('siren');
      let c = 3;
      $('tvs-count').textContent = c;
      clearInterval(this.cdTimer);
      this.cdTimer = setInterval(() => {
        c--;
        if (c > 0) { $('tvs-count').textContent = c; g.audio.sfx('click'); }
        else { clearInterval(this.cdTimer); this.startMatch(); }
      }, 900);
    }

    // ---------- marco de coordenadas ----------
    toMine(xc) { return this.myTeam === 0 ? xc : -xc; }           // canónico -> mi pantalla
    conv(x, fromTeam) { return fromTeam === this.myTeam ? x : -x; } // lo publicado por un jugador del equipo T -> mi pantalla
    homeX(u) { return this.toMine(ROLES[u.role].home); }
    laneX(l) { return this.toMine(C.LANES[l]); }
    uy(u) { return u.team === this.myTeam ? C.PY : C.RY; }
    coreY(team) { return team === this.myTeam ? C.CORE_LOW : C.CORE_HIGH; }
    towerY(team) { return team === this.myTeam ? C.D0 + C.TOWER_D : C.D0 + C.DL - C.TOWER_D; }
    droneY(d) { return d.team === this.myTeam ? C.D0 + d.d : C.D0 + C.DL - d.d; }
    campX(i) { return this.toMine(C.CAMPS[i].x); }

    // ================= Partida =================
    startMatch() {
      const g = this.game;
      g.startTeamArena(this.role);
      this.ensureNodes();
      this.phase = 'match';
      this.t = 0; this.result = null; this.endT = 0;
      this.stats = { dealt: 0, healed: 0, blocked: 0, deaths: 0, kills: 0, objectives: 0 };
      this.core = [C.CORE_HP, C.CORE_HP];
      this.coreFlash = [0, 0];
      this.coreDead = [false, false];
      this.coreWarned = {};
      this.towers = [0, 1].map(() => C.LANES.map(() => ({ hp: C.TOWER_HP, alive: true, cd: 1, shots: 0, seen: 0, tgt: '', flash: 0 })));
      this.drones = [];
      this.nextDrone = 1;
      this.waveT = 4;
      this.camps = C.CAMPS.map((c) => ({ hp: c.hp, max: c.hp, alive: c.first === 0, respawnT: c.first, last: -1, flash: 0 }));
      this.buffs = { red: { team: -1, t: 0 }, blue: { team: -1, t: 0 }, titan: { team: -1, t: 0 } };
      this.units = this.lineup.map((e) => {
        const R = ROLES[e[3]];
        const u = {
          id: e[0], team: e[1], slot: e[2], role: e[3], human: !!e[4], name: e[5], tr: +e[6] || 0, me: e[0] === this.myId,
          x: 0, tx: 0, hp: R.hp, max: R.hp, alive: true, respawnT: 0,
          fireT: 1 + Math.random() * 0.5, recoil: 0, flash: 0, fr: R.rate, n: 1, big: false, dmg: R.dmg, dm: 1, bt: 'plasma',
          wallT: 0, wallX: 0, pc: 0, px: 0, pcSeen: 0, so: 0, soSeen: 0, ht: null, shieldT: 0, cd: 2 + Math.random() * 3, thinkT: 0, lastSeen: performance.now(),
        };
        u.x = u.tx = this.homeX(u);
        return u;
      });
      this.me = this.units.find((u) => u.me);
      this.myAb = { cd: 1.5, charge: 0 };
      this.boostRng = U.seeded((this.seed ^ 0x77) >>> 0);
      this.boostT = 12;
      this.beams = [];
      this.hudCache = {};
      this.nodes.forEach((n) => { n.root.visible = false; });
      this.bindNodes();
      $('t-hud').hidden = false; $('t-abil').hidden = false; $('h-timer').hidden = false;
      g.player.x = g.player.targetX = this.me.x;
      g.ui.banner('¡GUERRA ESTELAR!', 'TU CARRIL: ' + (ROLES[this.role].lane >= 0 ? C.LANE_NAMES[ROLES[this.role].lane] : 'JUNGLA'), false, 2);
      if (this.mode === 'online') this.net.publish({ st: 'tm', mid: this.mid }, true);
    }

    // --------- Nodos 3D ---------
    ensureNodes() {
      if (this.nodes) return;
      const g = this.game, root = g.world.root, P = BB.Prim, Mo = BB.Models;
      const HALF = Math.PI / 2;
      this.nodes = [];
      for (let i = 0; i < 9; i++) {
        const r = new BB.Node();
        r.boundR = 2;
        const mat = BB.mat({ spec: 0.9, shin: 38, rim: [0.4, 0.8, 1, 0.6], glow: 1.2 });
        const n = { root: r, mat, base: r.add(new BB.Node(null, mat)), turret: r.add(new BB.Node(null, mat)), barrel: r.add(new BB.Node(null, mat)), look: '' };
        n.barrel.pz = 0.72; n.barrel.py = 0.25;
        r.visible = false;
        root.add(r);
        this.nodes.push(n);
      }
      const cb = new BB.GeoBuilder();
      cb.add(P.oct(0.9, 2.4), { color: [1, 1, 1], glow: 0.55 });
      for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; cb.add(P.oct(0.35, 2.2), { x: Math.cos(a) * 0.8, y: Math.sin(a) * 0.8, z: -0.4, rx: 0.4 * Math.sin(a), ry: -0.4 * Math.cos(a), color: [0.85, 0.9, 1], glow: 0.5 }); }
      cb.add(P.torus(1.3, 0.12, 6, 32), { z: -1.3, color: [1, 1, 1], glow: 1 });
      cb.add(P.cyl(1.4, 1.6, 0.5, 20), { rx: HALF, z: -1.7, color: [0.3, 0.34, 0.45] });
      const coreGeo = cb.build('core');
      this.teamMats = [
        { core: BB.mat({ color: [0.4, 0.85, 1], spec: 1.4, shin: 60, rim: [0.5, 0.9, 1, 1.2], glow: 1.1 }), tower: BB.mat({ color: [0.55, 0.8, 1], spec: 1, shin: 40, rim: [0.4, 0.9, 1, 0.8], glow: 1.2 }), drone: BB.mat({ color: [0.5, 0.85, 1], spec: 0.8, rim: [0.4, 0.9, 1, 0.7], glow: 1.4 }) },
        { core: BB.mat({ color: [1, 0.4, 0.5], spec: 1.4, shin: 60, rim: [1, 0.4, 0.5, 1.2], glow: 1.1 }), tower: BB.mat({ color: [1, 0.55, 0.6], spec: 1, shin: 40, rim: [1, 0.4, 0.5, 0.8], glow: 1.2 }), drone: BB.mat({ color: [1, 0.5, 0.55], spec: 0.8, rim: [1, 0.4, 0.5, 0.7], glow: 1.4 }) },
      ];
      this.coreNodes = [0, 1].map(() => { const n = root.add(new BB.Node(coreGeo, this.teamMats[0].core)); n.visible = false; n.boundR = 4; return n; });
      const tb = new BB.GeoBuilder();
      tb.add(P.cyl(0.85, 1.0, 0.35, 16), { rx: HALF, z: 0.18, color: [0.3, 0.33, 0.42] });
      tb.add(P.cyl(0.38, 0.5, 1.6, 12), { rx: HALF, z: 1.1, color: [0.75, 0.8, 0.9] });
      tb.add(P.torus(0.46, 0.07, 5, 18), { z: 1.4, color: [1, 1, 1], glow: 1 });
      tb.add(P.sphere(0.5, 14, 10), { z: 2.05, color: [1, 1, 1], glow: 0.7 });
      tb.add(P.cyl(0.12, 0.14, 0.9, 8), { y: 0.55, z: 2.05, color: [0.6, 0.62, 0.7] });
      const towerGeo = tb.build('tower');
      this.towerNodes = [0, 1].map(() => C.LANES.map(() => { const n = root.add(new BB.Node(towerGeo, this.teamMats[0].tower)); n.visible = false; n.boundR = 3; return n; }));
      this.droneNodes = [];
      for (let i = 0; i < C.MAX_DRONES; i++) { const n = root.add(new BB.Node(Mo.geo.mini, this.teamMats[0].drone)); n.visible = false; n.boundR = 1; this.droneNodes.push(n); }
      const al = Mo.geo.alien;
      const campMat = (c) => BB.mat({ color: c, spec: 0.8, shin: 30, rim: [c[0], c[1], c[2], 0.9], glow: 1.3 });
      this.campNodes = [
        root.add(new BB.Node(al.tank.body, campMat([1, 0.45, 0.4]))),
        root.add(new BB.Node(al.shooter.body, campMat([0.45, 0.65, 1]))),
        root.add(new BB.Node(Mo.geo.boss.titan.core, BB.mat({ spec: 0.3, shin: 20, rim: [1, 0.5, 0.2, 0.6], glow: 1.1 }))),
      ];
      this.campNodes[0].setScale(1.1); this.campNodes[1].setScale(1.1); this.campNodes[2].setScale(1.25);
      this.campNodes.forEach((n) => { n.visible = false; n.boundR = 3; });
      const wg = new BB.GeoBuilder().add(P.box(C.WALL_W * 2, 0.22, 1.5), { color: [1, 1, 1], glow: 1 }).build('wall');
      this.wallMats = [BB.mat({ color: [0.3, 0.7, 1], blend: 2, opacity: 0.55, depthWrite: false, glow: 1, rim: [0.5, 0.9, 1, 1] }), BB.mat({ color: [1, 0.3, 0.4], blend: 2, opacity: 0.55, depthWrite: false, glow: 1, rim: [1, 0.5, 0.5, 1] })];
      this.walls = [];
      for (let i = 0; i < 4; i++) { const n = root.add(new BB.Node(wg, this.wallMats[0])); n.visible = false; n.castShadow = false; this.walls.push(n); }
    }

    bindNodes() {
      let k = 0;
      for (const u of this.units) {
        if (u.me) { u.node = null; continue; }
        const n = this.nodes[k++];
        u.node = n;
        const ally = u.team === this.myTeam;
        const skin = ally ? 'cobalt' : 'crimson';
        const look = skin + ROLES[u.role].cannon;
        if (n.look !== look) {
          const parts = BB.Models.playerParts(skin, ROLES[u.role].cannon);
          n.base.geo = parts.base; n.turret.geo = parts.turret; n.barrel.geo = parts.barrel; n.look = look;
        }
        n.mat.rim = ally ? [0.4, 0.8, 1, 0.6] : [1, 0.35, 0.45, 0.8];
        n.root.setScale(C.SCALE * (u.role === 'top' ? 1.12 : 1));
        n.root.rz = ally ? 0 : Math.PI;
        n.root.visible = true;
      }
      const side = (t) => (t === this.myTeam ? 0 : 1);
      for (const t of [0, 1]) {
        const cn = this.coreNodes[side(t)];
        cn.mat = this.teamMats[side(t)].core;
        cn.setPos(0, this.coreY(t), 1.5); cn.setScale(side(t) === 0 ? 0.8 : 0.9); cn.visible = true;
        C.LANES.forEach((lx, l) => {
          const n = this.towerNodes[side(t)][l];
          n.mat = this.teamMats[side(t)].tower;
          n.setPos(this.laneX(l), this.towerY(t), 0);
          n.rz = side(t) === 0 ? 0 : Math.PI;
          n.visible = true;
        });
      }
    }

    hideAll() {
      if (!this.nodes) return;
      this.nodes.forEach((n) => { n.root.visible = false; });
      this.coreNodes.forEach((n) => { n.visible = false; });
      this.walls.forEach((n) => { n.visible = false; });
      this.towerNodes.forEach((a) => a.forEach((n) => { n.visible = false; }));
      this.droneNodes.forEach((n) => { n.visible = false; });
      this.campNodes.forEach((n) => { n.visible = false; });
    }

    // --------- autoridad ---------
    isLive(u) {
      if (u.me) return true;
      if (!u.human || this.mode !== 'online') return false;
      return performance.now() - u.lastSeen < 5000; // estable entre clientes
    }
    hostUnit() {
      for (const e of this.lineup) { if (!e[4]) continue; const u = this.units.find((x) => x.id === e[0]); if (u && this.isLive(u)) return u; }
      return this.me;
    }
    amHost() { return this.hostUnit() === this.me; }

    teamDmg(team) { const b = this.buffs; return (b.red.team === team && b.red.t > 0 ? 1.3 : 1) * (b.titan.team === team && b.titan.t > 0 ? 1.25 : 1); }
    cdMult(team) { const b = this.buffs.blue; return b.team === team && b.t > 0 ? 0.6 : 1; }
    vulnerable(team) { return this.towers[team].some((t) => !t.alive); }

    // ================= Bucle del partido =================
    updateMatch(dt) {
      const g = this.game;
      if (this.phase !== 'match' && this.phase !== 'ending') return;
      this.t += dt;
      const me = this.me, p = g.player;
      me.x = p.x;
      if (me.alive) {
        const f = g.pvp.myFireState();
        me.fr = f.fr; me.n = f.n; me.big = f.big; me.dmg = f.dmg; me.dm = f.dm; me.bt = f.bt;
      } else {
        me.respawnT -= dt;
        $('t-respv').textContent = Math.max(0, Math.ceil(me.respawnT));
        if (me.respawnT <= 0) this.respawnMe();
      }
      if (me.shieldT > 0) me.shieldT -= dt;
      this.myAb.cd = Math.max(0, this.myAb.cd - dt);
      if (this.myAb.charge > 0) { this.myAb.charge -= dt; if (this.myAb.charge <= 0) this.fireEvent(me); }
      if (me.wallT > 0) me.wallT -= dt;
      if (me.role === 'support') me.ht = me.alive ? this.pickHealTarget(me) : null;

      this.boostT -= dt;
      if (this.boostT <= 0) {
        this.boostT = 20;
        g.pickups.spawnBoost(this.homeX(me) + (this.boostRng() - 0.5) * 2, 6, ['multi', 'rapid', 'big', 'damage', 'shield'][Math.floor(this.boostRng() * 5)]);
      }

      const host = this.amHost();
      if (host && !this.wasHost && this.mode === 'online' && this.t > 1) g.ui.toast('AHORA SOS EL ANFITRIÓN', '#ffc83d');
      this.wasHost = host;
      if (this.mode === 'online') this.syncNet(host);
      if (host) {
        for (const u of this.units) if (!u.human && !u.me) this.botUpdate(u, dt);
        this.simWorld(dt);
      } else this.predictWorld(dt);

      // curación y escudos (cada autoridad aplica lo suyo)
      for (const u of this.units) {
        if (u.role !== 'support' || !u.alive) continue;
        if (u.so > u.soSeen) {
          u.soSeen = u.so;
          for (const v of this.units) if (v.team === u.team && v.alive && (v.me || (!v.human && host))) v.shieldT = C.SHIELD_T;
          g.fx.shock(u.x, this.uy(u), 6, [0.4, 1, 0.6], 0.6);
        }
        if (!u.ht) continue;
        const tgt = this.units.find((v) => v.id === u.ht);
        if (!tgt || !tgt.alive || tgt.team !== u.team || Math.abs(tgt.x - u.x) > C.HEAL_RANGE + 0.5) continue;
        if (tgt.me || (!tgt.human && host)) {
          const before = tgt.hp;
          tgt.hp = Math.min(tgt.max, tgt.hp + C.HEAL_RATE * dt);
          if (u.me) this.stats.healed += tgt.hp - before;
        } else if (u.me && tgt.hp < tgt.max) this.stats.healed += C.HEAL_RATE * dt;
      }
      for (const u of this.units) {
        if (u.me) continue;
        if (u.pc > u.pcSeen) { u.pcSeen = u.pc; this.applyEvent(u, u.px); }
      }
      for (const t of [0, 1]) this.towers[t].forEach((tw, l) => { if (tw.shots > tw.seen) { tw.seen = tw.shots; this.towerFired(t, l, tw.tgt); } });

      for (const u of this.units) {
        if (u.me) continue;
        this.updateUnitVisual(u, dt);
        if (u.alive && this.phase === 'match') {
          u.fireT -= dt;
          if (u.fireT <= 0) { u.fireT += 1 / Math.max(0.5, u.fr); if (u.fireT < -0.3) u.fireT = 0; this.fireUnit(u); }
        }
        if (!u.human && host) { if (u.wallT > 0) u.wallT -= dt; if (u.shieldT > 0) u.shieldT -= dt; }
      }
      this.updateVisuals(dt);
      if (!this.result) {
        const my = this.core[this.myTeam], en = this.core[1 - this.myTeam];
        if (en <= 0 || my <= 0) { this.endT += dt; if (this.endT > 2.2) this.finish(en <= 0 && my > 0 ? 1 : my <= 0 && en > 0 ? 0 : 0.5, 'core'); }
        else if (this.t >= C.DURATION) {
          const tw = (t) => this.towers[t].filter((x) => x.alive).length;
          const a = tw(this.myTeam) * 10000 + my, b = tw(1 - this.myTeam) * 10000 + en;
          this.finish(a > b ? 1 : a < b ? 0 : 0.5, 'time');
        }
      }
      this.updateHud();
    }

    respawnMe() {
      const g = this.game, me = this.me, p = g.player;
      me.alive = true; me.hp = me.max; me.shieldT = 1.5;
      g.playerDead = false;
      p.node.visible = true;
      p.x = p.targetX = this.homeX(me);
      p.invuln = 1.2;
      $('t-resp').hidden = true;
      g.fx.shock(p.x, p.y, 3, [0.4, 0.9, 1], 0.5);
      g.audio.sfx('boost');
    }
    respawnTime() { return Math.min(12, 6 + this.t / 60); }

    // ================= Mundo compartido (solo anfitrión) =================
    simWorld(dt) {
      const g = this.game;
      this.waveT -= dt;
      if (this.waveT <= 0) {
        this.waveT = C.WAVE_EVERY;
        for (const t of [0, 1]) for (let l = 0; l < 3; l++) for (let k = 0; k < 3; k++) {
          if (this.drones.length >= C.MAX_DRONES) break;
          const tit = this.buffs.titan.team === t && this.buffs.titan.t > 0;
          const hp = C.DRONE_HP * (tit ? 1.5 : 1);
          this.drones.push({ id: this.nextDrone++, team: t, lane: l, d: -k * 0.8, hp, max: hp, alive: true, flash: 0 });
        }
      }
      for (const d of this.drones) {
        if (!d.alive) continue;
        const et = 1 - d.team, tw = this.towers[et][d.lane];
        let foe = null;
        for (const e of this.drones) if (e.alive && e.team === et && e.lane === d.lane && d.d + e.d >= C.DL - 1.3) { if (!foe || e.d > foe.d) foe = e; }
        const dps = C.DRONE_DPS * this.teamDmg(d.team) * dt;
        if (foe) { foe.hp -= dps; foe.flash = 0.4; if (foe.hp <= 0) this.killDrone(foe); continue; }
        const stopTower = C.DL - C.TOWER_D - 1.4;
        if (tw.alive && d.d >= stopTower) { tw.hp -= dps * 0.9; tw.flash = 0.3; if (tw.hp <= 0) this.killTower(et, d.lane); continue; }
        if (!tw.alive && d.d >= C.DL - 0.4) { if (this.vulnerable(et)) this.core[et] = Math.max(0, this.core[et] - dps * 0.6); continue; }
        d.d += C.DRONE_SPEED * dt;
      }
      this.drones = this.drones.filter((d) => d.alive);
      for (const t of [0, 1]) this.towers[t].forEach((tw, l) => {
        if (!tw.alive) return;
        tw.cd -= dt;
        if (tw.cd > 0) return;
        const et = 1 - t;
        let best = null;
        for (const d of this.drones) if (d.alive && d.team === et && d.lane === l && d.d >= C.DL - C.TOWER_D - 3.2) { if (!best || d.d > best.d) best = d; }
        if (best) { tw.cd = C.TOWER_CD; tw.shots++; tw.tgt = 'd' + best.id; best.hp -= 16; best.flash = 0.5; if (best.hp <= 0) this.killDrone(best); return; }
        const tx = this.laneX(l);
        let tu = null, bd = 1.7;
        for (const u of this.units) if (u.team === et && u.alive && Math.abs(u.x - tx) < bd) { bd = Math.abs(u.x - tx); tu = u; }
        if (tu) { tw.cd = C.TOWER_CD; tw.shots++; tw.tgt = tu.id; }
      });
      this.camps.forEach((c, i) => {
        if (!c.alive) { c.respawnT -= dt; if (c.respawnT <= 0) { c.alive = true; c.hp = c.max; c.last = -1; if (i === 2) g.ui.toast('¡EL TITÁN APARECIÓ EN EL RÍO!', '#ff8a3b'); } }
      });
      for (const k of ['red', 'blue', 'titan']) if (this.buffs[k].t > 0) this.buffs[k].t -= dt;
    }
    predictWorld(dt) {
      for (const d of this.drones) if (d.alive && d.moving) d.d += C.DRONE_SPEED * dt * 0.9;
      for (const k of ['red', 'blue', 'titan']) if (this.buffs[k].t > 0) this.buffs[k].t -= dt;
    }

    killDrone(d) {
      if (!d.alive) return;
      d.alive = false;
      this.game.fx.explode(this.laneX(d.lane), this.droneY(d), 0.9, 0.5, d.team === this.myTeam ? [0.4, 0.8, 1] : [1, 0.4, 0.4], 0.6);
    }
    killTower(team, l) {
      const tw = this.towers[team][l];
      if (!tw.alive) return;
      tw.alive = false; tw.hp = 0;
      const g = this.game, x = this.laneX(l), y = this.towerY(team);
      g.fx.explode(x, y, 1.5, 2.2, team === this.myTeam ? [0.4, 0.8, 1] : [1, 0.45, 0.35], 1.6);
      g.world.addShake(0.7);
      g.audio.sfx('explodeBig');
      g.ui.toast((team === this.myTeam ? 'CAYÓ TU TORRETA ' : '¡TORRETA ENEMIGA DESTRUIDA! ') + C.LANE_NAMES[l], team === this.myTeam ? '#ff6b80' : '#5cff9d');
      if (!this.coreWarned[team]) { this.coreWarned[team] = true; g.ui.toast(team === this.myTeam ? 'TU NÚCLEO QUEDÓ EXPUESTO' : 'EL NÚCLEO ENEMIGO QUEDÓ EXPUESTO', '#ffc83d'); }
    }
    killCamp(i, team) {
      const c = this.camps[i], g = this.game;
      if (!c.alive) return;
      c.alive = false; c.respawnT = C.CAMPS[i].respawn;
      const k = C.CAMPS[i].k;
      if (team >= 0) { this.buffs[k] = { team, t: C.BUFF_T }; if (team === this.myTeam) this.stats.objectives++; }
      g.fx.explode(this.campX(i), C.MIDY, 1.4, i === 2 ? 3 : 1.8, i === 0 ? [1, 0.4, 0.3] : i === 1 ? [0.4, 0.6, 1] : [1, 0.6, 0.2], 1.4);
      g.audio.sfx('explodeBig');
      const names = { red: 'NEBULOSA ROJA (+30% DAÑO)', blue: 'NEBULOSA AZUL (−40% RECARGA)', titan: 'TITÁN (+25% DAÑO Y DRONES FUERTES)' };
      g.ui.toast((team === this.myTeam ? 'TU EQUIPO TOMÓ ' : 'EL RIVAL TOMÓ ') + names[k], team === this.myTeam ? '#5cff9d' : '#ff6b80');
      this.announced = this.announced || {};
      this.announced[k] = team;
    }

    // ---------- red ----------
    syncNet(host) {
      const me = this.me, n = this.net;
      const pub = {
        st: 'tm', mid: this.mid, x: +me.x.toFixed(2), hp: Math.round(me.hp), al: me.alive, fr: me.fr, n: me.n, big: me.big, dmg: me.dmg, dm: me.dm, bt: me.bt,
        wo: +Math.max(0, me.wallT).toFixed(1), wx: +me.wallX.toFixed(2), pc: me.pc, px: +me.px.toFixed(2), so: me.so, ht: me.ht || null,
      };
      if (host) {
        const X = (x) => +x.toFixed(2);
        pub.bots = this.units.filter((u) => !u.human && !u.me).map((u) => [u.id, X(u.x), Math.round(u.hp), u.alive ? 1 : 0, +Math.max(0, u.wallT).toFixed(1), X(u.wallX), u.pc, X(u.px), u.so, u.ht || 0, +Math.max(0, u.shieldT).toFixed(1)]);
        const tw = [], ts = [], tt = [];
        for (const t of [0, 1]) this.towers[t].forEach((x) => { tw.push(x.alive ? Math.round(x.hp) : -1); ts.push(x.shots); tt.push(x.tgt || ''); });
        const dr = [];
        for (const d of this.drones) if (d.alive) dr.push(d.id, d.team, d.lane, Math.round(d.d * 10), Math.round(d.hp));
        pub.w = {
          c: [Math.round(this.core[0]), Math.round(this.core[1])], tw, ts, tt, dr,
          cp: this.camps.map((c) => [c.alive ? Math.round(c.hp) : -1, Math.round(c.respawnT)]),
          bf: ['red', 'blue', 'titan'].map((k) => [this.buffs[k].team, Math.round(this.buffs[k].t)]),
          wv: +this.waveT.toFixed(1), nd: this.nextDrone,
        };
      } else { pub.bots = null; pub.w = null; }
      n.publish(pub);
      for (const u of this.units) {
        if (u.me || !u.human) continue;
        const p = n.peer(u.id);
        if (!p || p.presence.mid !== this.mid) continue;
        this.applyRemote(u, p.presence, u.team);
        u.lastSeen = performance.now();
      }
      const hostU = this.hostUnit();
      if (!host && hostU && !hostU.me) {
        const p = n.peer(hostU.id);
        if (!p) return;
        const pr = p.presence;
        if (Array.isArray(pr.bots)) {
          for (const b of pr.bots) {
            const u = this.units.find((x) => x.id === b[0]);
            if (!u || u.human) continue;
            u.tx = this.conv(+b[1] || 0, hostU.team);
            const al = !!b[3];
            if (u.alive && !al) this.onUnitDeath(u);
            if (!u.alive && al) this.onUnitRespawn(u);
            u.hp = +b[2]; u.alive = al;
            u.wallT = +b[4] || 0; u.wallX = this.conv(+b[5] || 0, hostU.team);
            if (+b[6] > u.pc) { u.pc = +b[6]; u.px = this.conv(+b[7] || 0, hostU.team); }
            if (+b[8] > u.so) u.so = +b[8];
            u.ht = b[9] || null; u.shieldT = +b[10] || 0;
          }
        }
        if (pr.w && typeof pr.w === 'object') this.applyWorld(pr.w);
      }
    }

    applyWorld(w) {
      if (Array.isArray(w.c)) { this.core[0] = +w.c[0]; this.core[1] = +w.c[1]; }
      if (Array.isArray(w.tw)) {
        let i = 0;
        for (const t of [0, 1]) this.towers[t].forEach((tw, l) => {
          const hp = +w.tw[i];
          if (hp < 0 && tw.alive) this.killTower(t, l);
          else if (hp >= 0) { if (hp < tw.hp) tw.flash = 0.3; tw.hp = hp; }
          if (+w.ts[i] > tw.shots) { tw.shots = +w.ts[i]; tw.tgt = String(w.tt[i] || ''); }
          i++;
        });
      }
      if (Array.isArray(w.dr)) {
        const seen = new Set();
        for (let i = 0; i + 4 < w.dr.length; i += 5) {
          const id = +w.dr[i];
          seen.add(id);
          let d = this.drones.find((x) => x.id === id);
          const nd = +w.dr[i + 3] / 10;
          if (!d) { d = { id, team: +w.dr[i + 1], lane: +w.dr[i + 2], d: nd, lastD: nd, hp: +w.dr[i + 4], max: C.DRONE_HP, alive: true, flash: 0 }; this.drones.push(d); }
          d.moving = nd > d.lastD + 0.01; d.lastD = nd;
          d.d = Math.abs(nd - d.d) > 0.6 ? nd : d.d + (nd - d.d) * 0.3;
          if (+w.dr[i + 4] < d.hp) d.flash = 0.3;
          d.hp = +w.dr[i + 4];
          if (d.hp > d.max) d.max = d.hp;
        }
        for (const d of this.drones) if (d.alive && !seen.has(d.id)) this.killDrone(d);
        this.drones = this.drones.filter((d) => d.alive);
      }
      if (Array.isArray(w.cp)) w.cp.forEach((c, i) => {
        const cm = this.camps[i];
        if (!cm || !Array.isArray(c)) return;
        const hp = +c[0];
        if (hp < 0 && cm.alive) { cm.alive = false; this.game.fx.explode(this.campX(i), C.MIDY, 1.4, 1.8, [1, 0.6, 0.3], 1.2); }
        else if (hp >= 0) { if (!cm.alive && i === 2) this.game.ui.toast('¡EL TITÁN APARECIÓ EN EL RÍO!', '#ff8a3b'); cm.alive = true; if (hp < cm.hp) cm.flash = 0.3; cm.hp = hp; }
        cm.respawnT = +c[1] || 0;
      });
      if (Array.isArray(w.bf)) ['red', 'blue', 'titan'].forEach((k, i) => {
        const b = w.bf[i];
        if (!Array.isArray(b)) return;
        const team = +b[0], t = +b[1];
        if (team >= 0 && t > 0 && (this.buffs[k].team !== team || this.buffs[k].t <= 0)) {
          if (team === this.myTeam) this.stats.objectives += 0; // la cuenta propia la lleva quien castiga
          const names = { red: 'NEBULOSA ROJA', blue: 'NEBULOSA AZUL', titan: 'TITÁN' };
          this.game.ui.toast((team === this.myTeam ? 'TU EQUIPO TOMÓ ' : 'EL RIVAL TOMÓ ') + names[k], team === this.myTeam ? '#5cff9d' : '#ff6b80');
        }
        this.buffs[k] = { team, t };
      });
      if (typeof w.wv === 'number') this.waveT = w.wv;
      if (typeof w.nd === 'number') this.nextDrone = Math.max(this.nextDrone, w.nd);
    }

    applyRemote(u, pr, team) {
      u.tx = this.conv(+pr.x || 0, team);
      const al = pr.al !== false;
      if (u.alive && !al) this.onUnitDeath(u);
      if (!u.alive && al) this.onUnitRespawn(u);
      u.alive = al;
      u.hp = +pr.hp || 0;
      u.fr = U.clamp(+pr.fr || 5, 0.5, 20); u.n = U.clamp(+pr.n || 1, 1, 7); u.big = !!pr.big;
      u.dmg = U.clamp(+pr.dmg || 1, 0.2, 4); u.dm = U.clamp(+pr.dm || 1, 1, 2); u.bt = String(pr.bt || 'plasma');
      u.wallT = +pr.wo || 0; u.wallX = this.conv(+pr.wx || 0, team);
      if ((+pr.pc || 0) > u.pc) { u.pc = +pr.pc; u.px = this.conv(+pr.px || 0, team); }
      if ((+pr.so || 0) > u.so) u.so = +pr.so;
      u.ht = pr.ht || null;
    }

    // ---------- IA de bots (solo el anfitrión) ----------
    botUpdate(u, dt) {
      const R = ROLES[u.role];
      if (!u.alive) {
        u.respawnT -= dt;
        if (u.respawnT <= 0) { u.alive = true; u.hp = u.max; u.shieldT = 1.5; u.x = u.tx = this.homeX(u); this.onUnitRespawn(u); }
        return;
      }
      u.cd = Math.max(0, u.cd - dt);
      u.thinkT -= dt;
      const enemies = this.units.filter((v) => v.team !== u.team && v.alive);
      const allies = this.units.filter((v) => v.team === u.team && v.alive);
      if (u.thinkT <= 0) {
        u.thinkT = U.rand(0.3, 0.7);
        let tx = this.homeX(u);
        if (u.role === 'jungle') {
          let best = -1, bd = 99;
          this.camps.forEach((c, i) => { if (c.alive) { const dd = Math.abs(this.campX(i) - u.x); if (dd < bd) { bd = dd; best = i; } } });
          if (best >= 0) tx = this.campX(best) + U.rand(-0.3, 0.3);
          else { if (u.gank === undefined || Math.random() < 0.1) u.gank = U.randi(0, 2); tx = this.laneX(u.gank) + U.rand(-1, 1); }
          if (best >= 0 && u.cd <= 0 && this.camps[best].hp < C.SMITE + 20 && Math.abs(this.campX(best) - u.x) < 1.2) this.botEvent(u, R);
        } else if (u.role === 'support') {
          const adc = allies.find((v) => v.role === 'adc');
          tx = (adc ? adc.x + (this.homeX(u) > 0 ? 1.3 : -1.3) : this.homeX(u)) + U.rand(-0.5, 0.5);
        } else {
          const lx = this.laneX(R.lane);
          const foes = enemies.filter((v) => Math.abs(v.x - lx) < 2.4).sort((a, b) => a.hp / a.max - b.hp / b.max);
          tx = foes[0] ? foes[0].x + U.rand(-0.9, 0.9) : lx + U.rand(-1.3, 1.3);
          tx = U.clamp(tx, lx - 1.9, lx + 1.9);
          if (Math.abs(tx - u.x) < 0.25) tx += U.rand(0.4, 0.9) * (Math.random() < 0.5 ? -1 : 1); // nunca quieto
        }
        const down = u.team === this.myTeam;
        for (const b of this.game.bullets.eb) {
          if (!b.alive || b.tmTeam === undefined || b.tmTeam === u.team) continue;
          const dy = down ? b.y - this.uy(u) : this.uy(u) - b.y;
          if (dy > 0 && dy < 5 && Math.abs(b.x - u.x) < 0.8 && Math.random() < 0.35) { tx = u.x + (b.x > u.x ? -1.6 : 1.6); break; }
        }
        u.tx = U.clamp(tx, -C.HALFW + 0.8, C.HALFW - 0.8);
        if (u.cd <= 0) {
          if (u.role === 'top' && (enemies.some((v) => Math.abs(v.x - u.x) < 2) || Math.random() < 0.2)) { u.wallT = C.WALL_T; u.wallX = u.x; u.cd = R.cd; }
          else if ((u.role === 'adc' || u.role === 'mid') && (enemies.some((v) => Math.abs(v.x - u.x) < 1.5) || Math.random() < 0.25)) this.botEvent(u, R);
          else if (u.role === 'support' && allies.some((v) => v.hp / v.max < 0.55)) { u.so++; u.cd = R.cd; }
        }
      }
      const sp = R.speed * dt;
      u.x += U.clamp(u.tx - u.x, -sp, sp);
      if (u.role === 'support') u.ht = this.pickHealTarget(u);
    }
    botEvent(u, R) { u.pc++; u.px = u.x; u.pcSeen = u.pc; u.cd = R.cd * this.cdMult(u.team); this.applyEvent(u, u.px); }

    pickHealTarget(s) {
      let best = null, bf = 0.98;
      for (const v of this.units) {
        if (v === s || v.team !== s.team || !v.alive || Math.abs(v.x - s.x) > C.HEAL_RANGE) continue;
        const f = v.hp / v.max;
        if (f < bf) { bf = f; best = v; }
      }
      return best ? best.id : null;
    }

    updateUnitVisual(u, dt) {
      if (u.human || !this.amHost()) u.x = U.damp(u.x, u.tx, 12, dt);
      u.flash = Math.max(0, u.flash - dt * 6);
      u.recoil = Math.max(0, u.recoil - dt * 7);
      const n = u.node;
      if (!n) return;
      n.root.visible = u.alive;
      n.root.px = u.x; n.root.py = this.uy(u); n.root.pz = 0.05 + Math.sin(this.t * 3 + u.slot) * 0.05;
      n.barrel.py = 0.25 - u.recoil * 0.22;
      n.base.flash = n.turret.flash = n.barrel.flash = u.flash;
    }

    onUnitDeath(u) {
      const g = this.game, y = this.uy(u);
      u.alive = false; u.respawnT = this.respawnTime();
      g.fx.explode(u.x, y, 0.8, 1.4, u.team === this.myTeam ? [0.4, 0.8, 1] : [1, 0.4, 0.3], 1.2);
      g.audio.sfx('explodeBig');
      if (u.team === this.myTeam) g.ui.toast('ALIADO CAÍDO · ' + ROLES[u.role].name, '#ff6b80');
      else { g.ui.toast('¡ENEMIGO DESTRUIDO! · ' + ROLES[u.role].name, '#5cff9d'); if (u.lastHitByMe && performance.now() - u.lastHitByMe < 1500) this.stats.kills++; }
    }
    onUnitRespawn(u) { this.game.fx.shock(u.x, this.uy(u), 3, [0.6, 0.9, 1], 0.5); }

    // ---------- disparos simulados ----------
    fireUnit(u) {
      const g = this.game, ally = u.team === this.myTeam;
      const bt = BB.BULLET_TYPES[u.bt] || BB.BULLET_TYPES.plasma;
      const pat = BB.firePattern(u.n);
      const per = BB.volleyFactor(u.n) / u.n;
      const dmg = u.dmg * u.dm * (u.big ? 1.5 : 1) * per * this.teamDmg(u.team);
      const r = bt.r * (u.big ? 2 : 1) * 1.2;
      const sp = bt.speed * 0.85, dir = ally ? 1 : -1, y0 = this.uy(u) + dir * 1.1;
      const col = ally ? [0.45, 0.9, 1] : [1, 0.35, 0.45];
      for (const pt of pat) {
        const b = g.bullets.fireEnemy(u.x + pt.ox * dir, y0, Math.sin(pt.ang) * sp * dir, Math.cos(pt.ang) * sp * dir, 'rival', { z: 0.7, r, dmg, col, life: 1.8, pvp: true });
        if (b) { b.tmTeam = u.team; b.owner = u.id; b.role = u.role; }
      }
      u.recoil = 1;
    }

    // Torreta dispara: contra dron (rayo visual) o contra nave (proyectil; decide la víctima)
    towerFired(team, l, tgt) {
      const g = this.game, x = this.laneX(l), y = this.towerY(team);
      const ally = team === this.myTeam, col = ally ? [0.5, 0.9, 1] : [1, 0.45, 0.45];
      if (tgt && tgt[0] === 'd') {
        const d = this.drones.find((q) => 'd' + q.id === tgt);
        const ty = d ? this.droneY(d) : y + (ally ? 3 : -3);
        this.beams.push({ x, y0: y, x1: x, y1: ty, t: 0.18, max: 0.18, w: 0.18, col });
        return;
      }
      const u = this.units.find((q) => q.id === tgt);
      if (!u || !u.alive) return;
      const ux = u.me ? g.player.x : u.x, uy = this.uy(u);
      const dx = ux - x, dy = uy - y, l2 = Math.hypot(dx, dy) || 1, sp = 16;
      const b = g.bullets.fireEnemy(x, y + (ally ? 1 : -1), (dx / l2) * sp, (dy / l2) * sp, 'big', { z: 2.0, r: 0.34, dmg: C.TOWER_SHOT, col, life: 2, pvp: true });
      if (b) { b.tmTeam = team; b.owner = 'tower'; b.role = 'tower'; }
      g.fx.emit(x, y, 2.05, 0, 0, 0, 0.12, 0.8, 1.4, col, 1, 0, true, 0, 0);
    }

    // ---------- habilidad del jugador ----------
    useAbility() {
      if (!this.inMatch() || !this.me.alive || this.myAb.cd > 0) return;
      const me = this.me, R = ROLES[me.role], g = this.game;
      this.myAb.cd = R.cd * this.cdMult(me.team);
      if (me.role === 'top') { me.wallT = C.WALL_T; me.wallX = me.x; g.audio.sfx('shieldBlock'); }
      else if (me.role === 'adc') { this.myAb.charge = 0.45; g.audio.sfx('laserCharge'); }
      else if (me.role === 'support') { me.so++; me.soSeen = me.so - 1; g.audio.sfx('boost'); }
      else this.fireEvent(me);
      g.vibrate(20);
    }
    fireEvent(me) {
      me.pc++; me.px = me.x; me.pcSeen = me.pc;
      this.applyEvent(me, me.px);
      this.game.audio.sfx(me.role === 'jungle' ? 'zap' : me.role === 'mid' ? 'shockwave' : 'laser');
    }

    // Habilidad de u en la columna px: PERFORANTE (adc), ONDA (mid) o CASTIGO (jungla)
    applyEvent(u, px) {
      const g = this.game, ally = u.team === this.myTeam, host = this.amHost(), et = 1 - u.team;
      const col = ally ? [0.5, 0.9, 1] : [1, 0.4, 0.4];
      const hitUnits = (w, dmg) => {
        for (const v of this.units) {
          if (v.team === u.team || !v.alive || Math.abs(v.x - px) > w) continue;
          if (v.me) this.damageMe(dmg); else if (!v.human && host) this.damageUnit(v, dmg);
          v.flash = 0.8;
          if (u.me) { this.stats.dealt += dmg; v.lastHitByMe = performance.now(); }
        }
      };
      const hitDrones = (w, dmg, maxN) => {
        if (!host) return;
        let n = 0;
        for (const d of this.drones) { if (d.alive && d.team === et && Math.abs(this.laneX(d.lane) - px) < w) { d.hp -= dmg; d.flash = 0.6; if (d.hp <= 0) this.killDrone(d); if (++n >= maxN) break; } }
      };
      if (u.role === 'adc') {
        const y0 = this.uy(u), y1 = ally ? C.CORE_HIGH + 1 : C.CORE_LOW - 1;
        this.beams.push({ x: px, y0, x1: px, y1, t: 0.5, max: 0.5, w: 1.2, col });
        hitUnits(0.9, C.PIERCE_DMG * this.teamDmg(u.team));
        hitDrones(0.9, 30, 99);
        C.LANES.forEach((lx, l) => { const tw = this.towers[et][l]; if (tw.alive && Math.abs(this.laneX(l) - px) < 1.0) { tw.flash = 0.6; if (host) { tw.hp -= 25; if (tw.hp <= 0) this.killTower(et, l); } } });
        if (Math.abs(px) < C.CORE_R + 0.3 && this.vulnerable(et)) { if (host) this.core[et] = Math.max(0, this.core[et] - C.PIERCE_CORE); this.coreFlash[et] = 1; }
        g.world.addShake(0.2);
      } else if (u.role === 'mid') {
        const y = ally ? C.RY : C.PY;
        g.fx.shock(px, y, C.ONDA_W * 2.2, [0.75, 0.45, 1], 0.6);
        g.fx.burst(px, y, 1, [0.8, 0.5, 1], 18, 7, 0.5, 0.5);
        this.beams.push({ x: px, y0: this.uy(u), x1: px, y1: y, t: 0.3, max: 0.3, w: 0.5, col: [0.8, 0.5, 1] });
        hitUnits(C.ONDA_W, C.ONDA_DMG * this.teamDmg(u.team));
        hitDrones(C.ONDA_W, 30, 99);
        C.LANES.forEach((lx, l) => { const tw = this.towers[et][l]; if (tw.alive && Math.abs(this.laneX(l) - px) < C.ONDA_W) { tw.flash = 0.6; if (host) { tw.hp -= 18; if (tw.hp <= 0) this.killTower(et, l); } } });
      } else if (u.role === 'jungle') {
        let done = false;
        this.camps.forEach((c, i) => {
          if (done || !c.alive || Math.abs(this.campX(i) - px) > 1.4) return;
          done = true;
          this.beams.push({ x: px, y0: this.uy(u), x1: this.campX(i), y1: C.MIDY, t: 0.35, max: 0.35, w: 0.45, col: [1, 0.85, 0.3] });
          c.flash = 1;
          if (host) { c.hp -= C.SMITE; c.last = u.team; if (c.hp <= 0) this.killCamp(i, u.team); }
        });
        if (!done) {
          this.beams.push({ x: px, y0: this.uy(u), x1: px, y1: C.MIDY, t: 0.3, max: 0.3, w: 0.35, col: [1, 0.85, 0.3] });
          hitDrones(1.4, C.SMITE, 2);
        }
      }
    }

    // ---------- daño ----------
    damageMe(dmg) {
      const g = this.game, me = this.me;
      if (!me || !me.alive || this.phase !== 'match') return;
      if (g.boosts.isActive('shield') || me.shieldT > 0) { g.fx.emit(g.player.x, g.player.y + 0.3, 0.9, 0, 0, 0, 0.15, 0.8, 1.6, [0.4, 1, 0.6], 0.8, 2, true, 0, 0); return; }
      if (me.role === 'top') dmg *= 0.5;
      me.hp = Math.max(0, me.hp - dmg);
      g.fx.sparks(g.player.x, g.player.y, 0.9, [1, 0.35, 0.35], 3, 6);
      if (!this.hurtT || performance.now() - this.hurtT > 250) { this.hurtT = performance.now(); g.ui.hurt(); g.audio.sfx('hit'); g.vibrate(12); g.world.addShake(0.1); }
      if (me.hp <= 0) this.killMe();
    }
    killMe() {
      const g = this.game, me = this.me, p = g.player;
      me.alive = false; me.respawnT = this.respawnTime(); this.stats.deaths++;
      g.fx.explode(p.x, p.y, 0.8, 1.6, [1, 0.5, 0.2], 1.4);
      p.node.visible = false;
      g.playerDead = true;
      g.world.addShake(0.8);
      g.audio.sfx('explodeBig');
      g.vibrate([120, 50, 160]);
      $('t-resp').hidden = false;
    }
    damageUnit(u, dmg) {
      if (!u.alive || u.shieldT > 0) return;
      if (u.role === 'top') dmg *= 0.5;
      u.hp -= dmg; u.flash = 0.6;
      if (u.hp <= 0) { u.hp = 0; this.onUnitDeath(u); }
    }

    // ---------- colisiones del modo ----------
    collide() {
      const g = this.game, host = this.amHost();
      const walls = this.activeWalls();
      const campHit = (b, team, role) => {
        for (let i = 0; i < 3; i++) {
          const c = this.camps[i];
          if (!c.alive) continue;
          const dx = this.campX(i) - b.x, dy = C.MIDY - b.y, rr = (i === 2 ? 1.3 : 0.95) + b.r;
          if (dx * dx + dy * dy < rr * rr) {
            c.flash = 0.4;
            if (host) { c.hp -= b.dmg * (role === 'jungle' ? 2 : 1); c.last = team; if (c.hp <= 0) this.killCamp(i, team); }
            g.collision.impact(b.x, b.y, 1.2, [1, 0.7, 0.4]);
            return true;
          }
        }
        return false;
      };
      const wallHit = (b, team) => {
        for (const w of walls) {
          if (w.team === team) continue;
          if (Math.abs(b.x - w.x) < C.WALL_W && Math.abs(b.y - w.y) < 0.45) {
            g.fx.emit(b.x, w.y, 0.8, 0, 0, 0, 0.12, 0.6, 1.2, w.team === this.myTeam ? [0.4, 0.8, 1] : [1, 0.4, 0.5], 1, 2, true, 0, 0);
            if (w.mine) this.stats.blocked += b.dmg;
            return true;
          }
        }
        return false;
      };
      const structHit = (b, team, mine) => {
        const et = 1 - team;
        for (let l = 0; l < 3; l++) {
          const tw = this.towers[et][l];
          if (!tw.alive) continue;
          const dx = this.laneX(l) - b.x, dy = this.towerY(et) - b.y, rr = C.TOWER_R + b.r;
          if (dx * dx + dy * dy < rr * rr) {
            tw.flash = 0.35;
            if (host) { tw.hp -= b.dmg; if (tw.hp <= 0) this.killTower(et, l); }
            if (mine) this.stats.dealt += b.dmg;
            g.collision.impact(b.x, b.y, 1.5, et === this.myTeam ? [0.4, 0.8, 1] : [1, 0.5, 0.5]);
            return true;
          }
        }
        for (const d of this.drones) {
          if (!d.alive || d.team !== et) continue;
          const dx = this.laneX(d.lane) - b.x, dy = this.droneY(d) - b.y, rr = 0.5 + b.r;
          if (dx * dx + dy * dy < rr * rr) {
            d.flash = 0.4;
            if (host) { d.hp -= b.dmg; if (d.hp <= 0) this.killDrone(d); }
            return true;
          }
        }
        return false;
      };
      const coreHit = (b, team, mine) => {
        const ct = 1 - team, cy = this.coreY(ct);
        if (Math.abs(b.x) < C.CORE_R && Math.abs(b.y - cy) < C.CORE_R) {
          if (this.vulnerable(ct)) {
            if (host) this.core[ct] = Math.max(0, this.core[ct] - b.dmg);
            if (mine) this.stats.dealt += b.dmg;
            this.coreFlash[ct] = 0.6;
            g.collision.impact(b.x, b.y, 1.2, ct === this.myTeam ? [0.4, 0.8, 1] : [1, 0.4, 0.5]);
          } else g.fx.emit(b.x, b.y, 1.4, 0, 0, 0, 0.15, 0.7, 1.4, [1, 1, 1], 0.6, 2, true, 0, 0);
          return true;
        }
        return false;
      };
      for (const b of g.bullets.eb) {
        if (!b.alive || b.tmTeam === undefined) continue;
        if (wallHit(b, b.tmTeam) || (b.role !== 'tower' && (campHit(b, b.tmTeam, b.role) || structHit(b, b.tmTeam, false)))) { b.alive = false; continue; }
        let done = false;
        for (const u of this.units) {
          if (u.team === b.tmTeam || !u.alive) continue;
          const uy = this.uy(u), ux = u.me ? g.player.x : u.x;
          const dx = ux - b.x, dy = uy - b.y, rr = C.UNIT_R + b.r;
          if (dx * dx + dy * dy < rr * rr) {
            if (u.me) this.damageMe(b.dmg);
            else { u.flash = 0.5; if (!u.human && host) this.damageUnit(u, b.dmg); }
            b.alive = false; done = true;
            break;
          }
        }
        if (done) continue;
        if (b.role !== 'tower' && coreHit(b, b.tmTeam, false)) b.alive = false;
      }
      const my = this.myTeam, myRole = this.me.role, k = this.teamDmg(my);
      for (const b of g.bullets.pb) {
        if (!b.alive) continue;
        if (!b.buffed) { b.dmg *= k; b.buffed = true; }
        if (wallHit(b, my) || campHit(b, my, myRole) || structHit(b, my, true)) { b.alive = false; continue; }
        let done = false;
        for (const u of this.units) {
          if (u.team === my || !u.alive) continue;
          const dx = u.x - b.x, dy = C.RY - b.y, rr = C.UNIT_R + b.r;
          if (dx * dx + dy * dy < rr * rr) {
            u.flash = 0.6; u.lastHitByMe = performance.now();
            if (!u.human && host) this.damageUnit(u, b.dmg);
            this.stats.dealt += b.dmg;
            g.collision.impact(b.x, b.y, b.z, [1, 0.5, 0.5]);
            b.alive = false; done = true; break;
          }
        }
        if (done) continue;
        if (coreHit(b, my, true)) b.alive = false;
      }
    }

    activeWalls() {
      const out = [];
      for (const u of this.units) {
        if (!u.alive || u.role !== 'top' || !(u.wallT > 0)) continue;
        out.push({ x: u.wallX, y: u.team === this.myTeam ? C.PY + 1.8 : C.RY - 1.8, team: u.team, mine: u.me });
      }
      return out;
    }

    updateVisuals(dt) {
      const g = this.game;
      const ws = this.activeWalls();
      this.walls.forEach((n, i) => {
        const w = ws[i];
        n.visible = !!w;
        if (!w) return;
        n.mat = this.wallMats[w.team === this.myTeam ? 0 : 1];
        n.setPos(w.x, w.y, 0.75);
      });
      for (const t of [0, 1]) {
        const side = t === this.myTeam ? 0 : 1, n = this.coreNodes[side];
        this.coreFlash[t] = Math.max(0, this.coreFlash[t] - dt * 4);
        n.flash = this.coreFlash[t] * 0.5;
        n.rz += dt * 0.6;
        n.pz = 1.5 + Math.sin(this.t * 1.5 + t) * 0.12;
        if (this.core[t] <= 0 && !this.coreDead[t]) {
          this.coreDead[t] = true;
          const y = this.coreY(t);
          g.fx.explode(0, y, 2, 4, t === this.myTeam ? [0.4, 0.8, 1] : [1, 0.4, 0.4], 2);
          g.fx.shock(0, y, 18, [1, 0.9, 0.7], 1.2);
          g.world.addShake(1.3);
          g.audio.sfx('explodeBig');
          g.vibrate([200, 80, 300]);
          n.visible = false;
          g.ui.banner(t === this.myTeam ? 'NÚCLEO PERDIDO' : '¡NÚCLEO DESTRUIDO!', null, false, 2);
        }
        this.towers[t].forEach((tw, l) => {
          const tn = this.towerNodes[side][l];
          tn.visible = tw.alive;
          tw.flash = Math.max(0, (tw.flash || 0) - dt * 4);
          tn.flash = tw.flash;
          tn.glow = 1 + Math.sin(this.t * 4 + l) * 0.3;
        });
      }
      let k = 0;
      for (const d of this.drones) {
        if (!d.alive || k >= this.droneNodes.length) continue;
        const n = this.droneNodes[k++];
        n.visible = true;
        n.mat = this.teamMats[d.team === this.myTeam ? 0 : 1].drone;
        n.setPos(this.laneX(d.lane), this.droneY(d), 0.9 + Math.sin(this.t * 4 + d.id) * 0.1);
        n.setScale(0.42);
        n.rz = d.team === this.myTeam ? 0 : Math.PI;
        d.flash = Math.max(0, (d.flash || 0) - dt * 5);
        n.flash = d.flash;
      }
      for (; k < this.droneNodes.length; k++) this.droneNodes[k].visible = false;
      this.camps.forEach((c, i) => {
        const n = this.campNodes[i];
        n.visible = c.alive;
        c.flash = Math.max(0, (c.flash || 0) - dt * 5);
        n.flash = c.flash;
        n.setPos(this.campX(i), C.MIDY, 1.4 + Math.sin(this.t * 2 + i) * 0.2);
        n.rz = i === 2 ? this.t * 0.4 : Math.sin(this.t + i) * 0.4;
      });
    }

    // ================= Resultado =================
    finish(S, reason) {
      if (this.result) return;
      const g = this.game, d = this.data;
      const before = d.trophies, liB = BB.leagueOf(before);
      let dt = 0;
      if (this.ranked) {
        const enemies = this.lineup.filter((e) => e[1] !== this.myTeam);
        const avg = enemies.reduce((s, e) => s + (e[4] ? +e[6] || 0 : before), 0) / enemies.length;
        dt = Math.round(BB.trophyDelta(before, avg, S) * 0.8);
      }
      d.trophies = Math.max(0, before + dt);
      if (S === 1) d.wins++; else if (S === 0) d.losses++; else d.draws++;
      const st = this.stats;
      const score = st.dealt + st.healed * 1.3 + st.blocked * 1.2 + st.objectives * 120 + st.kills * 60 - st.deaths * 20;
      const mvp = score > 450;
      if (mvp) d.mvp++;
      const coins = this.ranked ? (S === 1 ? 150 : S === 0.5 ? 60 : 30) : (S === 1 ? 50 : 20);
      g.addCoins(coins);
      const liA = BB.leagueOf(d.trophies);
      let promo = null;
      if (liA > liB) { promo = BB.LEAGUES[liA]; if ((d.rewarded || 0) < liA) { g.addCoins(promo.reward); d.rewarded = liA; } }
      g.save.save(true);
      this.result = { S, reason, dt, before, after: d.trophies, coins, promo, mvp };
      this.phase = 'result';
      if (this.mode === 'online') this.net.publish({ st: 'tp', bots: null, w: null }, true);
      g.setState(BB.STATES.TEAM_RESULT);
      g.audio.sfx(S === 1 ? 'victory' : S === 0 ? 'gameover' : 'levelUp');
      g.audio.playMusic(S === 1 ? 'menu' : 'over');
      setTimeout(() => this.showResult(), 1000);
    }

    showResult() {
      const r = this.result, g = this.game;
      if (!r || g.state !== BB.STATES.TEAM_RESULT) return;
      $('t-hud').hidden = true; $('t-abil').hidden = true; $('h-timer').hidden = true; $('t-resp').hidden = true;
      $('tr-title').textContent = r.S === 1 ? 'VICTORIA' : r.S === 0 ? 'DERROTA' : 'EMPATE';
      $('tr-title').className = r.S === 1 ? 'win' : r.S === 0 ? 'lose' : 'draw';
      $('tr-why').textContent = r.reason === 'core' ? (r.S === 1 ? 'Núcleo enemigo destruido' : r.S === 0 ? 'Destruyeron tu núcleo' : 'Ambos núcleos cayeron') : r.S === 0.5 ? 'Tiempo: todo parejo' : 'Tiempo: ganó quien conservó más torretas';
      const pc = (t) => Math.round((this.core[t] / C.CORE_HP) * 100) + '%';
      const tw = (t) => this.towers[t].filter((x) => x.alive).length + '/3';
      $('tr-cores').innerHTML = '<div><small>TU NÚCLEO · TORRETAS ' + tw(this.myTeam) + '</small><b>' + pc(this.myTeam) + '</b></div><span>–</span><div><small>ENEMIGO · TORRETAS ' + tw(1 - this.myTeam) + '</small><b>' + pc(1 - this.myTeam) + '</b></div>';
      const st = this.stats, R = ROLES[this.role];
      const rows = [['ROL', R.name + ' · ' + R.title], ['DAÑO HECHO', U.fmt(st.dealt)]];
      if (this.role === 'support') rows.push(['CURACIÓN', U.fmt(st.healed)]);
      if (this.role === 'top') rows.push(['DAÑO BLOQUEADO', U.fmt(st.blocked)]);
      rows.push(['OBJETIVOS DE JUNGLA', st.objectives], ['DERRIBOS', st.kills], ['CAÍDAS', st.deaths]);
      $('tr-stats').innerHTML = rows.map((x) => '<div class="row small"><span>' + x[0] + '</span><b>' + x[1] + '</b></div>').join('') + (r.mvp ? '<div class="badge">MVP DE TU ROL</div>' : '');
      const li = BB.leagueOf(r.after);
      $('tr-trophy').innerHTML = this.ranked
        ? g.pvp.leagueBadge(li, 52) + '<div><b class="' + (r.dt >= 0 ? 'up' : 'down') + '">' + (r.dt >= 0 ? '+' : '') + r.dt + '</b><span>🏆 ' + U.fmt(r.after) + ' · ' + BB.LEAGUES[li].name + '</span></div>'
        : '<div><b class="neutral">PRÁCTICA</b><span>Sin trofeos en juego</span></div>';
      $('tr-coins').textContent = '+' + U.fmt(r.coins);
      $('tr-promo').hidden = !r.promo;
      if (r.promo) $('tr-promo').innerHTML = '¡ASCENDISTE A <b style="color:' + r.promo.color + '">' + r.promo.name + '</b>! +' + U.fmt(r.promo.reward) + ' monedas';
      $('tr-again').textContent = this.mode === 'online' ? 'OTRA PARTIDA' : 'OTRA PRÁCTICA';
      g.ui.show('s-tres');
    }

    forfeit() {
      if (this.result) return;
      this.core[this.myTeam] = 0;
      this.finish(0, 'core');
    }

    leave() {
      clearInterval(this.cdTimer);
      if (this.net.available && this.mode === 'online') this.net.publish({ st: 'idle', mid: null, lu: null, bots: null, w: null, code: null }, true);
      this.phase = 'lobby';
      this.hideAll();
      ['t-hud', 't-abil', 't-resp', 't-search'].forEach((id) => { const e = $(id); if (e) e.hidden = true; });
      this.game.endTeamArena();
    }

    // ================= Render extra =================
    render(add, alpha, over) {
      if (this.game.state !== BB.STATES.TEAM || !this.units.length) return;
      const uvB = this.uvBeam || (this.uvBeam = BB.Tex.cellUV(12));
      const uvG = this.uvGlow || (this.uvGlow = BB.Tex.cellUV(0));
      const uvD = this.uvDot || (this.uvDot = BB.Tex.cellUV(11));
      const uvR = this.uvRing || (this.uvRing = BB.Tex.cellUV(2));
      const uvS = this.uvShock || (this.uvShock = BB.Tex.cellUV(5));
      const g = this.game;
      C.LANES.forEach((lx, l) => {
        const x = this.laneX(l);
        alpha.quad(x, 0.03, -4.9, 0.9, 0, 0, 0, 0, 0.9, BB.Tex.cellUV(BB.Tex.LANE_CELL[C.LANE_NAMES[l]]), 1, 1, 1, 0.55);
        add.quad(x, 0.02, -C.MIDY, 0.45, 0, 0, 0, 0, 5.8, uvB, 0.3, 0.5, 1, 0.12);
      });
      this.camps.forEach((c, i) => {
        const x = this.campX(i);
        if (!c.alive) { add.quad(x, 0.04, -C.MIDY, 1.1, 0, 0, 0, 0, 1.1, uvS, 0.5, 0.5, 0.6, 0.25); return; }
        const colc = i === 0 ? [1, 0.35, 0.3] : i === 1 ? [0.35, 0.6, 1] : [1, 0.6, 0.2];
        const r = 1.6 + (i === 2 ? 0.8 : 0);
        add.quad(x, 0.05, -C.MIDY, r, 0, 0, 0, 0, r, uvS, colc[0], colc[1], colc[2], 0.4);
        this.bar(over, x, C.MIDY, 3.0, c.hp / c.max, [1, 0.8, 0.3], uvD, 1.3);
      });
      for (const u of this.units) {
        if (u.role !== 'support' || !u.alive || !u.ht) continue;
        const t = this.units.find((v) => v.id === u.ht);
        if (!t || !t.alive) continue;
        const ux = u.me ? g.player.x : u.x, tx = t.me ? g.player.x : t.x;
        add.beam(ux, 1.0, -this.uy(u), tx, 1.0, -this.uy(t), 0.16, uvB, 0.3, 1, 0.5, 0.75);
        add.bill(tx, 1.2, -this.uy(t), 0.9, 0.9, this.t * 3, uvG, 0.3, 1, 0.5, 0.45);
      }
      for (let i = this.beams.length - 1; i >= 0; i--) {
        const b = this.beams[i];
        b.t -= 1 / 60;
        if (b.t <= 0) { this.beams.splice(i, 1); continue; }
        const k = b.t / b.max;
        const z = b.w > 0.3 ? 0.9 : 2.0;
        add.beam(b.x, z, -b.y0, b.x1, z, -b.y1, b.w * k, uvB, b.col[0], b.col[1], b.col[2], 0.9 * k);
        add.beam(b.x, z, -b.y0, b.x1, z, -b.y1, b.w * 0.3 * k, uvB, 1, 1, 1, k);
      }
      for (const u of this.units) {
        if (!u.alive) continue;
        const x = u.me ? g.player.x : u.x, y = this.uy(u), ally = u.team === this.myTeam;
        if (u.shieldT > 0) add.bill(x, 0.8, -y, 1.6, 1.6, this.t, uvR, 0.4, 1, 0.6, 0.8);
        if (u.me) continue;
        this.bar(over, x, y, 2.05, U.clamp(u.hp / u.max, 0, 1), ally ? [0.3, 0.9, 1] : [1, 0.3, 0.4], uvD);
        alpha.bill(x, 2.6, -y, 0.34, 0.34, 0, BB.Tex.cellUV(BB.Tex.ICON_CELL[ROLES[u.role].icon]), 1, 1, 1, 1);
      }
      for (const t of [0, 1]) {
        const ally = t === this.myTeam, col = ally ? [0.3, 0.9, 1] : [1, 0.3, 0.4];
        this.towers[t].forEach((tw, l) => { if (tw.alive) this.bar(over, this.laneX(l), this.towerY(t), 3.0, tw.hp / C.TOWER_HP, col, uvD, 1.2); });
        if (this.coreDead[t]) continue;
        const cy = this.coreY(t);
        this.bar(over, 0, cy, 3.6, this.core[t] / C.CORE_HP, col, uvD, 2.2);
        if (!this.vulnerable(t)) add.bill(0, 1.5, -cy, 2.3, 2.3, this.t * 0.5, uvR, 1, 1, 1, 0.35 + Math.sin(this.t * 3) * 0.1);
      }
      for (const d of this.drones) if (d.alive && d.hp < (d.max || C.DRONE_HP)) this.bar(over, this.laneX(d.lane), this.droneY(d), 1.5, d.hp / (d.max || C.DRONE_HP), d.team === this.myTeam ? [0.3, 0.9, 1] : [1, 0.3, 0.4], uvD, 0.6);
    }
    bar(batch, x, y, z, f, col, uv, w) {
      const R = batch.cam.right;
      w = w || 1.1;
      f = U.clamp(f, 0, 1);
      const h = 0.09 * (w > 2 ? 1.6 : 1);
      batch.bill(x, z, -y, w / 2 + 0.04, h + 0.04, 0, uv, 0.02, 0.03, 0.08, 0.85);
      const fw = (w / 2) * f, off = -(w / 2) + fw;
      batch.bill(x + R[0] * off, z + R[1] * off, -y + R[2] * off, fw, h, 0, uv, col[0], col[1], col[2], 1);
    }

    // ================= HUD =================
    updateHud() {
      const c = this.hudCache, me = this.me;
      const left = Math.max(0, C.DURATION - this.t);
      const tt = Math.floor(left / 60) + ':' + String(Math.floor(left % 60)).padStart(2, '0');
      if (c.t !== tt) { c.t = tt; const el = $('h-timer'); el.textContent = tt; el.classList.toggle('low', left < 20); }
      const a = Math.round(this.core[this.myTeam] / C.CORE_HP * 100), e = Math.round(this.core[1 - this.myTeam] / C.CORE_HP * 100);
      if (c.a !== a) { c.a = a; $('t-core0').style.width = a + '%'; $('t-core0v').textContent = a + '%'; }
      if (c.e !== e) { c.e = e; $('t-core1').style.width = e + '%'; $('t-core1v').textContent = e + '%'; }
      const twk = [0, 1].map((t) => this.towers[t].map((x) => (x.alive ? 1 : 0)).join('')).join('|');
      if (c.tw !== twk) {
        c.tw = twk;
        const row = (t) => C.LANE_NAMES.map((n, l) => '<span class="' + (this.towers[t][l].alive ? 'on' : 'off') + '">' + n + '</span>').join('') + (this.vulnerable(t) ? '<em>EXPUESTO</em>' : '');
        $('t-tw0').innerHTML = row(this.myTeam); $('t-tw1').innerHTML = row(1 - this.myTeam);
      }
      const bk = ['red', 'blue', 'titan'].map((k) => this.buffs[k].t > 0 ? k + this.buffs[k].team + Math.ceil(this.buffs[k].t) : '').join();
      if (c.bf !== bk) {
        c.bf = bk;
        const nm = { red: 'ROJA', blue: 'AZUL', titan: 'TITÁN' };
        $('t-buffs').innerHTML = ['red', 'blue', 'titan'].filter((k) => this.buffs[k].t > 0).map((k) => '<span class="bf ' + k + (this.buffs[k].team === this.myTeam ? ' mine' : ' theirs') + '">' + nm[k] + ' ' + Math.ceil(this.buffs[k].t) + 's</span>').join('');
      }
      const mh = Math.round(me.hp / me.max * 100);
      if (c.mh !== mh) { c.mh = mh; $('my-hp').style.width = Math.max(0, mh) + '%'; $('my-hpv').textContent = Math.max(0, mh) + '%'; $('my-hpw').classList.toggle('low', mh <= 25); }
      const R = ROLES[me.role];
      const cdMax = R.cd * this.cdMult(me.team);
      const cd = this.myAb.cd, ready = cd <= 0 && me.alive;
      const key = R.ab + '|' + Math.ceil(cd) + '|' + ready;
      if (c.ab !== key) {
        c.ab = key;
        $('t-abil-name').textContent = R.ab;
        $('t-abil-cd').textContent = ready ? '' : Math.ceil(cd);
        $('t-abil').classList.toggle('ready', ready);
        $('t-abil').style.setProperty('--rc', R.color);
        $('t-abil-ic').src = this.icon(me.role);
      }
      $('t-abil').style.setProperty('--p', ready ? 1 : U.clamp(1 - cd / cdMax, 0, 1).toFixed(3));
      const rkey = this.units.map((u) => u.id + (u.alive ? Math.round(u.hp / u.max * 10) : 'x')).join();
      if (c.r !== rkey) {
        c.r = rkey;
        const row = (t) => this.units.filter((u) => u.team === t).sort((x, y) => x.slot - y.slot).map((u) =>
          '<span class="tu' + (u.alive ? '' : ' dead') + (u.me ? ' me' : '') + '" title="' + esc(u.me ? 'Vos' : u.name) + '"><img alt="" src="' + this.icon(u.role) + '"><i style="width:' + Math.max(0, Math.round(u.hp / u.max * 100)) + '%"></i></span>').join('');
        $('t-ally').innerHTML = row(this.myTeam);
        $('t-enemy').innerHTML = row(1 - this.myTeam);
      }
    }
  }

  BB.TeamManager = TeamManager;
})(window.BB);
