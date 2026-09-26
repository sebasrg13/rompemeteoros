// Simulación local de la capability "room"/"user" de claude.ai (solo para pruebas).
// Varias pestañas del mismo origen comparten presencia vía BroadcastChannel.
(() => {
  const mem = {};
  Object.defineProperty(window, 'localStorage', { configurable: true, value: { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; } } });
  const ch = new BroadcastChannel('bb-mock-room');
  const peer = Math.random().toString(36).slice(2, 10);
  const uid = 'u_' + peer;
  const nick = 'Tester-' + peer.slice(0, 3).toUpperCase();
  let presence = {};
  const others = new Map(); // peer -> {presence, t, by}
  const peerCbs = [], connCbs = [];
  let snapshot = [];
  const build = () => {
    const me = { peer, by: uid, isMe: true, sameTab: true, kind: 'viewer', guest: false, presence: Object.freeze({ ...presence }), updatedAt: Date.now() };
    snapshot = Object.freeze([me].concat([...others.entries()].map(([p, o]) => ({ peer: p, by: o.by, isMe: false, sameTab: false, kind: 'viewer', guest: false, presence: Object.freeze({ ...o.presence }), updatedAt: o.t }))));
    return snapshot;
  };
  const notify = (joined, left) => { const ps = build(); peerCbs.forEach((f) => f({ peers: ps, joined: joined || [], left: left || [], updated: [] })); };
  const send = () => ch.postMessage({ peer, by: uid, presence });
  ch.onmessage = (e) => {
    const m = e.data;
    if (m.bye) { if (others.delete(m.peer)) notify(); return; }
    const had = others.has(m.peer);
    others.set(m.peer, { presence: m.presence, t: Date.now(), by: m.by });
    if (!had) send();
    notify();
  };
  setInterval(() => {
    send();
    const now = Date.now(); let changed = false;
    for (const [p, o] of others) if (now - o.t > 3000) { others.delete(p); changed = true; }
    if (changed) notify();
  }, 1000);
  window.addEventListener('pagehide', () => ch.postMessage({ peer, bye: true }));
  const room = {
    presence: async (patch) => { for (const k in patch) { if (patch[k] === null) delete presence[k]; else presence[k] = patch[k]; } send(); notify(); },
    onPeers: (f) => { peerCbs.push(f); setTimeout(() => f({ peers: build(), joined: build(), left: [], updated: [] }), 0); return () => {}; },
    peers: () => snapshot,
    onConnection: (f) => { connCbs.push(f); setTimeout(() => f(true), 0); return () => {}; },
    connected: () => true,
    emit: async () => {}, on: () => () => {},
  };
  const user = { id: async () => uid, name: async () => nick, profiles: async (ids) => Object.fromEntries([].concat(ids).map((i) => [i, { id: i, name: 'Tester-' + i.slice(2, 5).toUpperCase() }])) };
  // db simulada: documentos compartidos entre pestañas por BroadcastChannel
  const docs = new Map(), subs = [];
  const dch = new BroadcastChannel('bb-mock-db');
  const fire = () => subs.forEach((q) => q.emit());
  dch.onmessage = (e) => { if (e.data.req) { for (const [k, v] of docs) dch.postMessage({ path: k, data: v }); return; } docs.set(e.data.path, e.data.data); fire(); };
  dch.postMessage({ req: true });
  const OPS = { '>': (a, b) => a > b, '>=': (a, b) => a >= b, '<': (a, b) => a < b, '<=': (a, b) => a <= b, '==': (a, b) => a === b };
  const mkQuery = (path, ord, lim, wh) => {
    const run = () => {
      let rows = [...docs.entries()].filter(([k, v]) => v && k.startsWith(path + '/') && k.slice(path.length + 1).indexOf('/') < 0 && (!wh || OPS[wh[1]](v[wh[0]], wh[2])))
        .map(([k, v]) => ({ id: k.slice(path.length + 1), exists: true, data: () => ({ ...v }), metadata: {} }));
      if (ord) rows.sort((a, b) => (ord[1] === 'desc' ? -1 : 1) * ((a.data()[ord[0]] || 0) - (b.data()[ord[0]] || 0)));
      if (lim) rows = rows.slice(0, lim);
      return { docs: rows, size: rows.length, empty: !rows.length, docChanges: () => [], metadata: {} };
    };
    return {
      path, orderBy: (f, d) => mkQuery(path, [f, d || 'asc'], lim, wh), limit: (n) => mkQuery(path, ord, n, wh), where: (f, op, v) => mkQuery(path, ord, lim, [f, op, v]),
      get: async () => run(),
      onSnapshot: (next) => { const q = { emit: () => next(run()) }; subs.push(q); setTimeout(q.emit, 0); return () => { const i = subs.indexOf(q); if (i >= 0) subs.splice(i, 1); }; },
      doc: (id) => ({ id, path: path + '/' + id, set: async (d) => { docs.set(path + '/' + id, { ...d }); dch.postMessage({ path: path + '/' + id, data: { ...d } }); fire(); }, delete: async () => { docs.set(path + '/' + id, null); dch.postMessage({ path: path + '/' + id, data: null }); fire(); }, get: async () => ({ id, exists: docs.has(path + '/' + id), data: () => docs.get(path + '/' + id) }) }),
    };
  };
  const db = { collection: (p) => mkQuery(p), doc: (p) => { const i = p.lastIndexOf('/'); return mkQuery(p.slice(0, i)).doc(p.slice(i + 1)); } };
  window.__mockDocs = docs;
  window.claude = { use: async (n) => (n === 'room' ? room : n === 'user' ? user : n === 'db' ? db : null) };
  window.__mockPeer = peer;
})();
