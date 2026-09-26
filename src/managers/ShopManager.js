/* managers/ShopManager.js — tienda: cañones, proyectiles, escudos, mini naves y skins */
(function (BB) {
  'use strict';

  const CATS = [
    { id: 'cannons', name: 'CAÑONES' },
    { id: 'bullets', name: 'PROYECTILES' },
    { id: 'shields', name: 'ESCUDOS' },
    { id: 'minis', name: 'MINI NAVES' },
    { id: 'skins', name: 'SKINS' },
  ];

  const upCost = (base, k) => (lvl) => Math.round(base * Math.pow(k, lvl) / 10) * 10;

  const ITEMS = [
    // CAÑONES — modelos equipables
    { id: 'cannon_blaster', cat: 'cannons', kind: 'equip', slot: 'cannon', val: 'blaster', name: 'Blaster', desc: 'Cañón estándar equilibrado.', price: 0, stats: { rate: 1, dmg: 1 } },
    { id: 'cannon_twin', cat: 'cannons', kind: 'equip', slot: 'cannon', val: 'twin', name: 'Twin Pulsar', desc: 'Doble cañón: +20% daño total, +10% cadencia.', price: 700, stats: { rate: 1.1, dmg: 1 } },
    { id: 'cannon_titan', cat: 'cannons', kind: 'equip', slot: 'cannon', val: 'titan', name: 'Titan', desc: 'Cañón pesado: +55% daño, −10% cadencia.', price: 1800, stats: { rate: 0.9, dmg: 1.55 } },
    { id: 'cannon_nova', cat: 'cannons', kind: 'equip', slot: 'cannon', val: 'nova', name: 'Nova Prime', desc: 'Triple núcleo: +30% daño y +30% cadencia.', price: 4500, stats: { rate: 1.3, dmg: 1.3 } },
    // CAÑONES — mejoras
    { id: 'up_power', cat: 'cannons', kind: 'upgrade', key: 'power', name: 'Potencia', desc: '+18% de daño por nivel.', max: 15, cost: upCost(80, 1.42) },
    { id: 'up_rate', cat: 'cannons', kind: 'upgrade', key: 'rate', name: 'Cadencia', desc: '+8% de disparos por segundo por nivel.', max: 10, cost: upCost(100, 1.5) },
    // PROYECTILES
    { id: 'bullet_plasma', cat: 'bullets', kind: 'equip', slot: 'bullet', val: 'plasma', name: 'Plasma', desc: 'Proyectil de energía cian.', price: 0 },
    { id: 'bullet_laser', cat: 'bullets', kind: 'equip', slot: 'bullet', val: 'laser', name: 'Láser', desc: '+30% velocidad y +10% daño.', price: 900 },
    { id: 'bullet_solar', cat: 'bullets', kind: 'equip', slot: 'bullet', val: 'solar', name: 'Fuego Solar', desc: 'Proyectil grande: +20% daño.', price: 2200 },
    { id: 'bullet_anti', cat: 'bullets', kind: 'equip', slot: 'bullet', val: 'anti', name: 'Antimateria', desc: 'Atraviesa 1 enemigo, +25% daño.', price: 5200 },
    // ESCUDOS
    { id: 'up_shield', cat: 'shields', kind: 'upgrade', key: 'shield', name: 'Escudo extra', desc: '+1 escudo máximo por nivel.', max: 2, cost: (l) => [1500, 4000][l] },
    { id: 'up_invuln', cat: 'shields', kind: 'upgrade', key: 'invuln', name: 'Blindaje reactivo', desc: '+0,4 s de invulnerabilidad tras un impacto.', max: 3, cost: upCost(400, 2) },
    { id: 'up_bubble', cat: 'shields', kind: 'upgrade', key: 'bubble', name: 'Burbuja duradera', desc: '+3 s de duración del boost SHIELD.', max: 3, cost: upCost(350, 2) },
    // MINI NAVES
    { id: 'up_squadCount', cat: 'minis', kind: 'upgrade', key: 'squadCount', name: 'Escuadrón ampliado', desc: '+1 mini nave (máx. 5).', max: 2, cost: (l) => [1200, 3500][l] },
    { id: 'up_squadTime', cat: 'minis', kind: 'upgrade', key: 'squadTime', name: 'Combustible', desc: '+3 s de MINI SQUAD por nivel.', max: 3, cost: upCost(450, 1.9) },
    { id: 'up_squadBounce', cat: 'minis', kind: 'upgrade', key: 'squadBounce', name: 'Rebote extra', desc: '+1 rebote de las balas de mini naves.', max: 2, cost: (l) => [900, 2600][l] },
    // SKINS
    { id: 'skin_cobalt', cat: 'skins', kind: 'equip', slot: 'skin', val: 'cobalt', name: 'Cobalto', desc: 'Acabado azul de fábrica.', price: 0 },
    { id: 'skin_solar', cat: 'skins', kind: 'equip', slot: 'skin', val: 'solar', name: 'Solar', desc: 'Oro pulido con núcleo ámbar.', price: 500 },
    { id: 'skin_venom', cat: 'skins', kind: 'equip', slot: 'skin', val: 'venom', name: 'Venom', desc: 'Verde tóxico con brillo lima.', price: 900 },
    { id: 'skin_phantom', cat: 'skins', kind: 'equip', slot: 'skin', val: 'phantom', name: 'Phantom', desc: 'Negro mate con energía violeta.', price: 1500 },
    { id: 'skin_crimson', cat: 'skins', kind: 'equip', slot: 'skin', val: 'crimson', name: 'Royal Crimson', desc: 'Carmesí real con detalles dorados.', price: 2500 },
  ];

  class ShopManager {
    constructor(game) { this.game = game; this.cats = CATS; this.items = ITEMS; }
    // la campaña se mejora SOLO con monedas del juego (las Monedas Lunares son exclusivas de la copa)
    canPay(coins) { return this.data.coins >= coins; }
    pay(coins) { this.data.coins -= coins; }
    get data() { return this.game.save.data; }
    list(cat) { return ITEMS.filter((i) => i.cat === cat); }
    get(id) { return ITEMS.find((i) => i.id === id); }

    state(item) {
      const d = this.data;
      if (item.kind === 'equip') {
        const owned = !!d.shop.owned[item.id];
        const equipped = d.shop.equipped[item.slot] === item.val;
        return { owned, equipped, price: item.price, affordable: this.canPay(item.price) };
      }
      const lvl = d.shop.up[item.key] || 0;
      const maxed = lvl >= item.max;
      const price = maxed ? 0 : item.cost(lvl);
      return { level: lvl, max: item.max, maxed, price, affordable: maxed ? false : this.canPay(price) };
    }

    buy(id) {
      const item = this.get(id), d = this.data;
      if (!item) return false;
      const st = this.state(item);
      if (item.kind === 'equip') {
        if (st.owned) { d.shop.equipped[item.slot] = item.val; this.game.onLoadoutChanged(); this.game.save.save(); return 'equip'; }
        if (!st.affordable) return false;
        this.pay(item.price);
        d.shop.owned[item.id] = 1;
        d.shop.equipped[item.slot] = item.val;
      } else {
        if (st.maxed || !st.affordable) return false;
        this.pay(st.price);
        d.shop.up[item.key] = (d.shop.up[item.key] || 0) + 1;
      }
      this.game.onLoadoutChanged();
      this.game.save.save();
      return 'buy';
    }

    // Estadísticas efectivas del jugador
    computeStats() {
      const d = this.data, up = d.shop.up;
      const cannon = ITEMS.find((i) => i.slot === 'cannon' && i.val === d.shop.equipped.cannon) || ITEMS[0];
      const cs = cannon.stats || { rate: 1, dmg: 1 };
      return {
        dmg: 1 * cs.dmg * (1 + 0.18 * (up.power || 0)),
        rate: 8.5 * cs.rate * (1 + 0.08 * (up.rate || 0)),
        maxShields: 3 + (up.shield || 0),
        invuln: 1.6 + 0.4 * (up.invuln || 0),
        shieldBonus: 3 * (up.bubble || 0),
        squadCount: 3 + (up.squadCount || 0),
        squadDur: 14 + 3 * (up.squadTime || 0),
        squadBounces: 2 + (up.squadBounce || 0),
        bullet: d.shop.equipped.bullet,
        cannon: d.shop.equipped.cannon,
        skin: d.shop.equipped.skin,
      };
    }
  }
  BB.ShopManager = ShopManager;
})(window.BB);
