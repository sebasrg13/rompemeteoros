"""Prueba de humo: carga, menú, inicio de nivel, capturas. Uso: python3 test/smoke.py"""
import os, sys, json, time
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
URL = 'file://' + os.path.join(ROOT, 'dist', 'index.html')
OUT = os.path.join(ROOT, 'test', 'shots')
os.makedirs(OUT, exist_ok=True)
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"]

def launch(p, w=390, h=844, dpr=2, mobile=True):
    b = p.chromium.launch(args=ARGS)
    ctx = b.new_context(viewport={'width': w, 'height': h}, device_scale_factor=dpr, is_mobile=mobile, has_touch=mobile)
    pg = ctx.new_page()
    logs = []
    pg.on('console', lambda m: logs.append(m.type + ': ' + m.text))
    pg.on('pageerror', lambda e: logs.append('PAGEERROR: ' + str(e)))
    pg.goto(URL)
    return b, pg, logs

if __name__ == '__main__':
    with sync_playwright() as p:
        b, pg, logs = launch(p)
        pg.wait_for_function('window.__BB_READY === true', timeout=30000)
        pg.screenshot(path=OUT + '/01_loading.png')
        pg.click('#btn-start')
        pg.wait_for_timeout(1200)
        pg.screenshot(path=OUT + '/02_menu.png')
        pg.click('#btn-play')
        pg.wait_for_timeout(4500)
        pg.screenshot(path=OUT + '/03_game.png')
        print(json.dumps(pg.evaluate('({state: BB.game.state, errors: BB.errors.map(e=>e.where+": "+e.msg.slice(0,300)), m: BB.game.meteors.countAlive(), px: BB.game.lastPixel, calls: BB.game.renderer.stats})'), indent=1))
        print('\n'.join(logs[-30:]))
        b.close()
