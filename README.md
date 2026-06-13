# Forza Horizon 6 — Japan 🏎️🌸

A browser-based, **Three.js** fan recreation of the *Forza Horizon 6* reveal-trailer
gameplay set in Japan. Drive a GT-R-Nismo-style coupe through a winding countryside
circuit lined with cherry blossoms, transmission pylons, a shinkansen viaduct, tulip
fields and forested mountains — complete with the trailer's signature HUD
(rev-counter speedometer, gear + MPH read-out, and the rotating radar minimap).

> Built from the reveal trailer + reference stills. This is an unofficial,
> non-commercial fan project and is **not affiliated with Microsoft, Xbox Game
> Studios or Playground Games**. "Forza" and "Horizon" are trademarks of their
> respective owners.

![in-game footage](https://img.shields.io/badge/IN--GAME-FOOTAGE-ff2ea0)

## ▶️ Run it

No build step. You just need a static file server (ES modules require `http://`,
not `file://`).

```bash
# Option A — bundled zero-dependency server (Node)
node server.js
# then open http://localhost:8080

# Option B — npm script (same thing)
npm start

# Option C — Python
python3 -m http.server 8080
```

Then open **http://localhost:8080** and press **DRIVE**.

> Fully self-contained / **works offline** — Three.js, the loaders and the car
> model are all vendored in `vendor/` and `assets/`. No CDN, no internet needed.

## 🎮 Controls

| Action | Keys |
| --- | --- |
| Accelerate | `W` / `↑` |
| Brake / Reverse | `S` / `↓` |
| Steer | `A` `D` / `←` `→` |
| Handbrake (drift) | `Space` |
| Cycle camera (chase / far / hood) | `C` |
| Reset to track | `R` |
| Mute engine | `M` |
| Hide HUD (photo mode) | `H` |

On touch devices, on-screen steering + pedal buttons appear automatically.

## ✨ What's recreated from the trailer

- **Third-person chase cam** with speed-based FOV, body roll/pitch and subtle shake.
- **A real 3D sports car** (Ferrari GLB) finished in gunmetal paint with a neutral
  studio environment map for convincing reflections — with a hand-built
  GT-R-Nismo-style coupe (quad round tail lights, rear wing) as an offline fallback.
- **Japanese countryside circuit**: asphalt with lane markings, guardrails,
  cherry-blossom + pine forest, **transmission pylons with catenary wires**, an
  elevated **shinkansen viaduct with a moving bullet train**, striped **tulip
  fields** and roadside greenhouses, all under a hazy mountain skyline.
- **Trailer HUD**: rev-counter dial (0–8k, redline + needle), centre **gear**
  indicator, big **MPH** read-out, LC/TCR/ABS aids, the rotating **radar minimap**
  with player arrow + "ANNA / LINK" bar, the `FORZA HORIZON 6` wordmark and the
  `IN-GAME FOOTAGE` caption.
- **Synthesized engine audio** whose pitch tracks RPM.
- **AI traffic** cruising the circuit (including the red sports car from the clip).

## 🧱 Project structure

```
index.html         # canvas, HUD overlay, loader, import map
server.js          # tiny static dev server (no dependencies)
assets/            # ferrari.glb car model
vendor/            # vendored three.js + GLTF/Draco loaders + RoomEnvironment
src/
  main.js          # bootstrap + game loop
  world.js         # renderer, sky, sun, fog, ground, clouds, mountains
  track.js         # spline circuit -> road, markings, guardrails, queries
  car.js           # player car model + arcade physics
  traffic.js       # AI cars
  scenery.js       # trees, pylons, viaduct + train, fields, buildings
  camera.js        # chase camera
  input.js         # keyboard + touch
  hud.js           # canvas speedometer + minimap
  audio.js         # synthesized engine
  util.js          # math + procedural-texture helpers
  style.css        # HUD / loader styling
```

## 🛠️ Tech

Vanilla JavaScript (ES modules) + [Three.js](https://threejs.org) `r160` (vendored).
No framework, no bundler. The world, scenery, HUD and all textures are generated
procedurally at runtime; the player car is a GLB model loaded with `GLTFLoader` +
`DRACOLoader` over a `RoomEnvironment` IBL.

`three` and `playwright` in `devDependencies` are only used by the headless tests:

```bash
node test/smoke.mjs     # physics / geometry logic (no browser needed)
node test/browser.mjs   # real headless-Chromium render + screenshots (needs the server running)
```

## 🙏 Credits

- **3D car model** — `ferrari.glb` from the [three.js](https://github.com/mrdoob/three.js)
  examples (`examples/models/gltf/`); see the three.js repository for its asset license.
- **Three.js** — © three.js authors, MIT License.
- Reference: the *Forza Horizon 6* reveal trailer + stills. Unofficial,
  non-commercial fan project; all trademarks belong to their respective owners.
