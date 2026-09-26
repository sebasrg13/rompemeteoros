#!/usr/bin/env python3
"""Arma la carpeta site/ que se publica en GitHub Pages:
   site/index.html       página de descarga
   site/game/index.html  el juego (lo que baja el actualizador)
   site/rompemeteoros.apk
   site/version.json     lo que consulta la app para saber si hay algo nuevo
Uso: python3 tools/make_site.py <versionJuego> <urlBase> [apk]"""
import json, os, shutil, sys, time, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
game_v = int(sys.argv[1]); base = sys.argv[2]
apk = sys.argv[3] if len(sys.argv) > 3 else None
site = os.path.join(ROOT, 'site')
os.makedirs(os.path.join(site, 'game'), exist_ok=True)
shutil.copy(os.path.join(ROOT, 'dist', 'index.html'), os.path.join(site, 'game', 'index.html'))
vp = {}
for line in open(os.path.join(ROOT, 'android', 'app', 'version.properties'), encoding='utf-8'):
    m = re.match(r'\s*(\w+)\s*=\s*(.+)', line)
    if m: vp[m.group(1)] = m.group(2).strip()
if apk and os.path.exists(apk): shutil.copy(apk, os.path.join(site, 'rompemeteoros.apk'))
notes_path = os.path.join(ROOT, 'NOVEDADES.txt')
notes = open(notes_path, encoding='utf-8').read().strip() if os.path.exists(notes_path) else ''
info = {
    'game': game_v, 'gameUrl': 'game/index.html',
    'apk': int(vp.get('versionCode', 1)), 'apkName': vp.get('versionName', '1.0'), 'apkUrl': 'rompemeteoros.apk',
    'notes': notes[:400], 'date': time.strftime('%Y-%m-%d %H:%M UTC', time.gmtime()),
}
json.dump(info, open(os.path.join(site, 'version.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
tpl = open(os.path.join(ROOT, 'web', 'index.html'), encoding='utf-8').read()
for k, v in (('{{APP}}', info['apkName']), ('{{GAME}}', str(game_v)), ('{{DATE}}', info['date']), ('{{NOTES}}', notes.replace('<', '&lt;'))):
    tpl = tpl.replace(k, v)
open(os.path.join(site, 'index.html'), 'w', encoding='utf-8').write(tpl)
open(os.path.join(site, '.nojekyll'), 'w').close()
print('site listo:', info)
