"""Capturas en varios dispositivos. Uso: python3 test/visual.py"""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))
from smoke import *
DEV = [('se', 320, 568, True), ('pro', 393, 852, True), ('promax', 430, 932, True), ('tablet', 820, 1180, True), ('desktop', 1366, 768, False), ('landphone', 844, 390, True)]
with sync_playwright() as p:
    for name, w, h, mob in DEV:
        b, pg, logs = launch(p, w, h, 1, mob)
        pg.wait_for_function('window.__BB_READY === true', timeout=30000)
        pg.click('#btn-start'); pg.wait_for_timeout(700)
        pg.screenshot(path=f'{OUT}/v_{name}_menu.png')
        pg.evaluate('BB.game.startRun(3); BB.game.shields=99')
        pg.wait_for_timeout(6000)
        pg.screenshot(path=f'{OUT}/v_{name}_game.png')
        if name == 'pro':
            for L in (5, 25):
                pg.evaluate(f'BB.game.startLevel({L}); BB.game.shields=99')
                pg.wait_for_timeout(7000)
                pg.screenshot(path=f'{OUT}/v_boss{L}.png')
            pg.evaluate('BB.game.toMenu()'); pg.wait_for_timeout(300)
            pg.click('#btn-shop'); pg.wait_for_timeout(1500)
            pg.screenshot(path=f'{OUT}/v_shop.png')
        print(name, pg.evaluate('BB.errors.length'), [l for l in logs if 'PAGEERROR' in l][:3])
        b.close()
