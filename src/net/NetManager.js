/* net/NetManager.js — capa de red en tiempo real sobre la "room" de claude.ai
 * Todo el protocolo viaja en PRESENCE (cualquier jugador puede publicarla, incluso con acceso
 * de solo lectura o invitado). Estado absoluto, tolerante a pérdidas: contadores monótonos en vez de eventos.
 * Si la room no está disponible (archivo local, sin sesión), el juego sigue: solo se desactiva el online.
 */
(function (BB) {
  'use strict';
  const APP = 'bb3d';

  class NetManager {
    constructor(game) {
      this.game = game;
      this.room = null;
      this.user = null;
      this.available = false;
      this.connected = false;
      this.myPeer = null;
      this.myId = null;
      this.myName = '';
      this.peers = [];
      this.names = {};
      this.pending = {};
      this.lastSend = 0;
      this.listeners = [];
      this.status = 'connecting';
    }

    async init() {
      const C = window.claude;
      if (!C || typeof C.use !== 'function') { this.status = 'offline'; this.emitChange(); return; }
      try {
        const [room, user] = await Promise.all([C.use('room'), C.use('user')]);
        this.user = user || null;
        if (!room) { this.status = 'offline'; this.emitChange(); return; }
        this.room = room;
        this.available = true;
        this.status = 'online';
        if (user) {
          try { this.myId = await user.id(); } catch (e) { this.myId = null; }
          try { this.myName = (await user.name()) || ''; } catch (e) { this.myName = ''; }
        }
        room.onConnection((c) => { this.connected = c; this.emitChange(); }, (err) => this.onTerminal(err));
        room.onPeers((ch) => this.onPeers(ch), (err) => this.onTerminal(err));
        this.publish({ app: APP, v: 1, st: 'idle' }, true);
      } catch (e) {
        BB.reportError('net-init', e);
        this.status = 'offline';
        this.emitChange();
      }
    }

    onTerminal(err) {
      this.available = false; this.connected = false; this.status = 'offline';
      BB.reportError('net', new Error(err && err.code));
      this.emitChange();
    }

    onPeers(ch) {
      const all = ch.peers || [];
      const me = all.find((p) => p.sameTab);
      if (me) this.myPeer = me.peer;
      this.peers = all.filter((p) => !p.sameTab && p.kind === 'viewer' && p.presence && p.presence.app === APP);
      const ids = this.peers.map((p) => p.by).filter((id) => id && !(id in this.names));
      if (ids.length && this.user) this.resolveNames(ids);
      this.emitChange();
    }

    async resolveNames(ids) {
      try {
        const ps = await this.user.profiles(ids);
        for (const id of ids) this.names[id] = (ps[id] && ps[id].name) || '';
        this.emitChange();
      } catch (e) { /* los nombres son opcionales */ }
    }

    // Nombre visible de un peer (perfil de la plataforma > apodo en presence)
    nameOf(p) {
      if (!p) return 'Rival';
      const n = (p.by && this.names[p.by]) || '';
      const nick = typeof p.presence.nick === 'string' ? p.presence.nick.slice(0, 18) : '';
      return n || nick || 'Piloto ' + String(p.peer).slice(0, 4).toUpperCase();
    }

    peer(peerLabel) { return this.peers.find((p) => p.peer === peerLabel) || null; }

    // Publicación coalescida (absoluta, nunca deltas)
    publish(patch, now) {
      if (!this.room) return;
      Object.assign(this.pending, patch);
      const t = performance.now();
      if (!now && t - this.lastSend < 70) return;
      this.flush();
    }
    flush() {
      if (!this.room || !Object.keys(this.pending).length) return;
      const p = this.pending;
      this.pending = {};
      this.lastSend = performance.now();
      this.room.presence(p).catch((e) => BB.reportError('presence', e));
    }

    onChange(fn) { this.listeners.push(fn); }
    emitChange() { for (const fn of this.listeners) { try { fn(); } catch (e) { BB.reportError('net-listener', e); } } }
  }
  BB.NetManager = NetManager;
})(window.BB);
