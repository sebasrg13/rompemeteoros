/* managers/RankManager.js — RANKING de campaña: top 100 global, continente, país y ciudad
 * La ubicación la confirma el jugador (el país se sugiere por la zona horaria del dispositivo).
 * Se puede cambiar una vez cada 30 días. Datos en la db del artifact:
 *   rk/g/s/<uid>, rk/c-<CONT>/s/<uid>, rk/p-<PAIS>/s/<uid>, rk/y-<PAIS>-<ciudad>/s/<uid>
 */
(function (BB) {
  'use strict';
  const U = BB.U;
  const $ = (id) => document.getElementById(id);

  const CONTS = { SA: 'SUDAMÉRICA', NA: 'NORTE Y CENTROAMÉRICA', EU: 'EUROPA', AS: 'ASIA', AF: 'ÁFRICA', OC: 'OCEANÍA' };
  // código, nombre, continente, zonas horarias, ciudades principales
  const COUNTRIES = [
    ['AR', 'Argentina', 'SA', ['America/Argentina/', 'America/Buenos_Aires', 'America/Cordoba', 'America/Mendoza', 'America/Jujuy', 'America/Catamarca'],
      ['Buenos Aires (CABA)', 'Gran Buenos Aires', 'La Plata', 'Mar del Plata', 'Bahía Blanca', 'Córdoba', 'Río Cuarto', 'Rosario', 'Santa Fe', 'Paraná', 'Mendoza', 'San Juan', 'San Luis', 'Tucumán', 'Salta', 'Jujuy', 'Santiago del Estero', 'Catamarca', 'La Rioja', 'Corrientes', 'Resistencia', 'Posadas', 'Formosa', 'Neuquén', 'Bariloche', 'Viedma', 'Santa Rosa', 'Rawson', 'Comodoro Rivadavia', 'Río Gallegos', 'Ushuaia']],
    ['UY', 'Uruguay', 'SA', ['America/Montevideo'], ['Montevideo', 'Canelones', 'Maldonado', 'Punta del Este', 'Salto', 'Paysandú', 'Rivera', 'Colonia']],
    ['CL', 'Chile', 'SA', ['America/Santiago', 'America/Punta_Arenas', 'Pacific/Easter'], ['Santiago', 'Valparaíso', 'Viña del Mar', 'Concepción', 'Antofagasta', 'La Serena', 'Temuco', 'Puerto Montt']],
    ['PY', 'Paraguay', 'SA', ['America/Asuncion'], ['Asunción', 'Ciudad del Este', 'Encarnación', 'Luque']],
    ['BO', 'Bolivia', 'SA', ['America/La_Paz'], ['La Paz', 'El Alto', 'Santa Cruz', 'Cochabamba', 'Sucre']],
    ['PE', 'Perú', 'SA', ['America/Lima'], ['Lima', 'Arequipa', 'Trujillo', 'Cusco', 'Chiclayo', 'Piura']],
    ['EC', 'Ecuador', 'SA', ['America/Guayaquil', 'Pacific/Galapagos'], ['Quito', 'Guayaquil', 'Cuenca', 'Manta']],
    ['CO', 'Colombia', 'SA', ['America/Bogota'], ['Bogotá', 'Medellín', 'Cali', 'Barranquilla', 'Cartagena', 'Bucaramanga']],
    ['VE', 'Venezuela', 'SA', ['America/Caracas'], ['Caracas', 'Maracaibo', 'Valencia', 'Barquisimeto']],
    ['BR', 'Brasil', 'SA', ['America/Sao_Paulo', 'America/Fortaleza', 'America/Recife', 'America/Bahia', 'America/Manaus', 'America/Belem', 'America/Cuiaba', 'America/Porto_Velho', 'America/Maceio', 'America/Araguaina', 'America/Campo_Grande', 'America/Noronha', 'America/Rio_Branco', 'America/Boa_Vista', 'America/Santarem'], ['São Paulo', 'Rio de Janeiro', 'Belo Horizonte', 'Porto Alegre', 'Curitiba', 'Brasília', 'Salvador', 'Recife', 'Fortaleza']],
    ['MX', 'México', 'NA', ['America/Mexico_City', 'America/Monterrey', 'America/Cancun', 'America/Tijuana', 'America/Merida', 'America/Chihuahua', 'America/Hermosillo', 'America/Mazatlan', 'America/Matamoros', 'America/Bahia_Banderas'], ['Ciudad de México', 'Guadalajara', 'Monterrey', 'Puebla', 'Tijuana', 'León', 'Querétaro', 'Mérida', 'Cancún']],
    ['GT', 'Guatemala', 'NA', ['America/Guatemala'], ['Ciudad de Guatemala', 'Quetzaltenango']],
    ['SV', 'El Salvador', 'NA', ['America/El_Salvador'], ['San Salvador', 'Santa Ana']],
    ['HN', 'Honduras', 'NA', ['America/Tegucigalpa'], ['Tegucigalpa', 'San Pedro Sula']],
    ['NI', 'Nicaragua', 'NA', ['America/Managua'], ['Managua', 'León']],
    ['CR', 'Costa Rica', 'NA', ['America/Costa_Rica'], ['San José', 'Alajuela', 'Heredia']],
    ['PA', 'Panamá', 'NA', ['America/Panama'], ['Ciudad de Panamá', 'Colón']],
    ['CU', 'Cuba', 'NA', ['America/Havana'], ['La Habana', 'Santiago de Cuba']],
    ['DO', 'República Dominicana', 'NA', ['America/Santo_Domingo'], ['Santo Domingo', 'Santiago de los Caballeros']],
    ['PR', 'Puerto Rico', 'NA', ['America/Puerto_Rico'], ['San Juan', 'Bayamón', 'Ponce']],
    ['US', 'Estados Unidos', 'NA', ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'America/Phoenix', 'America/Anchorage', 'America/Detroit', 'America/Indiana/', 'America/Kentucky/', 'America/Boise', 'Pacific/Honolulu'], ['Miami', 'New York', 'Los Angeles', 'Houston', 'Chicago', 'Dallas', 'Orlando', 'San Francisco']],
    ['CA', 'Canadá', 'NA', ['America/Toronto', 'America/Vancouver', 'America/Edmonton', 'America/Winnipeg', 'America/Halifax', 'America/Montreal', 'America/Regina', 'America/St_Johns'], ['Toronto', 'Montreal', 'Vancouver', 'Calgary', 'Ottawa']],
    ['ES', 'España', 'EU', ['Europe/Madrid', 'Atlantic/Canary', 'Africa/Ceuta'], ['Madrid', 'Barcelona', 'Valencia', 'Sevilla', 'Zaragoza', 'Málaga', 'Bilbao', 'Palma']],
    ['PT', 'Portugal', 'EU', ['Europe/Lisbon', 'Atlantic/Madeira', 'Atlantic/Azores'], ['Lisboa', 'Oporto']],
    ['IT', 'Italia', 'EU', ['Europe/Rome'], ['Roma', 'Milán', 'Nápoles', 'Turín']],
    ['FR', 'Francia', 'EU', ['Europe/Paris'], ['París', 'Lyon', 'Marsella']],
    ['DE', 'Alemania', 'EU', ['Europe/Berlin'], ['Berlín', 'Múnich', 'Hamburgo']],
    ['GB', 'Reino Unido', 'EU', ['Europe/London'], ['Londres', 'Mánchester']],
  ];
  const OTHER = ['OT', 'Otro país', null, [], []];

  function slug(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'x'; }
  function flag(cc) { return /^[A-Z]{2}$/.test(cc) && cc !== 'OT' ? String.fromCodePoint(...[...cc].map((c) => 0x1F1E6 + c.charCodeAt(0) - 65)) : '🌐'; }

  class RankManager {
    constructor(game) {
      this.game = game;
      this.db = null; this.user = null; this.uid = null; this.online = 'connecting';
      this.scope = 'g'; this.rows = []; this.myPos = 0; this.names = {};
      this.unsub = null;
    }
    get prof() {
      const d = this.game.save.data;
      if (!d.profile || typeof d.profile !== 'object') d.profile = {};
      return d.profile;
    }
    hasLoc() { const p = this.prof; return !!(p.country && p.city); }
    country(cc) { return COUNTRIES.find((c) => c[0] === cc) || OTHER; }
    contOf(cc) { const c = this.country(cc); return c[2] || this.prof.cont || this.tzCont(); }
    tz() { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) { return ''; } }
    tzCont() {
      const z = this.tz();
      if (/^Europe\//.test(z)) return 'EU';
      if (/^Asia\//.test(z)) return 'AS';
      if (/^Africa\//.test(z)) return 'AF';
      if (/^(Australia|Pacific)\//.test(z)) return 'OC';
      return 'SA';
    }
    suggest() {
      const z = this.tz();
      for (const c of COUNTRIES) if (c[3].some((p) => z === p || (p.endsWith('/') && z.startsWith(p)))) return c[0];
      return 'OT';
    }
    canChange() { const t = this.prof.changedAt || 0; return !t || Date.now() - t > 30 * 86400000; }
    daysToChange() { return Math.ceil((30 * 86400000 - (Date.now() - (this.prof.changedAt || 0))) / 86400000); }
    scopes() {
      const p = this.prof, cc = p.country || 'OT', ct = this.contOf(cc);
      return {
        g: { path: 'rk/g/s', label: 'GLOBAL', sub: 'MUNDIAL' },
        c: { path: 'rk/c-' + ct + '/s', label: 'CONTINENTE', sub: CONTS[ct] || ct },
        p: { path: 'rk/p-' + cc + '/s', label: 'PAÍS', sub: flag(cc) + ' ' + (this.country(cc)[1] || cc).toUpperCase() },
        y: { path: 'rk/y-' + cc + '-' + slug(p.city) + '/s', label: 'CIUDAD', sub: (p.city || '—').toUpperCase() },
      };
    }

    // ---------- conexión ----------
    async init() {
      const C = window.claude;
      if (!C || typeof C.use !== 'function') { this.online = 'offline'; return; }
      try {
        const [db, user] = await Promise.all([C.use('db'), C.use('user')]);
        this.user = user || null;
        if (user) { try { this.uid = await user.id(); } catch (e) { this.uid = null; } }
        this.db = db || null;
        this.online = db ? 'online' : 'offline';
        if (db && this.pendingSubmit) { const s = this.pendingSubmit; this.pendingSubmit = null; this.write(s); }
      } catch (e) { BB.reportError('rank-init', e); this.online = 'offline'; }
    }
    // al terminar un recorrido (aterrizar o perder): se sube si es tu mejor puntaje
    submitRun(score, level, cycle) {
      const st = this.game.save.data.stats;
      if (!(score > (st.bestRun || 0))) return false;
      st.bestRun = score; st.bestRunLevel = level; st.bestRunCycle = cycle;
      this.game.save.save(true);
      const doc = { score, level, cycle, t: Date.now() };
      if (!this.db) { this.pendingSubmit = doc; return true; }
      this.write(doc);
      return true;
    }
    async write(doc) {
      if (!this.db || !this.uid) return;
      const p = this.prof, data = Object.assign({ country: p.country || 'OT', city: p.city || '', v: 1 }, doc);
      const sc = this.scopes();
      const paths = [sc.g.path].concat(this.hasLoc() ? [sc.c.path, sc.p.path, sc.y.path] : []);
      for (const path of paths) { try { await this.db.collection(path).doc(this.uid).set(data); } catch (e) { BB.reportError('rank-write', e); } }
    }
    async moveTo(country, city) {
      // al cambiar de ubicación se borran tus entradas anteriores y se publica tu récord en las nuevas
      const old = this.hasLoc() ? this.scopes() : null;
      const p = this.prof;
      p.country = country; p.city = city; p.cont = this.contOf(country);
      p.changedAt = Date.now();
      this.game.save.save(true);
      if (this.db && this.uid && old) for (const k of ['c', 'p', 'y']) { try { await this.db.collection(old[k].path).doc(this.uid).delete(); } catch (e) { /* ya no estaba */ } }
      const st = this.game.save.data.stats;
      if (st.bestRun > 0) this.write({ score: st.bestRun, level: st.bestRunLevel || 1, cycle: st.bestRunCycle || 0, t: Date.now() });
    }

    // ---------- UI ----------
    initUI() {
      const g = this.game;
      const on = (id, fn) => { const el = $(id); if (el) el.addEventListener('click', (e) => { e.preventDefault(); g.audio.unlock(); g.audio.sfx('click'); fn(e); }); };
      on('btn-rank', () => this.open());
      on('rank-back', () => g.ui.showMenu());
      on('rank-loc', () => this.openLoc());
      on('loc-save', () => this.saveLoc());
      on('loc-cancel', () => { $('loc-modal').hidden = true; });
      $('rank-tabs').addEventListener('click', (e) => { const b = e.target.closest('button[data-sc]'); if (!b) return; g.audio.sfx('click'); this.scope = b.dataset.sc; this.subscribe(); this.render(); });
      $('loc-country').addEventListener('change', () => this.fillCities());
      $('loc-city').addEventListener('change', () => { $('loc-other').hidden = $('loc-city').value !== '__other'; });
    }
    open() {
      this.game.ui.show('s-rank');
      if (!this.hasLoc()) this.openLoc();
      this.subscribe();
      this.render();
    }
    openLoc() {
      const p = this.prof;
      if (this.hasLoc() && !this.canChange()) { this.game.ui.cupNote && this.note('Podés cambiar tu ubicación en ' + this.daysToChange() + ' días.'); return; }
      const sel = $('loc-country'), cur = p.country || this.suggest();
      sel.innerHTML = COUNTRIES.concat([OTHER]).map((c) => '<option value="' + c[0] + '"' + (c[0] === cur ? ' selected' : '') + '>' + c[1] + '</option>').join('');
      this.fillCities(p.city);
      $('loc-hint').textContent = p.country ? 'Solo se puede cambiar una vez cada 30 días.' : 'Sugerimos ' + this.country(cur)[1] + ' según la zona horaria de tu dispositivo. Confirmá tu país y tu ciudad.';
      $('loc-modal').hidden = false;
    }
    fillCities(cur) {
      const cc = $('loc-country').value, list = this.country(cc)[4];
      const sel = $('loc-city');
      sel.innerHTML = list.map((c) => '<option' + (c === cur ? ' selected' : '') + '>' + c + '</option>').join('') + '<option value="__other"' + (cur && list.indexOf(cur) < 0 ? ' selected' : '') + '>Otra ciudad…</option>';
      const other = sel.value === '__other';
      $('loc-other').hidden = !other;
      $('loc-other').value = other && cur ? cur : '';
    }
    saveLoc() {
      const cc = $('loc-country').value;
      let city = $('loc-city').value;
      if (city === '__other') city = $('loc-other').value.trim().replace(/\s+/g, ' ').slice(0, 32).replace(/(^|\s)\S/g, (m) => m.toUpperCase());
      if (!city) { this.note('Escribí tu ciudad.'); return; }
      $('loc-modal').hidden = true;
      this.moveTo(cc, city).then(() => { this.subscribe(true); this.render(); });
      this.render();
    }
    note(t) { const el = $('rank-note'); el.textContent = t; el.hidden = false; clearTimeout(this._n); this._n = setTimeout(() => { el.hidden = true; }, 3000); }
    subscribe(force) {
      if (!this.db) return;
      const sc = this.scopes()[this.scope];
      if (!force && this.subPath === sc.path && this.unsub) return;
      if (this.unsub) { try { this.unsub(); } catch (e) { /* */ } }
      this.subPath = sc.path; this.rows = []; this.myPos = 0;
      this.unsub = this.db.collection(sc.path).orderBy('score', 'desc').limit(100).onSnapshot((snap) => {
        this.rows = snap.docs.map((d) => Object.assign({ id: d.id }, d.data() || {})).filter((r) => typeof r.score === 'number');
        this.resolveNames(this.rows.map((r) => r.id));
        this.computeMyPos(sc.path);
        this.render();
      }, () => { this.online = 'offline'; this.render(); });
    }
    async computeMyPos(path) {
      const best = this.game.save.data.stats.bestRun || 0;
      const i = this.rows.findIndex((r) => r.id === this.uid);
      if (i >= 0) { this.myPos = i + 1; return; }
      if (!best || !this.db) { this.myPos = 0; return; }
      try { const s = await this.db.collection(path).where('score', '>', best).get(); this.myPos = s.size + 1; this.render(); } catch (e) { this.myPos = 0; }
    }
    async resolveNames(ids) {
      if (!this.user || !this.user.profiles || !ids.length) return;
      try { const ps = await this.user.profiles(ids); for (const id of ids) if (ps[id]) this.names[id] = ps[id].name || ''; this.render(); } catch (e) { /* */ }
    }
    nameOf(id) { return (id === this.uid ? 'VOS' : this.names[id]) || 'Piloto ' + String(id).slice(-4).toUpperCase(); }
    esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
    render() {
      if (!$('s-rank') || $('s-rank').hidden) return;
      const p = this.prof, sc = this.scopes(), st = this.game.save.data.stats;
      $('rank-where').innerHTML = this.hasLoc() ? flag(p.country) + ' <b>' + this.esc(p.city) + '</b> · ' + this.esc(this.country(p.country)[1]) : 'Sin ubicación';
      for (const b of $('rank-tabs').children) { b.classList.toggle('on', b.dataset.sc === this.scope); b.querySelector('small').textContent = sc[b.dataset.sc].sub; }
      $('rank-me').innerHTML = '<div><small>TU MEJOR RECORRIDO</small><b>' + U.fmt(st.bestRun || 0) + '</b></div><div><small>NIVEL · CICLO</small><b>' + (st.bestRun ? (st.bestRunLevel || 1) + ' · ' + (st.bestRunCycle || 0) : '—') + '</b></div><div><small>PUESTO</small><b>' + (this.myPos ? '#' + U.fmt(this.myPos) : '—') + '</b></div>';
      let h = '';
      if (this.online !== 'online') h = '<p class="empty">Ranking online no disponible en esta vista. Tu mejor recorrido se guarda en este dispositivo.</p>';
      else if (!this.hasLoc() && this.scope !== 'g') h = '<p class="empty">Elegí tu ubicación para ver este ranking.</p>';
      else if (!this.rows.length) h = '<p class="empty">Todavía no hay puntajes acá. Terminá un recorrido (aterrizando o perdiendo) para entrar.</p>';
      else h = '<div class="rank">' + this.rows.map((r, i) => '<div class="rr rr5' + (r.id === this.uid ? ' me' : '') + (i < 3 ? ' top' : '') + '"><i>' + (i + 1) + '</i><span>' + this.esc(this.nameOf(r.id)) + '<small>' + flag(r.country) + ' ' + this.esc(r.city || '') + '</small></span><em>NV ' + (r.level || 1) + ' · C' + (r.cycle || 0) + '</em><b>' + U.fmt(r.score) + '</b></div>').join('') + '</div>';
      $('rank-list').innerHTML = h;
    }
  }
  RankManager.COUNTRIES = COUNTRIES;
  BB.RankManager = RankManager;
})(window.BB);
