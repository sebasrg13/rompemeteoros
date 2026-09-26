#!/usr/bin/env python3
"""Empaqueta el proyecto en un único HTML (standalone y versión Artifact)."""
import os, re, sys

ROOT = os.path.dirname(os.path.abspath(__file__))
ORDER = [
    'core/namespace.js',
    'engine/math.js', 'engine/Scene.js', 'engine/Geometry.js', 'engine/Shaders.js', 'engine/Renderer.js', 'engine/Textures.js',
    'entities/Models.js',
    'game/World.js',
    'systems/Particles.js',
    'entities/Bullet.js', 'entities/Player.js', 'entities/Meteor.js', 'entities/Alien.js', 'entities/MiniShip.js', 'entities/PowerUp.js', 'entities/Boss.js',
    'systems/CollisionSystem.js',
    'managers/LevelManager.js', 'managers/AudioManager.js', 'managers/StorageManager.js', 'managers/ShopManager.js',
    'managers/PerformanceManager.js', 'managers/UIManager.js',
    'net/NetManager.js', 'managers/PvPManager.js', 'managers/CupManager.js', 'managers/RankManager.js', 'systems/Arsenal.js',     'game/Game.js',
    'main.js',
]

def main():
    src = os.path.join(ROOT, 'src')
    js = []
    for f in ORDER:
        with open(os.path.join(src, f), encoding='utf-8') as fh:
            code = fh.read()
        if '</script' in code:
            sys.exit('</script> encontrado en ' + f)
        js.append('/* ===== %s ===== */\n%s' % (f, code))
    js = '\n'.join(js)
    with open(os.path.join(src, 'index.template.html'), encoding='utf-8') as fh:
        tpl = fh.read()
    m = re.search(r'<!--HEAD-->(.*?)<!--/HEAD-->', tpl, re.S)
    head, body = m.group(1).strip(), tpl[m.end():].strip()
    script = '<script>\n' + js + '\n</script>'
    os.makedirs(os.path.join(ROOT, 'dist'), exist_ok=True)
    standalone = ('<!DOCTYPE html>\n<html lang="es">\n<head>\n<meta charset="utf-8">\n'
                  '<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover">\n'
                  '<meta name="theme-color" content="#070a1f">\n<meta name="apple-mobile-web-app-capable" content="yes">\n'
                  '<meta name="mobile-web-app-capable" content="yes">\n<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">\n'
                  + head + '\n</head>\n<body>\n' + body + '\n' + script + '\n</body>\n</html>\n')
    artifact = head + '\n' + body + '\n' + script + '\n'
    with open(os.path.join(ROOT, 'dist', 'index.html'), 'w', encoding='utf-8') as fh:
        fh.write(standalone)
    with open(os.path.join(ROOT, 'dist', 'artifact.html'), 'w', encoding='utf-8') as fh:
        fh.write(artifact)
    print('OK', len(standalone) // 1024, 'KB')

if __name__ == '__main__':
    main()
