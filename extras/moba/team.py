"""Prueba del ASALTO 5 VS 5: práctica con IA y partida online con 3 humanos (+7 bots) sobre room simulada.
Uso: python3 test/team.py"""
import os, sys, time
from playwright.sync_api import sync_playwright
sys.path.insert(0, os.path.dirname(__file__))
from smoke import OUT, ARGS
from pvp import serve, MOCK, wait, st

RESULTS = []
def check(name, ok, info=''):
    RESULTS.append((name, bool(ok), info))
    print(('PASS ' if ok else 'FAIL ') + name + ('  ' + str(info) if info != '' else ''), flush=True)

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
        # ---------- práctica ----------
        A = mk()
        A.click('#btn-team')
        check('lobby 5v5', st(A) == 'TEAM_LOBBY' and A.is_visible('#s-team'))
        A.click('[data-role="top"]')
        check('elegir rol TOP', A.evaluate('BB.game.team.role') == 'top')
        check('5 roles en el lobby', A.evaluate("document.querySelectorAll('#team-roles .rolecard').length") == 5)
        A.screenshot(path=OUT + '/t1_lobby.png')
        A.click('#team-solo')
        ok = wait(lambda: A.is_visible('#s-tvs'), 5)
        check('pantalla de equipos', ok)
        A.screenshot(path=OUT + '/t2_vs.png')
        ok = wait(lambda: st(A) == 'TEAM', 8)
        check('partida 5v5 comienza', ok)
        info = A.evaluate('({n:BB.game.team.units.length, t0:BB.game.team.units.filter(u=>u.team===0).length, roles:BB.game.team.units.map(u=>u.team+u.role[0]).join(","), hw:BB.ARENA.halfW})')
        check('10 unidades, 5 por equipo, arena ancha', info['n'] == 10 and info['t0'] == 5 and info['hw'] > 7, info)
        check('cada equipo: top, jungla, mid, adc y support', A.evaluate("[0,1].every(t=>['top','jungle','mid','adc','support'].every(r=>BB.game.team.units.filter(u=>u.team===t&&u.role===r).length===1))"))
        check('3 torretas por equipo', A.evaluate('BB.game.team.towers.flat().filter(t=>t.alive).length') == 6)
        check('monstruos de jungla (roja y azul)', A.evaluate('BB.game.team.camps[0].alive && BB.game.team.camps[1].alive && !BB.game.team.camps[2].alive'))
        ok = wait(lambda: A.evaluate('new Set(BB.game.team.drones.filter(d=>d.alive).map(d=>d.lane+"-"+d.team)).size') == 6, 20)
        check('oleadas de drones en los 3 carriles', ok, A.evaluate('BB.game.team.drones.length'))
        q1 = A.evaluate("BB.game.team.units.filter(u=>!u.me).map(u=>u.x)")
        A.wait_for_timeout(1500)
        q2 = A.evaluate("BB.game.team.units.filter(u=>!u.me).map(u=>u.x)")
        check('los bots se mueven', sum(1 for a, b in zip(q1, q2) if abs(a - b) > 0.1) >= 4, (q1, q2))
        check('disparos de ambos equipos', A.evaluate("(()=>{const e=BB.game.bullets.eb.filter(b=>b.alive&&b.tmTeam!==undefined); return e.some(b=>b.vy>0)&&e.some(b=>b.vy<0)})()"))
        A.evaluate('(()=>{const T=BB.game.team; if(!T.me.alive) T.respawnMe(); T.me.hp=T.me.max; T.me.shieldT=6; T.myAb.cd=0; T.useAbility()})()')
        A.wait_for_timeout(300)
        check('habilidad del tanque: muro', A.evaluate('BB.game.team.activeWalls().some(w=>w.mine)') and A.evaluate('BB.game.team.walls.some(n=>n.visible)'))
        A.wait_for_timeout(8000)
        A.screenshot(path=OUT + '/t3_match.png')
        s = A.evaluate('({c:BB.game.team.core, st:BB.game.team.stats, dead:BB.game.team.units.filter(u=>!u.alive).length})')
        check('combate produce daño (núcleos/unidades)', s['c'][0] < 1500 or s['c'][1] < 1500 or s['dead'] > 0 or s['st']['dealt'] > 0, s)
        check('muro bloqueó balas', s['st']['blocked'] > 0, s['st'])
        # muerte y reaparición
        A.evaluate('BB.game.boosts.consume("shield"); BB.game.team.me.shieldT=0; BB.game.team.me.hp=1; BB.game.team.damageMe(10)')
        check('muerte propia -> contador de reaparición', A.is_visible('#t-resp') and not A.evaluate('BB.game.team.me.alive'))
        A.evaluate('BB.game.team.me.respawnT = 0.2')
        ok = wait(lambda: A.evaluate('BB.game.team.me.alive'), 4)
        check('reaparece', ok)
        A.wait_for_timeout(9000)
        check('drones avanzan y pelean', A.evaluate('BB.game.team.drones.some(d=>d.d>3)'), A.evaluate('BB.game.team.drones.map(d=>d.d.toFixed(1)).slice(0,6)'))
        et = A.evaluate('1-BB.game.team.myTeam')
        check('núcleo enemigo protegido con torretas en pie', not A.evaluate('BB.game.team.vulnerable(1-BB.game.team.myTeam)'))
        A.evaluate('(()=>{const T=BB.game.team; T.camps[0].alive=true; T.camps[0].hp=T.camps[0].max; T.buffs.red={team:-1,t:0}; T.killCamp(0, T.myTeam)})()')
        check('matar la Nebulosa Roja da +30% daño al equipo', A.evaluate('BB.game.team.teamDmg(BB.game.team.myTeam)') > 1.25 and not A.evaluate('BB.game.team.camps[0].alive'))
        A.evaluate('BB.game.team.killTower(1-BB.game.team.myTeam, 1)')
        A.wait_for_timeout(500)
        check('romper una torreta expone el núcleo', A.evaluate('BB.game.team.vulnerable(1-BB.game.team.myTeam)') and 'EXPUESTO' in A.inner_text('#t-tw1'))
        A.screenshot(path=OUT + '/t3b_moba.png')
        A.evaluate('BB.game.team.core[1-BB.game.team.myTeam] = 0')
        ok = wait(lambda: st(A) == 'TEAM_RESULT', 8)
        A.wait_for_timeout(1300)
        check('núcleo enemigo destruido -> VICTORIA', ok and 'VICTORIA' in A.inner_text('#tr-title'))
        A.screenshot(path=OUT + '/t4_result.png')
        A.click('#tr-menu'); A.wait_for_timeout(400)
        check('vuelve al menú y arena normal', st(A) == 'MENU' and A.evaluate('BB.ARENA.halfW') < 5)

        # ---------- online: 3 humanos ----------
        B, Cc = mk(), mk()
        for p, role in ((A, 'adc'), (B, 'support'), (Cc, 'top')):
            p.click('#btn-team'); p.click('[data-role="%s"]' % role)
        wait(lambda: '2 jugadores' in A.inner_text('#team-net'), 8)
        A.click('#team-quick'); A.wait_for_timeout(200); B.click('#team-quick'); B.wait_for_timeout(200); Cc.click('#team-quick')
        A.wait_for_timeout(1500)
        A.screenshot(path=OUT + '/t5_queue.png')
        check('cola muestra 3 jugadores', A.evaluate("document.querySelectorAll('#t-qlist .qrow').length") == 3)
        ok = wait(lambda: all(st(p) == 'TEAM' for p in (A, B, Cc)), 25)
        check('anfitrión arma la partida con los 3 + 7 IA', ok, [st(p) for p in (A, B, Cc)])
        mids = [p.evaluate('BB.game.team.mid') for p in (A, B, Cc)]
        check('mismo partido en los 3', len(set(mids)) == 1, mids)
        teams = {k: p.evaluate('BB.game.team.myTeam') for k, p in (('A', A), ('B', B), ('C', Cc))}
        print('equipos', teams)
        A.wait_for_timeout(3000)
        # posiciones espejadas entre rivales / iguales entre aliados
        A.evaluate('BB.game.player.targetX = 3')
        def xs(viewer, who_id):
            return viewer.evaluate('(id)=>{const u=BB.game.team.units.find(u=>u.id===id); return u? u.x : null}', who_id)
        a_id = A.evaluate('BB.game.team.myId')
        ok = wait(lambda: abs(abs(xs(B, a_id)) - 3) < 0.4, 6)
        exp = 3 if teams['A'] == teams['B'] else -3
        check('B ve a A en la posición correcta (espejada si es rival)', ok and abs(xs(B, a_id) - exp) < 0.5, xs(B, a_id))
        q1 = B.evaluate("BB.game.team.units.filter(u=>!u.human).map(u=>u.x.toFixed(2)).join()")
        B.wait_for_timeout(2500)
        q2 = B.evaluate("BB.game.team.units.filter(u=>!u.human).map(u=>u.x.toFixed(2)).join()")
        check('los no anfitriones ven moverse a los bots', q1 != q2)
        check('el mundo (drones/torretas) llega a los no anfitriones', wait(lambda: B.evaluate('BB.game.team.drones.filter(d=>d.alive).length') > 0, 20))
        # curación: B (support) cura a un aliado humano herido
        ally = None
        for k, p in (('A', A), ('C', Cc)):
            if teams[k] == teams['B']: ally = p
        if ally:
            ally.evaluate('BB.game.team.me.hp = 20; BB.game.team.me.shieldT = 30; BB.game.player.targetX = 0')
            B.evaluate('BB.game.player.targetX = 0')
            ok = wait(lambda: ally.evaluate('BB.game.team.me.hp') > 26, 10)
            check('el support cura a su aliado (autoridad del curado)', ok, ally.evaluate('BB.game.team.me.hp'))
        # perforante de A (adc) sobre un rival humano en su columna
        enemy = next((p for k, p in (('B', B), ('C', Cc)) if teams[k] != teams['A']), None)
        if enemy:
            enemy.evaluate('BB.game.team.me.shieldT = 0; BB.game.boosts.consume("shield")')
            A.evaluate('BB.game.player.targetX = 0'); enemy.evaluate('BB.game.player.targetX = 0')
            A.wait_for_timeout(1500)
            hp0 = enemy.evaluate('BB.game.team.me.hp')
            A.evaluate('BB.game.team.myAb.cd = 0; BB.game.team.useAbility()')
            ok = wait(lambda: enemy.evaluate('BB.game.team.me.hp') <= hp0 - 20 or not enemy.evaluate('BB.game.team.me.alive'), 5)
            check('rayo perforante del ADC daña al rival en su columna', ok, (hp0, enemy.evaluate('BB.game.team.me.hp')))
        B.screenshot(path=OUT + '/t6_online_B.png')
        # núcleos sincronizados
        A.wait_for_timeout(2000)
        ca = A.evaluate('BB.game.team.core'); cb = B.evaluate('BB.game.team.core')
        check('núcleos sincronizados entre clientes', abs(ca[0] - cb[0]) < 60 and abs(ca[1] - cb[1]) < 60, (ca, cb))
        # migración de anfitrión
        host_before = A.evaluate('BB.game.team.hostUnit().id')
        A.close()
        B.wait_for_timeout(6000)
        hb = B.evaluate('BB.game.team.hostUnit().id'); hc = Cc.evaluate('BB.game.team.hostUnit().id')
        check('si se va el anfitrión, otro toma los bots', hb == hc and hb != host_before, (host_before, hb, hc))
        pos1 = B.evaluate("BB.game.team.units.filter(u=>!u.human).map(u=>u.x.toFixed(1)).join()")
        B.wait_for_timeout(2500)
        pos2 = B.evaluate("BB.game.team.units.filter(u=>!u.human).map(u=>u.x.toFixed(1)).join()")
        check('los bots siguen activos tras la migración', pos1 != pos2)
        # fin por núcleo (el capitán del equipo decide)
        tB = teams['B']
        cap = B if B.evaluate('BB.game.team.amHost()') else Cc
        cap.evaluate('BB.game.team.core[%d] = 0' % tB)
        ok = wait(lambda: st(B) == 'TEAM_RESULT' and st(Cc) == 'TEAM_RESULT', 25)
        B.wait_for_timeout(1300)
        rb, rc = B.evaluate('BB.game.team.result.S'), Cc.evaluate('BB.game.team.result.S')
        exp_c = 0 if teams['C'] == tB else 1
        check('resultado coherente en ambos clientes', ok and rb == 0 and rc == exp_c, (rb, rc))
        B.screenshot(path=OUT + '/t7_result_online.png')
        e = B.evaluate('BB.errors.map(e=>e.where+": "+e.msg.slice(0,160))') + Cc.evaluate('BB.errors.map(e=>e.where+": "+e.msg.slice(0,160))')
        check('sin errores JS', not e and not errs, (e[:4], errs[:4]))
        b.close()
    srv.shutdown()
    fails = [r for r in RESULTS if not r[1]]
    print('\n%d/%d OK' % (len(RESULTS) - len(fails), len(RESULTS)))

if __name__ == '__main__':
    main()
