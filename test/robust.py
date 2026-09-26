"""Robustez: pérdida de contexto WebGL, localStorage bloqueado, errores inyectados, WebGL ausente."""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))
from smoke import *
with sync_playwright() as p:
    # 1) pérdida y recuperación de contexto
    b, pg, logs = launch(p, 393, 852, 1)
    pg.wait_for_function('window.__BB_READY === true', timeout=30000)
    pg.click('#btn-start'); pg.wait_for_timeout(300)
    pg.evaluate('BB.game.startRun(5); BB.game.shields=99')
    pg.wait_for_timeout(3000)
    pg.evaluate("window.__ext = BB.game.renderer.gl.getExtension('WEBGL_lose_context'); __ext.loseContext()")
    pg.wait_for_timeout(800)
    print('lost ->', pg.evaluate('({lost:BB.game.renderer.lost, state:BB.game.state, recov:!document.getElementById("recov").hidden})'))
    pg.evaluate("__ext.restoreContext()")
    pg.wait_for_timeout(1500)
    pg.evaluate("BB.game.resume()")
    pg.wait_for_timeout(2500)
    px = pg.evaluate('BB.game.renderer.samplePixel(BB.game.renderer.width*0.1, BB.game.renderer.height*0.5)')
    print('restored ->', pg.evaluate('({lost:BB.game.renderer.lost, state:BB.game.state, calls:BB.game.renderer.stats.calls})'), 'pixel', px)
    pg.screenshot(path=OUT + '/r_restored.png')
    # 2) excepción inyectada en una entidad: el loop sigue
    pg.evaluate("BB.game.aliens.items[0].update = function(){ throw new Error('boom') }; BB.game.aliens.items[0].alive = true")
    pg.wait_for_timeout(1500)
    f0 = pg.evaluate('BB.game.frames')
    pg.wait_for_timeout(1000)
    print('loop sigue tras excepción:', pg.evaluate('BB.game.frames') > f0, 'errores:', pg.evaluate('BB.errors.length'))
    b.close()
    # 3) localStorage bloqueado
    bb = p.chromium.launch(args=ARGS)
    ctx = bb.new_context(viewport={'width': 390, 'height': 844})
    ctx.add_init_script("Object.defineProperty(window,'localStorage',{get(){throw new Error('blocked')}})")
    pg = ctx.new_page(); pg.goto(URL)
    pg.wait_for_function('window.__BB_READY === true', timeout=30000)
    pg.click('#btn-start'); pg.wait_for_timeout(300); pg.click('#btn-play'); pg.wait_for_timeout(2000)
    print('sin localStorage:', pg.evaluate('({state:BB.game.state, avail:BB.game.save.available})'))
    bb.close()
    # 4) sin WebGL
    bb = p.chromium.launch(args=["--disable-webgl", "--disable-3d-apis"])
    pg = bb.new_page(); pg.goto(URL); pg.wait_for_timeout(1500)
    print('sin WebGL -> pantalla de error visible:', pg.evaluate("!document.getElementById('s-error').hidden"), pg.inner_text('#err-title'))
    pg.screenshot(path=OUT + '/r_nowebgl.png')
    bb.close()
