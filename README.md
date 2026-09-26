# Rompemeteoros — Cobrá o arriesgá

Arcade shooter vertical 3D para móviles (iPhone / Android) y PC. HTML5 + JavaScript + WebGL, sin dependencias externas.

## App de Android con actualizador

Ver **GUIA-ANDROID.md**: APK instalable, actualizaciones del juego al instante (sin reinstalar) y publicación automática con GitHub Actions + GitHub Pages. Código de la app en `android/`, flujo en `.github/workflows/android.yml`.

## Jugar

- Abrí `dist/index.html` en el navegador (funciona sin servidor y sin internet; con internet carga las tipografías).
- Para publicarlo en la web, subí solo `dist/index.html` a cualquier hosting estático (GitHub Pages, Netlify, Vercel…).

## Compilar

```
python3 build.py        # une src/ en dist/index.html y dist/artifact.html
```

## Pruebas automáticas

Requieren Python + Playwright con Chromium.

```
python3 test/arsenal.py  # arsenal, campaña sin pagos y ranking por ubicación
python3 test/cup.py      # copa semanal: ML, mejoras, niveles de 6 s, 3 partidas, cuenta la última, ranking
python3 test/bag.py      # bolsa en riesgo: cobrar, perder, abandonar, recuperar
python3 test/full.py     # flujo completo: menú, control táctil, disparo, colisiones, monedas, boosts,
                         # mini naves, fin de nivel, SIGUIENTE NIVEL, bosses 5/10/15/20/25, pausa,
                         # game over, tienda, guardado
python3 test/robust.py   # pérdida de contexto WebGL, localStorage bloqueado, excepciones, sin WebGL
python3 test/visual.py   # capturas en iPhone SE / Pro / Pro Max, tablet, PC y horizontal
```

## Bolsa en riesgo (campaña)

- Todas las monedas que ganás en la campaña van a una **bolsa**, no a la billetera.
- Al terminar cada nivel elegís **SIGUIENTE NIVEL** (seguís arriesgando y el multiplicador sube +0.15 por nivel, +0.5 por boss, hasta x5) o **COBRAR** (bolsa × multiplicador pasa a la billetera y volvés al menú).
- Si perdés o abandonás la partida, la bolsa se pierde entera. Lo cobrado antes está a salvo.
- Si la app se cierra en la pantalla de nivel completado, la bolsa se cobra sola al volver.
- **Ciclos:** cobrar o perder te devuelve al nivel 1 y sube el ciclo (si superaste al menos un nivel). Cada ciclo: +25% de meteoros (más monedas), +20% de monedas por enemigo y por nivel, +8% de vida en enemigos y bosses, y un poco más de ritmo. Tope: ciclo 10.
- **Atajo:** si ya venciste un boss, en el menú podés elegir arrancar después del último boss vencido, con el multiplicador en x0.8.
- Prueba: `python3 test/bag.py`.

## Arsenal (armas especiales)

- 16 armas en 4 tipos: **ofensiva** (Misil Nova, Lluvia de Plasma, Rayo Perforante, Enjambre Kamikaze, Sobrecarga), **control** (Misil Criogénico, Pulso Gravitacional, Agujero Negro de Bolsillo, Pulso EMP, Tiempo Bala), **defensa** (Domo de Energía, Casco Espejo, Reparación, Salto Cuántico) y **economía** (Imán Galáctico, Saqueo).
- Cada jugador arma un **set de 3** (hay 3 sets guardados). En partida aparecen como 3 botones a la derecha (teclas 1, 2 y 3 en PC).
- Cada arma se usa **1 vez por tramo**; al vencer al boss se recargan las 3. Funcionan en la campaña y en la copa, no en el duelo.
- Lo congelado recibe +50% de daño (combina con las ofensivas). El daño escala con el nivel del arma (1 a 5) y con la vida de los enemigos del nivel.
- 4 gratis (una por tipo); el resto se compra y se mejora **solo con monedas del juego**.
- Prueba: `python3 test/arsenal.py`.

## Campaña sin pagos

- La campaña (tienda y arsenal) se mejora **solo con monedas del juego**. Las Monedas Lunares (dinero real) sirven únicamente para la nave de la Copa Semanal.

## Ranking de campaña

- Top 100 **global, continente, país y ciudad** con el mejor puntaje de un recorrido (se sube al cobrar o perder, si es tu récord), más tu puesto aunque estés afuera del top.
- El país se sugiere por la zona horaria del dispositivo; el jugador confirma país y ciudad (lista o "Otra ciudad"). Se puede cambiar una vez cada 30 días; al cambiar se borran tus entradas anteriores.
- Datos en la db del artifact: `rk/g/s`, `rk/c-<continente>/s`, `rk/p-<país>/s`, `rk/y-<país>-<ciudad>/s`.

## Copa Semanal (ranking con premios)

- Modo aparte de la campaña, con **nave de copa propia**: todos arrancan igual y las mejoras de campaña no cuentan.
- La nave de copa solo se mejora con **Monedas Lunares (ML)**, que se compran con dinero real: 1 USD = 300 ML (paquetes de USD 1, 3, 5, 10 y 20). Potencia arranca en 120 ML y Cadencia en 140 ML.
- **Niveles de 6 segundos:** un contador va de 1 a 6 y arranca el nivel siguiente, más difícil, sin limpiar la pantalla. Cada 5 niveles aparece un BOSS: el contador se frena hasta vencerlo (da muchos puntos y +1 escudo).
- **3 partidas por día** (se renuevan a las 00:00, hora de Argentina). **En el ranking queda la ÚLTIMA partida**, aunque sea menor: antes de volver a jugar el juego te avisa y podés plantarte. La partida se descuenta al empezar; si se cierra el juego a mitad, queda 0.
- Todos juegan los mismos niveles (semilla semanal) y un modificador de la semana (Lluvia densa, Invasión, Gravedad alta o Rocas blindadas).
- Ranking semanal compartido en la base de datos del artifact (`cup/<lunes>/scores/<usuario>`). Premios: 1.º USD 40, 2.º USD 25, 3.º USD 10. Cierra el domingo 23:59.
- Configuración en `BB.CUP` (`src/managers/CupManager.js`). Con `live: false` los pagos son de prueba (no se cobra nada) y los premios figuran como no activos.
- **Para lanzar con dinero real hace falta:** procesador de pagos (Mercado Pago / Stripe o la tienda de Play / App Store) que acredite las ML desde un servidor, ranking validado en servidor (hoy el puntaje lo calcula el dispositivo), verificación de identidad para cobrar, y revisión legal de las bases.
- Prueba: `python3 test/cup.py`.

## Duelo 1 vs 1 (PvP)

- Combate directo: vos abajo, el rival arriba (espejado). 100% de vida cada uno, 90 segundos, meteoritos flotantes como cobertura y boosts idénticos para ambos (misma semilla).
- Online dentro de claude.ai usando la *room* del artifact: todo el protocolo viaja en *presence* (funciona incluso con acceso de solo lectura). Partida rápida o sala con código de 4 letras; revancha; victoria por abandono si el rival se desconecta.
- Cada jugador es autoridad de su propia vida: simula las balas del rival con los parámetros que este publica (posición, cadencia, multi, daño).
- Trofeos estilo Elo (K=40) y 7 ligas con recompensa al ascender. Modo entrenamiento contra IA sin trofeos.
- Prueba: `python3 test/pvp.py` (dos jugadores reales en dos pestañas sobre una room simulada).

## Arquitectura (`src/`)

| Módulo | Archivo |
|---|---|
| Game Engine (estados, bucle, entrada, flujo) | `game/Game.js` |
| Escena 3D, cámara, luces | `game/World.js` |
| Renderizador WebGL propio | `engine/Renderer.js`, `engine/Shaders.js`, `engine/Scene.js`, `engine/math.js` |
| Geometrías y texturas procedurales | `engine/Geometry.js`, `engine/Textures.js`, `entities/Models.js` |
| Player | `entities/Player.js` |
| Meteor | `entities/Meteor.js` |
| Alien | `entities/Alien.js` |
| Boss (5 bosses con fases) | `entities/Boss.js` |
| Bullet | `entities/Bullet.js` |
| MiniShip | `entities/MiniShip.js` |
| PowerUp y monedas | `entities/PowerUp.js` |
| Particles | `systems/Particles.js` |
| Collision System | `systems/CollisionSystem.js` |
| Level Manager + spawn | `managers/LevelManager.js` |
| Audio Manager | `managers/AudioManager.js` |
| UI Manager | `managers/UIManager.js` |
| Storage Manager | `managers/StorageManager.js` |
| Shop Manager | `managers/ShopManager.js` |
| Performance Manager | `managers/PerformanceManager.js` |
| Red en tiempo real | `net/NetManager.js` |
| Duelo PvP, trofeos y ligas | `managers/PvPManager.js` |
| Copa Semanal, Monedas Lunares y ranking | `managers/CupManager.js` |
| Ranking global / continente / país / ciudad | `managers/RankManager.js` |
| Arsenal de armas especiales | `systems/Arsenal.js` |
| Arranque seguro | `main.js` |

Estados: `LOADING, MENU, PLAYING, PAUSED, LEVEL_COMPLETE, BOSS_INTRO, BOSS_FIGHT, GAME_OVER, SHOP`.

### Protección contra pantalla negra

- Detección de WebGL2 → WebGL1 → experimental-webgl, con reintentos sin antialias/stencil.
- Shaders con versión simplificada de respaldo si un dispositivo no compila la completa.
- Pérdida de contexto: pausa automática, aviso visible y re-subida de todos los recursos al recuperarlo.
- Cada sistema se actualiza dentro de su propio `try/catch`; una excepción no detiene el bucle.
- Muestreo de píxeles tras el arranque: si la escena sale negra, baja la calidad y, si persiste, muestra un mensaje con REINTENTAR.
- El fondo HTML nunca es negro puro y siempre hay una pantalla visible (carga, menú, juego o error).

### Rendimiento móvil

Pooling de todos los objetos, instancing para balas y monedas, lotes de sprites para partículas, 4 luces dinámicas fijas, sombras planas proyectadas (sin shadow maps), frustum culling y calidad adaptativa (resolución interna → sombras → partículas) según los FPS medidos.
