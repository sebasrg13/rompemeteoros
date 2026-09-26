"""Prueba del DUELO 1 VS 1 con dos jugadores reales (dos pestañas) sobre una room simulada.
Uso: python3 test/pvp.py"""
import os, sys, time, threading, http.server, socketserver, functools
from playwright.sync_api import sync_playwright
sys.path.insert(0, os.path.dirname(__file__))
from smoke import OUT, ARGS

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MOCK = open(os.path.join(ROOT, 'test', 'mockroom.js')).read()
RESULTS = []
def check(name, ok, info=''):
    RESULTS.append((name, bool(ok), info))
    print(('PASS ' if ok else 'FAIL ') + name + ('  ' + str(info) if info != '' else ''), flush=True)

def serve():
    h = functools.partial(http.server.SimpleHTTPRequestHandler, directory=os.path.join(ROOT, 'dist'))
    h.log_message = lambda *a: None
    srv = socketserver.TCPServer(('127.0.0.1', 0), h)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv

def st(p): return p.evaluate('BB.game.state')
def wait(fn, timeout=20):
    t0 = time.time()
    while time.time() - t0 < timeout:
        try:
            if fn(): return True
        except Exception: pass
        time.sleep(0.2)
    return False

def main():
    srv = serve()
    url = 'http://127.0.0.1:%d/index.html' % srv.server_address[1]
    with sync_playwright() as pw:
        b = pw.chromium.launch(args=ARGS)
        ctx = b.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True)
        ctx.add_init_script(MOCK)
        errs = []
        def mk():
            p = ctx.new_page()
            p.on('pageerror', lambda e: errs.append(str(e)))
            p.goto(url)
            p.wait_for_function('window.__BB_READY === true', timeout=30000)
            p.click('#btn-start'); p.wait_for_timeout(300)
            return p
        A, B = mk(), mk()
        check('menú muestra trofeos y botón DUELO', A.is_visible('#btn-pvp') and A.inner_text('#m-trophies') == '0')
        A.click('#btn-pvp'); B.click('#btn-pvp')
        check('lobby abre', st(A) == 'PVP_LOBBY' and A.is_visible('#s-pvp'))
        ok = wait(lambda: 'conectado' in A.inner_text('#pvp-net') and '1 jugador' in A.inner_text('#pvp-net'))
        check('presencia online: ve al otro jugador', ok, A.inner_text('#pvp-net'))
        check('ranking de la sala lista 2 jugadores', A.evaluate("document.querySelectorAll('#pvp-room .rk').length") == 2)
        A.screenshot(path=OUT + '/p1_lobby.png')
        # --- partida rápida ---
        A.click('#pvp-quick'); A.wait_for_timeout(300)
        check('buscando rival', A.is_visible('#s-search'))
        A.screenshot(path=OUT + '/p2_search.png')
        B.click('#pvp-quick')
        ok = wait(lambda: A.is_visible('#s-vs') and B.is_visible('#s-vs'), 10)
        check('emparejados -> pantalla VS', ok, (A.evaluate('BB.game.pvp.phase'), B.evaluate('BB.game.pvp.phase')))
        A.screenshot(path=OUT + '/p3_vs.png')
        ok = wait(lambda: st(A) == 'PVP' and st(B) == 'PVP', 8)
        check('duelo comienza en ambos', ok)
        check('misma semilla (mismos obstáculos y boosts)', A.evaluate('BB.game.pvp.seed') == B.evaluate('BB.game.pvp.seed'))
        A.wait_for_timeout(3500)
        check('obstáculos flotantes en el centro', A.evaluate('BB.game.meteors.items.filter(m=>m.alive && m.hover).length') > 0)
        # combate: posiciones espejadas y balas del rival
        A.evaluate('BB.game.player.targetX = 2')
        ok = wait(lambda: abs(B.evaluate('BB.game.pvp.rival.x') + 2) < 0.3, 5)
        check('B ve el cañón de A arriba, espejado', ok, B.evaluate('BB.game.pvp.rival.x'))
        check('cañón rival 3D visible', B.evaluate('BB.game.pvp.rivalNode.visible'))
        B.evaluate('BB.game.player.targetX = -2')
        ok = wait(lambda: B.evaluate('BB.game.bullets.eb.filter(b=>b.alive && b.pvp).length') > 0, 5)
        check('B recibe disparos simulados de A', ok)
        ok = wait(lambda: B.evaluate('BB.game.pvp.myHP') < 100, 12)
        check('las balas de A dañan a B', ok, B.evaluate('BB.game.pvp.myHP'))
        ok = wait(lambda: A.evaluate('BB.game.pvp.rival.hp') < 100, 5)
        check('A ve bajar la vida de B', ok, A.evaluate('BB.game.pvp.rival.hp'))
        B.screenshot(path=OUT + '/p4_match_B.png')
        A.screenshot(path=OUT + '/p4_match_A.png')
        # KO: B destruido
        B.evaluate('BB.game.boosts.consume("shield"); BB.game.pvp.myHP = 1; BB.game.pvp.damageMe(5)')
        ok = wait(lambda: st(A) == 'PVP_RESULT' and st(B) == 'PVP_RESULT', 8)
        check('KO termina el duelo en ambos', ok, (st(A), st(B)))
        A.wait_for_timeout(1300)
        ra, rb = A.evaluate('BB.game.pvp.result'), B.evaluate('BB.game.pvp.result')
        check('A gana / B pierde', ra['S'] == 1 and rb['S'] == 0, (ra, rb))
        check('trofeos: A sube, B no baja de 0', A.evaluate('BB.game.save.data.pvp.trophies') > 0 and B.evaluate('BB.game.save.data.pvp.trophies') == 0, (A.evaluate('BB.game.save.data.pvp.trophies'), B.evaluate('BB.game.save.data.pvp.trophies')))
        check('pantalla de resultado', A.is_visible('#s-pvpres') and 'VICTORIA' in A.inner_text('#pr-title') and 'DERROTA' in B.inner_text('#pr-title'))
        A.screenshot(path=OUT + '/p5_result_win.png'); B.screenshot(path=OUT + '/p5_result_loss.png')
        # revancha
        A.click('#res-rematch'); B.click('#res-rematch')
        ok = wait(lambda: st(A) == 'PVP' and st(B) == 'PVP', 10)
        check('revancha (ronda 2)', ok and A.evaluate('BB.game.pvp.round') == 2)
        A.wait_for_timeout(1500)
        check('ronda 2 no hereda el KO anterior', st(A) == 'PVP' and st(B) == 'PVP')
        # fin por tiempo
        A.evaluate('BB.game.boosts.activate("shield"); BB.game.pvp.myHP = 80; BB.game.pvp.matchT = 89.5'); B.evaluate('BB.game.boosts.activate("shield"); BB.game.pvp.myHP = 50; BB.game.pvp.matchT = 89.5')
        ok = wait(lambda: st(A) == 'PVP_RESULT' and st(B) == 'PVP_RESULT', 10)
        A.wait_for_timeout(600)
        ra, rb = A.evaluate('BB.game.pvp.result'), B.evaluate('BB.game.pvp.result')
        check('fin por tiempo: gana quien tiene más vida', ok and ra['S'] == 1 and rb['S'] == 0 and ra['reason'] == 'time', (ra and ra.get('reason'), rb and rb.get('S')))
        # sala con código
        A.click('#res-menu'); B.click('#res-menu')
        A.click('#btn-pvp'); B.click('#btn-pvp')
        A.click('#pvp-friend'); A.click('#pvp-create')
        code = A.inner_text('#search-codev')
        check('código de sala generado', len(code) == 4, code)
        A.screenshot(path=OUT + '/p6_code.png')
        B.click('#pvp-friend'); B.fill('#pvp-code-in', code.lower()); B.click('#pvp-join')
        ok = wait(lambda: st(A) == 'PVP' and st(B) == 'PVP', 12)
        check('duelo con amigo por código', ok)
        # abandono: B se va
        B.close()
        ok = wait(lambda: st(A) == 'PVP_RESULT', 15)
        A.wait_for_timeout(1200)
        check('rival desconectado -> victoria por abandono', ok and A.evaluate('BB.game.pvp.result.reason') == 'abandon')
        # IA
        A.click('#res-menu'); A.click('#btn-pvp'); A.click('#pvp-bot')
        ok = wait(lambda: st(A) == 'PVP', 8)
        check('entrenamiento vs IA', ok and A.evaluate('BB.game.pvp.mode') == 'bot')
        A.evaluate('BB.game.boosts.activate("shield")')
        A.wait_for_timeout(6000)
        check('la IA se mueve y dispara', A.evaluate('BB.game.bullets.eb.filter(b=>b.alive && b.pvp).length') > 0 or A.evaluate('BB.game.pvp.rival.recoil') > 0)
        A.evaluate('BB.game.pvp.bot.tx = BB.game.player.x; BB.game.pvp.bot.x = BB.game.player.x; BB.game.pvp.bot.thinkT = 99')
        ok = wait(lambda: A.evaluate('BB.game.pvp.bot.hp') < 100, 8)
        check('mis balas dañan a la IA', ok, A.evaluate('BB.game.pvp.bot.hp'))
        A.screenshot(path=OUT + '/p6b_bot_fight.png')
        trb = A.evaluate('BB.game.save.data.pvp.trophies')
        A.evaluate('BB.game.pvp.bot.hp = 0.5')
        ok = wait(lambda: st(A) == 'PVP_RESULT', 10)
        A.wait_for_timeout(1200)
        check('KO a la IA, sin trofeos', ok and A.evaluate('BB.game.pvp.result.S') == 1 and A.evaluate('BB.game.save.data.pvp.trophies') == trb)
        A.screenshot(path=OUT + '/p7_bot_result.png')
        # abandono voluntario (pausa)
        A.click('#res-rematch'); wait(lambda: st(A) == 'PVP', 8)
        A.click('#btn-pause'); A.wait_for_timeout(300)
        check('pausa vs IA congela', st(A) == 'PAUSED' and 'ABANDONAR' in A.inner_text('#btn-quit'))
        A.click('#btn-quit'); A.wait_for_timeout(500)
        check('abandonar vuelve al menú', st(A) == 'MENU')
        A.click('#btn-pvp'); A.wait_for_timeout(300)
        A.screenshot(path=OUT + '/p8_lobby_after.png')
        check('historial de duelos', A.evaluate("document.querySelectorAll('#pvp-hist .hs').length") >= 4)
        e = A.evaluate('BB.errors.map(e=>e.where+": "+e.msg.slice(0,160))')
        check('sin errores JS', not e and not errs, (e[:4], errs[:4]))
        b.close()
    srv.shutdown()
    fails = [r for r in RESULTS if not r[1]]
    print('\n%d/%d OK' % (len(RESULTS) - len(fails), len(RESULTS)))

if __name__ == '__main__':
    main()
