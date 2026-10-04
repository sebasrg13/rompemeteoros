/* engine/Textures.js — texturas generadas por código (atlas de efectos, nebulosa, arena, iconos) */
(function (BB) {
  'use strict';
  const T = {};
  const CELL = 128;

  function mk(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }

  // ---------- Iconos de boosts (compartidos entre 3D y HUD) ----------
  const BOOST_COLORS = {
    multi: '#3BE8FF', rapid: '#FFD23B', big: '#FF8A3B', damage: '#FF3B6B',
    shield: '#5CA8FF', magnet: '#C45CFF', coin: '#FFC83D', squad: '#5CFF9D',
    heal: '#3DDC84', tank: '#5C8DFF', adc: '#FF8A3B', jungle: '#E0B341', mid: '#B46BFF',
  };
  T.BOOST_COLORS = BOOST_COLORS;

  function drawSymbol(ctx, type, s) {
    // s = radio del símbolo; origen en el centro
    ctx.save();
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#fff';
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.lineWidth = s * 0.16;
    switch (type) {
      case 'multi': {
        const ends = [[-0.75, -0.7], [0, -0.85], [0.75, -0.7]];
        for (const e of ends) {
          ctx.beginPath(); ctx.moveTo(0, s * 0.75); ctx.lineTo(e[0] * s, e[1] * s); ctx.stroke();
          ctx.beginPath(); ctx.arc(e[0] * s, e[1] * s, s * 0.17, 0, Math.PI * 2); ctx.fill();
        }
        break;
      }
      case 'rapid': {
        ctx.beginPath();
        ctx.moveTo(s * 0.15, -s * 0.95); ctx.lineTo(-s * 0.55, s * 0.12); ctx.lineTo(-s * 0.02, s * 0.12);
        ctx.lineTo(-s * 0.2, s * 0.95); ctx.lineTo(s * 0.58, -s * 0.2); ctx.lineTo(s * 0.05, -s * 0.2); ctx.closePath(); ctx.fill();
        break;
      }
      case 'big': {
        ctx.beginPath(); ctx.arc(0, s * 0.1, s * 0.62, 0, Math.PI * 2); ctx.fill();
        ctx.globalCompositeOperation = 'destination-out';
        ctx.beginPath(); ctx.arc(-s * 0.2, -s * 0.12, s * 0.18, 0, Math.PI * 2); ctx.fill();
        break;
      }
      case 'damage': {
        ctx.beginPath();
        for (let i = 0; i < 16; i++) {
          const a = (i / 16) * Math.PI * 2 - Math.PI / 2, r = i % 2 ? s * 0.42 : s * 0.95;
          ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        }
        ctx.closePath(); ctx.fill();
        break;
      }
      case 'shield': {
        ctx.beginPath();
        ctx.moveTo(0, -s * 0.9); ctx.lineTo(s * 0.75, -s * 0.6); ctx.lineTo(s * 0.68, s * 0.15);
        ctx.quadraticCurveTo(s * 0.45, s * 0.7, 0, s * 0.95); ctx.quadraticCurveTo(-s * 0.45, s * 0.7, -s * 0.68, s * 0.15);
        ctx.lineTo(-s * 0.75, -s * 0.6); ctx.closePath(); ctx.fill();
        break;
      }
      case 'magnet': {
        ctx.lineWidth = s * 0.34; ctx.lineCap = 'butt';
        ctx.beginPath(); ctx.arc(0, -s * 0.05, s * 0.5, Math.PI, 0, true); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-s * 0.5, -s * 0.05); ctx.lineTo(-s * 0.5, -s * 0.75); ctx.moveTo(s * 0.5, -s * 0.05); ctx.lineTo(s * 0.5, -s * 0.75); ctx.stroke();
        ctx.globalCompositeOperation = 'destination-out';
        ctx.fillRect(-s * 0.7, -s * 0.8, s * 1.4, s * 0.16);
        break;
      }
      case 'coin': {
        ctx.font = '900 ' + Math.round(s * 1.25) + 'px "Russo One", Arial Black, sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('x2', 0, s * 0.08);
        break;
      }
      case 'heal': {
        ctx.fillRect(-s * 0.22, -s * 0.78, s * 0.44, s * 1.56);
        ctx.fillRect(-s * 0.78, -s * 0.22, s * 1.56, s * 0.44);
        break;
      }
      case 'tank': {
        ctx.beginPath();
        ctx.moveTo(0, -s * 0.9); ctx.lineTo(s * 0.8, -s * 0.55); ctx.lineTo(s * 0.7, s * 0.2);
        ctx.quadraticCurveTo(s * 0.4, s * 0.75, 0, s * 0.95); ctx.quadraticCurveTo(-s * 0.4, s * 0.75, -s * 0.7, s * 0.2);
        ctx.lineTo(-s * 0.8, -s * 0.55); ctx.closePath(); ctx.fill();
        ctx.globalCompositeOperation = 'destination-out';
        ctx.fillRect(-s * 0.08, -s * 0.6, s * 0.16, s * 1.2);
        break;
      }
      case 'adc': {
        ctx.lineWidth = s * 0.16;
        ctx.beginPath(); ctx.arc(0, 0, s * 0.62, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.arc(0, 0, s * 0.18, 0, Math.PI * 2); ctx.fill();
        for (let k = 0; k < 4; k++) { ctx.save(); ctx.rotate(k * Math.PI / 2); ctx.fillRect(-s * 0.07, -s * 1.0, s * 0.14, s * 0.42); ctx.restore(); }
        break;
      }
      case 'jungle': {
        ctx.lineWidth = s * 0.2;
        for (let k = -1; k <= 1; k++) { ctx.beginPath(); ctx.moveTo(k * s * 0.42 - s * 0.25, -s * 0.8); ctx.quadraticCurveTo(k * s * 0.42 + s * 0.2, 0, k * s * 0.42 - s * 0.05, s * 0.85); ctx.stroke(); }
        break;
      }
      case 'mid': {
        ctx.beginPath();
        for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2 - Math.PI / 2, r = i % 2 ? s * 0.3 : s * 0.95; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
        ctx.closePath(); ctx.fill();
        break;
      }
      case 'squad': {
        const tri = (x, y, k) => { ctx.beginPath(); ctx.moveTo(x, y - s * 0.42 * k); ctx.lineTo(x + s * 0.3 * k, y + s * 0.3 * k); ctx.lineTo(x - s * 0.3 * k, y + s * 0.3 * k); ctx.closePath(); ctx.fill(); };
        tri(0, -s * 0.35, 1.1); tri(-s * 0.55, s * 0.35, 0.9); tri(s * 0.55, s * 0.35, 0.9);
        break;
      }
    }
    ctx.restore();
  }

  function drawBadge(ctx, type, cx, cy, r) {
    const col = BOOST_COLORS[type] || '#fff';
    ctx.save();
    ctx.translate(cx, cy);
    const g = ctx.createRadialGradient(0, -r * 0.3, r * 0.1, 0, 0, r);
    g.addColorStop(0, col); g.addColorStop(0.75, shade(col, -0.45)); g.addColorStop(1, shade(col, -0.7));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = r * 0.12; ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath(); ctx.arc(0, 0, r * 0.92, 0, Math.PI * 2); ctx.stroke();
    ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = r * 0.12;
    drawSymbol(ctx, type, r * 0.52);
    ctx.restore();
  }

  function shade(hex, k) {
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    if (k < 0) { r *= 1 + k; g *= 1 + k; b *= 1 + k; } else { r += (255 - r) * k; g += (255 - g) * k; b += (255 - b) * k; }
    return 'rgb(' + (r | 0) + ',' + (g | 0) + ',' + (b | 0) + ')';
  }

  T.iconURL = {};
  T.makeIcons = function () {
    for (const k of Object.keys(BOOST_COLORS)) {
      try {
        const c = mk(96, 96);
        drawBadge(c.getContext('2d'), k, 48, 48, 44);
        T.iconURL[k] = c.toDataURL('image/png');
      } catch (e) { T.iconURL[k] = ''; }
    }
  };

  // ---------- Atlas principal ----------
  T.GLYPHS = '0123456789K.+x-!';
  T.cellUV = function (i) {
    const cx = i % 8, cy = Math.floor(i / 8), e = 1.5 / 1024;
    return [cx / 8 + e, cy / 8 + e, (cx + 1) / 8 - e, (cy + 1) / 8 - e];
  };
  T.glyphUV = {};
  T.ICON_CELL = { multi: 16, rapid: 17, big: 18, damage: 19, shield: 20, magnet: 21, coin: 22, squad: 23, heal: 24, tank: 25, adc: 26, jungle: 27, mid: 28 };
  T.LANE_CELL = { TOP: 29, MID: 30, BOT: 31 };
  T.C = { glow: 0, core: 1, ring: 2, spark: 3, smoke: 4, shock: 5, blob: 6, streak: 7, flare: 8, hex: 9, chunk: 10, dot: 11, bolt: 12, warn: 13, soft2: 14, star: 15 };


  // ---------- Banderas (stickers de las skins de países) ----------
  // Cada bandera se dibuja en el atlas (filas libres 4 a 6) con borde blanco de sticker.
  T.flagUV = {}; T.flagURL = {};
  T.FLAGS = ['AR', 'UY', 'CL', 'PY', 'BO', 'PE', 'EC', 'CO', 'VE', 'BR', 'MX', 'GT', 'SV', 'HN', 'NI', 'CR', 'PA', 'CU', 'DO', 'PR', 'US', 'CA', 'ES', 'PT', 'IT', 'FR', 'DE', 'GB'];
  // dibuja la bandera del país en el rectángulo (0,0)-(w,h) del contexto
  T.drawFlag = function (x, cc, w, h) {
    const W = '#ffffff';
    const hb = (cols, wts) => { const tot = (wts || cols.map(() => 1)).reduce((a, b) => a + b, 0); let y = 0; cols.forEach((c, i) => { const hh = h * (wts ? wts[i] : 1) / tot; x.fillStyle = c; x.fillRect(0, y - 0.5, w, hh + 1); y += hh; }); };
    const vb = (cols, wts) => { const tot = (wts || cols.map(() => 1)).reduce((a, b) => a + b, 0); let px = 0; cols.forEach((c, i) => { const ww = w * (wts ? wts[i] : 1) / tot; x.fillStyle = c; x.fillRect(px - 0.5, 0, ww + 1, h); px += ww; }); };
    const star = (cx, cy, r, col, rot) => { x.fillStyle = col; x.beginPath(); for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2 - Math.PI / 2 + (rot || 0), rr = i % 2 ? r * 0.4 : r; x.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); } x.closePath(); x.fill(); };
    const disc = (cx, cy, r, col) => { x.fillStyle = col; x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.fill(); };
    const ring = (cx, cy, r, col, lw) => { x.strokeStyle = col; x.lineWidth = lw; x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.stroke(); };
    const sun = (cx, cy, r, col) => { x.strokeStyle = col; x.lineWidth = Math.max(1, r * 0.22); for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; x.beginPath(); x.moveTo(cx + Math.cos(a) * r * 0.9, cy + Math.sin(a) * r * 0.9); x.lineTo(cx + Math.cos(a) * r * 1.75, cy + Math.sin(a) * r * 1.75); x.stroke(); } disc(cx, cy, r, col); };
    const tri = (pts, col) => { x.fillStyle = col; x.beginPath(); pts.forEach((p, i) => (i ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1]))); x.closePath(); x.fill(); };
    const cx = w / 2, cy = h / 2;
    switch (cc) {
      case 'AR': hb(['#74ACDF', W, '#74ACDF']); sun(cx, cy, h * 0.085, '#F6B40E'); break;
      case 'UY': { x.fillStyle = W; x.fillRect(0, 0, w, h); x.fillStyle = '#0038A8'; for (let i = 0; i < 4; i++) x.fillRect(0, h * (2 * i + 1) / 9, w, h / 9 + 0.5); x.fillStyle = W; x.fillRect(0, 0, w * 0.36, h * 5 / 9); sun(w * 0.18, h * 2.5 / 9, h * 0.1, '#FCD116'); break; }
      case 'CL': hb([W, '#D52B1E']); x.fillStyle = '#0039A6'; x.fillRect(0, 0, w / 3, h / 2); star(w / 6, h / 4, h * 0.16, W); break;
      case 'PY': hb(['#D52B1E', W, '#0038A8']); ring(cx, cy, h * 0.11, '#007934', h * 0.035); star(cx, cy, h * 0.06, '#F9D000'); break;
      case 'BO': hb(['#D52B1E', '#F9E300', '#007934']); break;
      case 'PE': vb(['#D91023', W, '#D91023']); break;
      case 'EC': hb(['#FFDD00', '#034EA2', '#ED1C24'], [2, 1, 1]); x.fillStyle = '#7fb6e6'; x.beginPath(); x.ellipse(cx, cy, h * 0.11, h * 0.15, 0, 0, Math.PI * 2); x.fill(); ring(cx, cy, h * 0.13, '#8a5a1e', h * 0.03); break;
      case 'CO': hb(['#FCD116', '#003893', '#CE1126'], [2, 1, 1]); break;
      case 'VE': hb(['#FFCC00', '#00247D', '#CF142B']); for (let i = 0; i < 8; i++) { const a = Math.PI * (1.1 + 0.8 * i / 7); star(cx + Math.cos(a) * h * 0.32, h * 0.66 + Math.sin(a) * h * 0.22, h * 0.035, W); } break;
      case 'BR': x.fillStyle = '#009C3B'; x.fillRect(0, 0, w, h); tri([[w * 0.08, cy], [cx, h * 0.1], [w * 0.92, cy], [cx, h * 0.9]], '#FFDF00'); disc(cx, cy, h * 0.24, '#002776');
        x.strokeStyle = W; x.lineWidth = h * 0.045; x.beginPath(); x.arc(cx, cy + h * 0.42, h * 0.48, Math.PI * 1.34, Math.PI * 1.66); x.stroke(); break;
      case 'MX': vb(['#006847', W, '#CE1126']); disc(cx, cy, h * 0.11, '#8C5A2B'); x.strokeStyle = '#3f7d3a'; x.lineWidth = h * 0.04; x.beginPath(); x.arc(cx, cy, h * 0.15, Math.PI * 0.1, Math.PI * 0.9); x.stroke(); break;
      case 'GT': vb(['#4997D0', W, '#4997D0']); ring(cx, cy, h * 0.13, '#3f8f3a', h * 0.045); disc(cx, cy, h * 0.05, '#d8c27a'); break;
      case 'SV': hb(['#0F47AF', W, '#0F47AF']); ring(cx, cy, h * 0.1, '#3f8f3a', h * 0.03); tri([[cx, cy - h * 0.07], [cx - h * 0.07, cy + h * 0.05], [cx + h * 0.07, cy + h * 0.05]], '#E8B923'); break;
      case 'HN': hb(['#00BCE4', W, '#00BCE4']); [[-0.16, -0.07], [0.16, -0.07], [0, 0], [-0.16, 0.07], [0.16, 0.07]].forEach((p) => star(cx + p[0] * w, cy + p[1] * h, h * 0.045, '#00BCE4')); break;
      case 'NI': hb(['#0067C6', W, '#0067C6']); ring(cx, cy, h * 0.11, '#C9A227', h * 0.025); tri([[cx, cy - h * 0.07], [cx - h * 0.07, cy + h * 0.05], [cx + h * 0.07, cy + h * 0.05]], '#6ec1e4'); break;
      case 'CR': hb(['#002B7F', W, '#CE1126', W, '#002B7F'], [1, 1, 2, 1, 1]); break;
      case 'PA': x.fillStyle = W; x.fillRect(0, 0, w, h); x.fillStyle = '#DA121A'; x.fillRect(cx, 0, cx, cy); x.fillStyle = '#072357'; x.fillRect(0, cy, cx, cy); star(w * 0.25, h * 0.25, h * 0.14, '#072357'); star(w * 0.75, h * 0.75, h * 0.14, '#DA121A'); break;
      case 'CU': hb(['#002A8F', W, '#002A8F', W, '#002A8F']); tri([[0, 0], [w * 0.42, cy], [0, h]], '#CF142B'); star(w * 0.14, cy, h * 0.13, W); break;
      case 'DO': x.fillStyle = W; x.fillRect(0, 0, w, h); { const g = h * 0.09; x.fillStyle = '#002D62'; x.fillRect(0, 0, cx - g, cy - g); x.fillRect(cx + g, cy + g, cx - g, cy - g); x.fillStyle = '#CE1126'; x.fillRect(cx + g, 0, cx - g, cy - g); x.fillRect(0, cy + g, cx - g, cy - g); disc(cx, cy, h * 0.06, '#3f8f3a'); } break;
      case 'PR': hb(['#ED0000', W, '#ED0000', W, '#ED0000']); tri([[0, 0], [w * 0.42, cy], [0, h]], '#0050F0'); star(w * 0.14, cy, h * 0.13, W); break;
      case 'US': { for (let i = 0; i < 13; i++) { x.fillStyle = i % 2 ? W : '#B22234'; x.fillRect(0, h * i / 13 - 0.3, w, h / 13 + 0.6); } x.fillStyle = '#3C3B6E'; x.fillRect(0, 0, w * 0.4, h * 7 / 13);
        for (let r = 0; r < 5; r++) for (let c = 0; c < 6; c++) disc(w * 0.4 * (c + 0.5 + (r % 2 ? 0.5 : 0)) / 6.5, h * 7 / 13 * (r + 0.5) / 5, h * 0.016, W); break; }
      case 'CA': { vb(['#D80621', W, '#D80621'], [1, 2, 1]); const s = h * 0.3; x.fillStyle = '#D80621'; x.beginPath();
        [[0, -1], [0.17, -0.62], [0.42, -0.72], [0.34, -0.25], [0.62, -0.42], [0.72, -0.2], [1, -0.12], [0.62, 0.2], [0.7, 0.42], [0.1, 0.34], [0.08, 0.95], [-0.08, 0.95], [-0.1, 0.34], [-0.7, 0.42], [-0.62, 0.2], [-1, -0.12], [-0.72, -0.2], [-0.62, -0.42], [-0.34, -0.25], [-0.42, -0.72], [-0.17, -0.62]].forEach((p, i) => (i ? x.lineTo(cx + p[0] * s, cy + p[1] * s) : x.moveTo(cx + p[0] * s, cy + p[1] * s)));
        x.closePath(); x.fill(); break; }
      case 'ES': hb(['#AA151B', '#F1BF00', '#AA151B'], [1, 2, 1]); x.fillStyle = '#AA151B'; x.fillRect(w * 0.26, cy - h * 0.12, w * 0.09, h * 0.22); x.fillStyle = '#C8B100'; x.fillRect(w * 0.26, cy - h * 0.17, w * 0.09, h * 0.05); break;
      case 'PT': vb(['#006600', '#FF0000'], [2, 3]); disc(w * 0.4, cy, h * 0.2, '#FFE000'); disc(w * 0.4, cy, h * 0.12, '#FF0000'); x.fillStyle = W; x.fillRect(w * 0.4 - h * 0.06, cy - h * 0.07, h * 0.12, h * 0.13); break;
      case 'IT': vb(['#009246', W, '#CE2B37']); break;
      case 'FR': vb(['#0055A4', W, '#EF4135']); break;
      case 'DE': hb(['#000000', '#DD0000', '#FFCE00']); break;
      case 'GB': { x.fillStyle = '#012169'; x.fillRect(0, 0, w, h);
        const dg = (col, lw) => { x.strokeStyle = col; x.lineWidth = lw; x.beginPath(); x.moveTo(0, 0); x.lineTo(w, h); x.moveTo(w, 0); x.lineTo(0, h); x.stroke(); };
        dg(W, h * 0.2); dg('#C8102E', h * 0.07);
        x.fillStyle = W; x.fillRect(cx - h * 0.17, 0, h * 0.34, h); x.fillRect(0, cy - h * 0.17, w, h * 0.34);
        x.fillStyle = '#C8102E'; x.fillRect(cx - h * 0.1, 0, h * 0.2, h); x.fillRect(0, cy - h * 0.1, w, h * 0.2); break; }
      default: x.fillStyle = '#888'; x.fillRect(0, 0, w, h);
    }
  };
  // stickers en el atlas: casillas de 128x96 desde y=512 (8 por fila)
  T.drawFlagStickers = function (ctx) {
    const SW = 128, SH = 96, FW = 108, FH = 72, B = 4;
    const rr = (x, y, w, h, r) => { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); };
    T.FLAGS.forEach((cc, i) => {
      const sx = (i % 8) * SW, sy = 512 + Math.floor(i / 8) * SH;
      const fx = sx + (SW - FW) / 2, fy = sy + (SH - FH) / 2;
      ctx.save();
      ctx.fillStyle = '#ffffff'; rr(fx - B, fy - B, FW + 2 * B, FH + 2 * B, 7); ctx.fill();
      rr(fx, fy, FW, FH, 4); ctx.clip();
      ctx.translate(fx, fy);
      T.drawFlag(ctx, cc, FW, FH);
      ctx.restore();
      T.flagUV[cc] = [(fx - B) / 1024, (fy - B) / 1024, (fx + FW + B) / 1024, (fy + FH + B) / 1024];
      // miniatura para la tienda
      try {
        const m = mk(60, 40), mx = m.getContext('2d');
        T.drawFlag(mx, cc, 60, 40);
        T.flagURL[cc] = m.toDataURL('image/png');
      } catch (e) { /* sin miniatura: la tienda usa los colores */ }
    });
  };

  T.makeAtlas = function () {
    const c = mk(1024, 1024), ctx = c.getContext('2d');
    const cell = (i, fn) => {
      const x = (i % 8) * CELL, y = Math.floor(i / 8) * CELL;
      // recorte por celda: las operaciones 'destination-in' afectan a TODO el lienzo si no se recorta (borraban las celdas anteriores)
      ctx.save(); ctx.beginPath(); ctx.rect(x, y, CELL, CELL); ctx.clip();
      ctx.translate(x + CELL / 2, y + CELL / 2); fn(ctx); ctx.restore();
    };
    const radial = (stops, r) => {
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
      stops.forEach((s) => g.addColorStop(s[0], s[1]));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
    };
    // 0 glow suave
    cell(0, () => radial([[0, 'rgba(255,255,255,1)'], [0.25, 'rgba(255,255,255,0.55)'], [0.6, 'rgba(255,255,255,0.12)'], [1, 'rgba(255,255,255,0)']], 62));
    // 1 núcleo intenso
    cell(1, () => radial([[0, 'rgba(255,255,255,1)'], [0.35, 'rgba(255,255,255,0.95)'], [0.55, 'rgba(255,255,255,0.3)'], [1, 'rgba(255,255,255,0)']], 62));
    // 2 anillo fino
    cell(2, () => radial([[0, 'rgba(255,255,255,0)'], [0.78, 'rgba(255,255,255,0)'], [0.88, 'rgba(255,255,255,1)'], [0.96, 'rgba(255,255,255,0.2)'], [1, 'rgba(255,255,255,0)']], 62));
    // 3 destello de 4 puntas
    cell(3, (x) => {
      radial([[0, 'rgba(255,255,255,1)'], [0.2, 'rgba(255,255,255,0.4)'], [1, 'rgba(255,255,255,0)']], 30);
      for (let k = 0; k < 2; k++) {
        x.save(); x.rotate(k * Math.PI / 2);
        const g = x.createLinearGradient(-62, 0, 62, 0);
        g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)');
        x.fillStyle = g; x.beginPath(); x.moveTo(-62, 0); x.lineTo(0, -5); x.lineTo(62, 0); x.lineTo(0, 5); x.closePath(); x.fill();
        x.restore();
      }
    });
    // 4 humo
    cell(4, (x) => {
      const rnd = BB.U.seeded(77);
      for (let k = 0; k < 14; k++) {
        const px = (rnd() - 0.5) * 50, py = (rnd() - 0.5) * 50, r = 18 + rnd() * 26;
        const g = x.createRadialGradient(px, py, 0, px, py, r);
        g.addColorStop(0, 'rgba(255,255,255,0.35)'); g.addColorStop(1, 'rgba(255,255,255,0)');
        x.fillStyle = g; x.beginPath(); x.arc(px, py, r, 0, Math.PI * 2); x.fill();
      }
    });
    // 5 onda de choque gruesa
    cell(5, () => radial([[0, 'rgba(255,255,255,0)'], [0.55, 'rgba(255,255,255,0.05)'], [0.82, 'rgba(255,255,255,0.9)'], [0.9, 'rgba(255,255,255,0.5)'], [1, 'rgba(255,255,255,0)']], 62));
    // 6 sombra blob
    cell(6, () => radial([[0, 'rgba(0,0,0,0.9)'], [0.5, 'rgba(0,0,0,0.55)'], [1, 'rgba(0,0,0,0)']], 62));
    // 7 estela vertical
    cell(7, (x) => {
      const g = x.createLinearGradient(-60, 0, 60, 0);
      g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.35, 'rgba(255,255,255,0.5)'); g.addColorStop(0.5, 'rgba(255,255,255,1)'); g.addColorStop(0.65, 'rgba(255,255,255,0.5)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = g; x.fillRect(-62, -62, 124, 124);
      x.globalCompositeOperation = 'destination-in';
      const h = x.createLinearGradient(0, -62, 0, 62);
      h.addColorStop(0, 'rgba(0,0,0,0)'); h.addColorStop(0.15, 'rgba(0,0,0,1)'); h.addColorStop(0.85, 'rgba(0,0,0,1)'); h.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = h; x.fillRect(-64, -64, 128, 128);
    });
    // 8 flare horizontal
    cell(8, (x) => {
      const g = x.createLinearGradient(-62, 0, 62, 0);
      g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = g; x.beginPath(); x.ellipse(0, 0, 62, 7, 0, 0, Math.PI * 2); x.fill();
    });
    // 9 hexágonos (escudo)
    cell(9, (x) => {
      x.strokeStyle = 'rgba(255,255,255,0.8)'; x.lineWidth = 2;
      const R = 11;
      for (let gy = -4; gy <= 4; gy++) for (let gx = -4; gx <= 4; gx++) {
        const px = gx * R * 1.75 + (gy % 2 ? R * 0.87 : 0), py = gy * R * 1.5;
        if (px * px + py * py > 58 * 58) continue;
        x.beginPath();
        for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3 + Math.PI / 6; x.lineTo(px + Math.cos(a) * R, py + Math.sin(a) * R); }
        x.closePath(); x.stroke();
      }
      x.globalCompositeOperation = 'destination-in';
      radial([[0, 'rgba(0,0,0,0.2)'], [0.8, 'rgba(0,0,0,1)'], [1, 'rgba(0,0,0,0)']], 62);
    });
    // 10 fragmento
    cell(10, (x) => { x.fillStyle = '#fff'; x.beginPath(); x.moveTo(-30, -20); x.lineTo(25, -34); x.lineTo(36, 18); x.lineTo(-8, 36); x.lineTo(-38, 6); x.closePath(); x.fill(); });
    // 11 punto duro
    cell(11, () => radial([[0, 'rgba(255,255,255,1)'], [0.7, 'rgba(255,255,255,1)'], [1, 'rgba(255,255,255,0)']], 40));
    // 12 rayo (segmento eléctrico)
    cell(12, (x) => {
      const g = x.createLinearGradient(-60, 0, 60, 0);
      g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.42, 'rgba(255,255,255,0.35)'); g.addColorStop(0.5, 'rgba(255,255,255,1)'); g.addColorStop(0.58, 'rgba(255,255,255,0.35)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = g; x.fillRect(-62, -64, 124, 128);
    });
    // 13 advertencia (línea de láser discontinua)
    cell(13, (x) => {
      for (let k = -64; k < 64; k += 22) { x.fillStyle = 'rgba(255,255,255,0.95)'; x.fillRect(-8, k, 16, 12); }
    });
    // 14 glow amplio
    cell(14, () => radial([[0, 'rgba(255,255,255,0.6)'], [0.5, 'rgba(255,255,255,0.2)'], [1, 'rgba(255,255,255,0)']], 62));
    // 15 estrella
    cell(15, (x) => {
      x.fillStyle = '#fff'; x.beginPath();
      for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2 - Math.PI / 2, r = i % 2 ? 22 : 56; x.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
      x.closePath(); x.fill();
    });
    // 16..23 iconos de boosts
    Object.keys(T.ICON_CELL).forEach((k) => cell(T.ICON_CELL[k], (x) => { x.translate(-0, -0); drawBadge(x, k, 0, 0, 58); }));

    // etiquetas de carril para el suelo
    Object.keys(T.LANE_CELL).forEach((k) => cell(T.LANE_CELL[k], (x) => {
      x.font = '900 46px "Russo One", "Arial Black", sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.lineWidth = 8; x.strokeStyle = 'rgba(0,0,0,0.6)'; x.strokeText(k, 0, 0);
      x.fillStyle = '#ffffff'; x.fillText(k, 0, 0);
    }));
    // banderas (filas 4 a 6)
    T.drawFlagStickers(ctx);
    // Glifos (fila 7): celdas de 64px
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '900 100px "Russo One", "Arial Black", Impact, sans-serif';
    for (let i = 0; i < T.GLYPHS.length; i++) {
      const ch = T.GLYPHS[i];
      const x = i * 64 + 32, y = 7 * CELL + 66;
      ctx.lineWidth = 14; ctx.strokeStyle = 'rgba(8,10,26,0.95)'; ctx.lineJoin = 'round';
      ctx.save(); ctx.translate(x, y); ctx.scale(0.62, 1);
      ctx.strokeText(ch, 0, 0);
      ctx.fillStyle = '#ffffff'; ctx.fillText(ch, 0, 0);
      ctx.restore();
      const e = 1 / 1024;
      T.glyphUV[ch] = [(i * 64) / 1024 + e, (7 * CELL) / 1024 + e, (i * 64 + 64) / 1024 - e, 1 - e];
    }
    return new BB.Texture(c, { mip: true });
  };

  // ---------- Nebulosa de fondo ----------
  T.makeNebula = function (w, h, seed, palette) {
    w = w || 512; h = h || 1024;
    const c = mk(w, h), x = c.getContext('2d');
    const rnd = BB.U.seeded(seed || 1234);
    const g = x.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#170b36'); g.addColorStop(0.45, '#0c1440'); g.addColorStop(1, '#070a1f');
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    const cols = palette || ['rgba(150,50,230,0.30)', 'rgba(30,140,255,0.26)', 'rgba(255,60,140,0.18)', 'rgba(40,220,230,0.14)', 'rgba(255,140,60,0.10)'];
    x.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 26; i++) {
      const px = rnd() * w, py = rnd() * h * 0.9, r = (0.15 + rnd() * 0.45) * w;
      const col = cols[i % cols.length];
      const gr = x.createRadialGradient(px, py, 0, px, py, r);
      gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = gr; x.beginPath(); x.arc(px, py, r, 0, Math.PI * 2); x.fill();
    }
    // polvo
    for (let i = 0; i < 900; i++) {
      const px = rnd() * w, py = rnd() * h, r = rnd() * 2.2;
      x.fillStyle = 'rgba(180,200,255,' + (rnd() * 0.08).toFixed(3) + ')';
      x.beginPath(); x.arc(px, py, r * 4, 0, Math.PI * 2); x.fill();
    }
    x.globalCompositeOperation = 'source-over';
    // bandas oscuras
    for (let i = 0; i < 8; i++) {
      const px = rnd() * w, py = rnd() * h, r = (0.1 + rnd() * 0.25) * w;
      const gr = x.createRadialGradient(px, py, 0, px, py, r);
      gr.addColorStop(0, 'rgba(3,4,14,0.35)'); gr.addColorStop(1, 'rgba(3,4,14,0)');
      x.fillStyle = gr; x.beginPath(); x.arc(px, py, r, 0, Math.PI * 2); x.fill();
    }
    // estrellas lejanas
    for (let i = 0; i < 700; i++) {
      const px = rnd() * w, py = rnd() * h, b = rnd();
      x.fillStyle = 'rgba(255,255,255,' + (0.25 + b * 0.6).toFixed(2) + ')';
      x.fillRect(px, py, b > 0.93 ? 2 : 1, b > 0.93 ? 2 : 1);
    }
    return new BB.Texture(c, { mip: false });
  };

  // ---------- Suelo de la arena ----------
  // Mosaico de hexágonos que se repite (un periodo: ancho = raíz de 3 por R, alto = 3 R). Solo usa el canal alfa.
  T.HEX_R = 0.6;   // radio del hexágono en unidades del mundo
  T.makeHexTile = function () {
    const W = 128, H = 256, c = mk(W, H), x = c.getContext('2d');
    const R = W / 1.7320508, sy = H / (3 * R);
    x.scale(1, sy);
    x.strokeStyle = '#ffffff'; x.lineWidth = 5.2;
    for (let gy = -1; gy <= 3; gy++) for (let gx = -1; gx <= 2; gx++) {
      const px = gx * R * 1.7320508 + (gy % 2 ? R * 0.8660254 : 0), py = gy * R * 1.5;
      x.beginPath();
      for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3 + Math.PI / 6; x.lineTo(px + Math.cos(a) * R, py + Math.sin(a) * R); }
      x.closePath(); x.stroke();
    }
    return new BB.Texture(c, { mip: true, repeat: true });
  };

  T.makeArena = function (halfW, extW) {
    const W = 512, H = 1024;
    const c = mk(W, H), x = c.getContext('2d');
    const total = (halfW + extW) * 2;
    const toPx = (wx) => ((wx + halfW + extW) / total) * W;
    const wl = toPx(-halfW), wr = toPx(halfW);
    // base
    const g = x.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, 'rgba(20,30,70,0.0)'); g.addColorStop(0.18, 'rgba(18,28,66,0.75)'); g.addColorStop(0.6, 'rgba(14,22,54,0.93)'); g.addColorStop(1, 'rgba(10,14,36,0.96)');
    x.fillStyle = g; x.fillRect(wl, 0, wr - wl, H);
    // fuera de los muros
    const gs = x.createLinearGradient(0, 0, 0, H);
    gs.addColorStop(0, 'rgba(10,14,40,0)'); gs.addColorStop(0.3, 'rgba(10,14,40,0.55)'); gs.addColorStop(1, 'rgba(8,10,30,0.7)');
    x.fillStyle = gs; x.fillRect(0, 0, wl, H); x.fillRect(wr, 0, W - wr, H);
    // (la rejilla hexagonal ahora es un mosaico aparte que avanza: ver makeHexTile)
    x.save();
    x.beginPath(); x.rect(wl, 0, wr - wl, H); x.clip();
    // líneas de carril
    for (let i = 1; i < 6; i++) {
      const px = wl + ((wr - wl) * i) / 6;
      const lg = x.createLinearGradient(0, 0, 0, H);
      lg.addColorStop(0, 'rgba(80,170,255,0)'); lg.addColorStop(0.4, 'rgba(80,170,255,0.12)'); lg.addColorStop(1, 'rgba(80,170,255,0.2)');
      x.fillStyle = lg; x.fillRect(px - 1, 0, 2, H);
    }
    x.restore();
    // muros brillantes
    for (const px of [wl, wr]) {
      const lg = x.createLinearGradient(0, 0, 0, H);
      lg.addColorStop(0, 'rgba(60,230,255,0)'); lg.addColorStop(0.25, 'rgba(60,230,255,0.7)'); lg.addColorStop(1, 'rgba(60,230,255,1)');
      x.fillStyle = lg; x.fillRect(px - 3, 0, 6, H);
      const gg = x.createLinearGradient(px - 26, 0, px + 26, 0);
      gg.addColorStop(0, 'rgba(60,230,255,0)'); gg.addColorStop(0.5, 'rgba(60,230,255,0.25)'); gg.addColorStop(1, 'rgba(60,230,255,0)');
      x.fillStyle = gg; x.fillRect(px - 26, H * 0.15, 52, H * 0.85);
    }
    return new BB.Texture(c, { mip: true });
  };

  BB.Tex = T;
})(window.BB);
