"""Prueba integral del flujo completo (móvil emulado). Uso: python3 test/full.py"""
import os, sys, json, time
from playwright.sync_api import sync_playwright
sys.path.insert(0, os.path.dirname(__file__))
from smoke import URL, OUT, ARGS

RESULTS = []
def check(name, ok, info=''):
    RESULTS.append((name, bool(ok), info))
    print(('PASS ' if ok else 'FAIL ') + name + ('  ' + str(info) if info else ''), flush=True)

BOT = """
(() => {
  const g = BB.game;
  if (window.__bot) clearInterval(window.__bot);
  window.__bot = setInterval(() => {
    if (!g.isPlaying()) return;
    // apuntar al meteorito más bajo / alien más cercano
    let best = null, by = 1e9;
    g.meteors.forEachAlive(m => { if (m.y < by && m.y < 21) { by = m.y; best = m; } });
    if (!best) g.aliens.forEachAlive(a => { if (a.y < by) { by = a.y; best = a; } });
    if (g.boss && g.boss.alive && (!best || g.boss.hp < 50)) best = g.boss;
    if (best) g.player.targetX = Math.max(-3.8, Math.min(3.8, best.x));
  }, 80);
})()
"""

def st(pg): return pg.evaluate('BB.game.state')
def visible(pg, sel): return pg.evaluate('(s)=>{const e=document.querySelector(s); return !!e && !e.hidden && e.offsetParent!==null}', sel)

def wait_state(pg, states, timeout=60):
    t0 = time.time()
    while time.time() - t0 < timeout:
        s = st(pg)
        if s in states: return s
        time.sleep(0.25)
    return st(pg)

def main():
    with sync_playwright() as p:
        b = p.chromium.launch(args=ARGS)
        ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=1, is_mobile=True, has_touch=True)
        pg = ctx.new_page()
        logs = []
        pg.on('pageerror', lambda e: logs.append('PAGEERROR: ' + str(e)))
        pg.on('console', lambda m: logs.append(m.type + ': ' + m.text) if m.type in ('error', 'warning') and 'TUNNEL' not in m.text else None)
        pg.goto(URL)
        pg.wait_for_function('window.__BB_READY === true', timeout=30000)
        check('pantalla de carga con botón JUGAR', visible(pg, '#btn-start'))
        pg.click('#btn-start')
        pg.wait_for_timeout(600)
        check('menú visible', visible(pg, '#s-menu') and st(pg) == 'MENU')
        pg.evaluate('BB.game.save.data.coins = 0')
        pg.click('#btn-play')
        pg.wait_for_timeout(800)
        check('JUGAR inicia nivel 1', st(pg) == 'PLAYING' and pg.evaluate('BB.game.level.num') == 1)
        check('jugador visible', pg.evaluate('BB.game.player.node.visible && BB.game.player.base.geo.count > 0'))
        pg.wait_for_timeout(2500)
        check('meteoritos aparecen', pg.evaluate('BB.game.meteors.countAlive()') > 0, pg.evaluate('BB.game.meteors.countAlive()'))
        px = pg.evaluate('BB.game.lastPixel')
        check('escena 3D renderizada (no negra)', px and sum(px[0][:3]) + sum(px[1][:3]) > 20, px)
        check('draw calls 3D', pg.evaluate('BB.game.renderer.stats.calls') > 8, pg.evaluate('BB.game.renderer.stats'))

        # --- control táctil real (CDP touch) ---
        cdp = ctx.new_cdp_session(pg)
        x0 = pg.evaluate('BB.game.player.x')
        def touch(type_, x, y):
            pts = [] if type_ == 'touchEnd' else [{'x': x, 'y': y, 'id': 1}]
            cdp.send('Input.dispatchTouchEvent', {'type': type_, 'touchPoints': pts})
        touch('touchStart', 200, 600)
        for i in range(1, 11):
            touch('touchMove', 200 - i * 12, 600); pg.wait_for_timeout(30)
        pg.wait_for_timeout(300)
        xl = pg.evaluate('BB.game.player.x')
        for i in range(1, 21):
            touch('touchMove', 80 + i * 12, 600); pg.wait_for_timeout(30)
        pg.wait_for_timeout(300)
        xr = pg.evaluate('BB.game.player.x')
        touch('touchEnd', 0, 0)
        check('dedo mueve a la izquierda', xl < x0 - 0.5, (x0, xl))
        check('dedo mueve a la derecha', xr > xl + 1.0, (xl, xr))
        check('pista de tutorial se oculta al arrastrar', not visible(pg, '#h-hint'))
        # mouse (PC)
        pg.mouse.move(200, 500); pg.mouse.down(); pg.mouse.move(120, 500, steps=5); pg.mouse.up()
        pg.wait_for_timeout(200)
        check('mouse arrastra (PC)', pg.evaluate('BB.game.player.targetX') < xr)

        s0 = pg.evaluate('BB.game.player.shots'); pg.wait_for_timeout(1000)
        check('disparo automático', pg.evaluate('BB.game.player.shots') - s0 >= 3, pg.evaluate('BB.game.player.shots') - s0)
        pg.evaluate(BOT)
        pg.evaluate('BB.game.shields = 99')
        pg.wait_for_timeout(6000)
        kills = pg.evaluate('BB.game.levelKills')
        check('colisiones y destrucción de meteoritos', kills > 0, kills)
        pg.screenshot(path=OUT + '/10_level1.png')
        check('monedas recolectadas (a la bolsa en riesgo)', pg.evaluate('BB.game.bag') > 0 and pg.evaluate('BB.game.save.data.coins') == 0, pg.evaluate('[BB.game.bag, BB.game.save.data.coins]'))
        check('puntuación sube', pg.evaluate('BB.game.score') > 0, pg.evaluate('BB.game.score'))

        # --- boosts ---
        pg.evaluate("['multi','multi','multi','multi'].forEach(k=>BB.game.boosts.activate(k))")
        check('MULTI SHOT x7', pg.evaluate('BB.MULTI_LEVELS[BB.game.boosts.multiTier()]') == 7)
        xs = pg.evaluate('(()=>{const g=BB.game; g.softClear(); g.bullets.pb.forEach(b=>b.alive=false); g.player.fire(); return g.bullets.pb.filter(b=>b.alive).map(b=>+(b.x+b.vx*0.3).toFixed(2))})()')
        distinct = len(set(round(x, 1) for x in xs))
        check('x7 genera proyectiles separados', distinct >= 6, sorted(xs)[:14])
        pg.evaluate("['rapid','big','damage','shield','magnet','coin'].forEach(k=>BB.game.boosts.activate(k))")
        act = pg.evaluate("BB.BOOST_KEYS.filter(k=>BB.game.boosts.isActive(k))")
        check('todos los boosts activables', len(act) >= 7, act)
        pg.wait_for_timeout(300)
        check('HUD muestra boosts activos', pg.evaluate("document.querySelectorAll('#h-boosts .bst').length") >= 7)
        pg.evaluate("BB.game.boosts.activate('squad')")
        pg.wait_for_timeout(2500)
        sq = pg.evaluate("(()=>{const s=BB.game.squad; return {active:s.active, vis:s.ships.filter(x=>x.node.visible).length, z:s.ships.slice(0,3).map(x=>+x.z.toFixed(2)), mb:BB.game.bullets.mb.filter(b=>b.alive).length}})()")
        check('MINI SQUAD: naves orbitando en 3D', sq['active'] and sq['vis'] >= 2 and max(sq['z']) > 0.8, sq)
        pg.screenshot(path=OUT + '/11_boosts.png')
        # rebotes: forzar una bala con rebote sobre un objetivo
        bounced = pg.evaluate("""(()=>{const g=BB.game; let n=0; g.bullets.mb.forEach(b=>{ if(b.alive && b.bounces < g.stats.squadBounces) n++; }); return n})()""")
        pg.wait_for_timeout(1500)
        bounced2 = pg.evaluate("""(()=>{const g=BB.game; let n=0; g.bullets.mb.forEach(b=>{ if(b.alive && b.bounces < g.stats.squadBounces) n++; }); return n})()""")
        check('balas rebotadoras (rebote registrado)', bounced + bounced2 > 0 or pg.evaluate('BB.game.meteors.countAlive()') == 0, (bounced, bounced2))
        check('vibración no rompe (API opcional)', pg.evaluate("(()=>{try{BB.game.vibrate(10);return true}catch(e){return false}})()"))

        # --- pausa ---
        pg.click('#btn-pause')
        pg.wait_for_timeout(300)
        check('pausa', st(pg) == 'PAUSED' and visible(pg, '#s-pause'))
        pg.screenshot(path=OUT + '/12_pause.png')
        t1 = pg.evaluate('BB.game.meteors.items.filter(m=>m.alive).map(m=>m.y).join()')
        pg.wait_for_timeout(500)
        t2 = pg.evaluate('BB.game.meteors.items.filter(m=>m.alive).map(m=>m.y).join()')
        check('juego congelado en pausa', t1 == t2)
        pg.click('#p-sound'); pg.click('#p-sound')
        pg.click('#btn-resume')
        pg.wait_for_timeout(200)
        check('continuar', st(pg) == 'PLAYING')
        pg.evaluate("Object.defineProperty(document,'hidden',{value:true,configurable:true}); document.dispatchEvent(new Event('visibilitychange'))")
        check('auto-pausa al perder visibilidad', st(pg) == 'PAUSED')
        pg.evaluate("Object.defineProperty(document,'hidden',{value:false,configurable:true}); document.dispatchEvent(new Event('visibilitychange'))")
        pg.click('#btn-resume')

        # --- completar nivel 1 ---
        s = wait_state(pg, ['LEVEL_COMPLETE'], 120)
        check('nivel termina (NIVEL COMPLETADO)', s == 'LEVEL_COMPLETE' and visible(pg, '#s-complete'), s)
        pg.screenshot(path=OUT + '/13_complete.png')
        check('botón SIGUIENTE NIVEL disponible', pg.evaluate("!document.getElementById('btn-next').disabled"))
        pg.click('#btn-next')
        pg.wait_for_timeout(500)
        check('SIGUIENTE NIVEL -> nivel 2', st(pg) == 'PLAYING' and pg.evaluate('BB.game.level.num') == 2)
        pg.evaluate('BB.game.shields = 99')
        s = wait_state(pg, ['LEVEL_COMPLETE'], 150)
        check('nivel 2 completo', s == 'LEVEL_COMPLETE', s)
        # elegir recompensa opcional
        pg.click('#c-cards .card >> nth=0')
        pg.click('#btn-next')
        pg.wait_for_timeout(400)
        check('recompensa opcional guardada', pg.evaluate('BB.game.boosts.inventory.length') == 1)
        pg.click('#h-inv .slot >> nth=0')
        pg.wait_for_timeout(200)
        check('usar boost guardado', pg.evaluate('BB.game.boosts.inventory.length') == 0)

        # --- niveles 3 y 4 (rápido) ---
        for L in (3, 4):
            pg.evaluate(f'BB.game.toMenu(); BB.game.camp().cycle = 0; BB.game.startLevel({L}); BB.game.shields = 99')
            s = wait_state(pg, ['LEVEL_COMPLETE'], 200)
            check(f'nivel {L} completo', s == 'LEVEL_COMPLETE', (s, pg.evaluate('BB.game.level.queue.length'), pg.evaluate('BB.game.meteors.countAlive()'), pg.evaluate('BB.game.aliens.countAlive()')))
            if L == 4: pg.screenshot(path=OUT + '/14_level4_done.png')

        # --- BOSS nivel 5 ---
        pg.click('#btn-next')
        pg.wait_for_timeout(1500)
        check('nivel 5 = BOSS INTRO', st(pg) in ('BOSS_INTRO', 'BOSS_FIGHT') and pg.evaluate('!!BB.game.boss'))
        pg.screenshot(path=OUT + '/20_boss_intro.png')
        s = wait_state(pg, ['BOSS_FIGHT'], 15)
        check('BOSS FIGHT', s == 'BOSS_FIGHT')
        pg.evaluate('BB.game.shields = 99')
        hp0 = pg.evaluate('BB.game.boss.hp')
        pg.wait_for_timeout(5000)
        hp1 = pg.evaluate('BB.game.boss.hp')
        check('boss recibe daño', hp1 < hp0, (hp0, hp1))
        check('barra de vida del boss', visible(pg, '#h-boss'))
        pg.screenshot(path=OUT + '/21_boss_fight.png')
        pg.evaluate('BB.game.boss.hp = BB.game.boss.maxHp*0.12')
        pg.wait_for_timeout(2500)
        check('fase final del boss', pg.evaluate('BB.game.boss.phase') == 4)
        pg.screenshot(path=OUT + '/22_boss_final.png')
        pg.evaluate('BB.game.boss.hp = 1')
        s = wait_state(pg, ['LEVEL_COMPLETE'], 30)
        check('boss muere -> victoria', s == 'LEVEL_COMPLETE' and 'BOSS' in pg.inner_text('#c-title'), pg.inner_text('#c-title'))
        pg.screenshot(path=OUT + '/23_boss_victory.png')
        pg.click('#btn-next')
        pg.wait_for_timeout(400)
        check('continúa campaña tras boss (nivel 6)', pg.evaluate('BB.game.level.num') == 6 and st(pg) == 'PLAYING')

        # --- resto de bosses ---
        for L in (10, 15, 20, 25):
            pg.evaluate(f'BB.game.toMenu(); BB.game.camp().cycle = 0; BB.game.startLevel({L}); BB.game.shields = 99')
            s = wait_state(pg, ['BOSS_FIGHT'], 20)
            pg.wait_for_timeout(4000)
            pg.evaluate('BB.game.boss && (BB.game.boss.hp = BB.game.boss.maxHp*0.1)')
            pg.wait_for_timeout(3500)
            pg.screenshot(path=OUT + f'/3{L//5}_boss_{L}.png')
            name = pg.evaluate('BB.game.boss && BB.game.boss.name')
            pg.evaluate('BB.game.boss && (BB.game.boss.hp = 1)')
            s2 = wait_state(pg, ['LEVEL_COMPLETE'], 30)
            check(f'boss nivel {L} ({name})', s == 'BOSS_FIGHT' and s2 == 'LEVEL_COMPLETE', (s, s2))

        # --- niveles avanzados con enemigos variados ---
        for L in (8, 9, 17, 19):
            pg.evaluate(f'BB.game.toMenu(); BB.game.camp().cycle = 0; BB.game.startLevel({L}); BB.game.shields = 99')
            pg.wait_for_timeout(9000)
            info = pg.evaluate("({m:BB.game.meteors.items.filter(m=>m.alive).map(m=>m.type[0]+m.tier).join(','), a:BB.game.aliens.items.filter(a=>a.alive).map(a=>a.type).join(',')})")
            check(f'nivel {L} en curso sin errores', pg.evaluate('BB.errors.length') == 0, info)
        pg.screenshot(path=OUT + '/40_level19.png')

        # --- game over ---
        pg.evaluate('BB.game.boosts.consume("shield"); BB.game.shields = 1; BB.game.player.invuln = 0; BB.game.hitPlayer("test")')
        s = wait_state(pg, ['GAME_OVER'], 5)
        wait_until = time.time() + 8
        while time.time() < wait_until and not visible(pg, '#s-over'): time.sleep(0.25)
        check('GAME OVER', s == 'GAME_OVER' and visible(pg, '#s-over'), pg.evaluate('({st:BB.game.state, sh:BB.game.shields, le:BB.game.levelEnding, pd:BB.game.playerDead, inv:BB.game.player.invuln, over:!document.getElementById("s-over").hidden})'))
        pg.screenshot(path=OUT + '/50_gameover.png')
        pg.click('#btn-retry')
        pg.wait_for_timeout(500)
        check('REINTENTAR', st(pg) == 'PLAYING' and pg.evaluate('BB.game.shields') >= 3)
        pg.click('#btn-pause'); pg.click('#btn-quit')
        pg.wait_for_timeout(500)
        check('SALIR AL MENÚ', st(pg) == 'MENU' and visible(pg, '#s-menu'))

        # --- tienda ---
        pg.evaluate('BB.game.save.data.coins = 20000')
        pg.click('#btn-shop')
        pg.wait_for_timeout(1500)
        check('tienda abre', st(pg) == 'SHOP' and visible(pg, '#s-shop'))
        pg.click('button[data-buy="cannon_titan"]')
        pg.click('button[data-cat="skins"]')
        pg.click('button[data-buy="skin_crimson"]')
        pg.wait_for_timeout(800)
        pg.screenshot(path=OUT + '/60_shop.png')
        eq = pg.evaluate('BB.game.save.data.shop.equipped')
        check('compra y equipa', eq['cannon'] == 'titan' and eq['skin'] == 'crimson', eq)
        pg.click('#shop-back')
        pg.wait_for_timeout(300)
        pg.evaluate("BB.game.save.data.profile = {country:'AR', city:'Córdoba', cont:'SA', changedAt: Date.now()}")
        for bid, sid, shot in (('#btn-settings', '#s-settings', '61_settings'), ('#btn-info', '#s-info', '62_info'), ('#btn-rank', '#s-rank', '64_rank'), ('#btn-records', '#s-records', '63_records')):
            pg.click(bid); pg.wait_for_timeout(300)
            check('pantalla ' + sid, visible(pg, sid))
            pg.screenshot(path=OUT + '/' + shot + '.png')
            if sid != '#s-rank': pg.click(sid + ' .vhead .iconbtn'); pg.wait_for_timeout(200)
        # guardado
        saved = pg.evaluate("JSON.parse(localStorage.getItem('ballblast3d_save_v1')||'{}')")
        check('guardado en localStorage', saved.get('unlocked', 0) >= 6 and saved.get('shop', {}).get('equipped', {}).get('skin') == 'crimson', saved.get('unlocked'))
        errs = pg.evaluate('BB.errors.map(e=>e.where+": "+e.msg.slice(0,200))')
        check('sin errores JS registrados', len(errs) == 0, errs[:5])
        check('sin errores de página', not any('PAGEERROR' in l for l in logs), [l for l in logs if 'PAGEERROR' in l][:5])
        print('FPS aprox headless:', pg.evaluate('BB.game.perf.fps.toFixed(1)'), 'tier', pg.evaluate('BB.game.perf.tier'))
        b.close()
    fails = [r for r in RESULTS if not r[1]]
    print('\n%d/%d OK' % (len(RESULTS) - len(fails), len(RESULTS)))
    for f in fails: print('  FAIL', f[0], f[2])

if __name__ == '__main__':
    main()
