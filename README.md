# Neon Drift // Protocol

A kinetic neon survival game built with Canvas 2D, Web Audio, and plain JavaScript—no libraries, build tools, images, or audio files.

## Objective

Collect signal cores to build a score multiplier while avoiding hunters. New waves arrive every 18 seconds. Phase-dashing grants brief invulnerability and destroys hunters on contact, but must recharge between uses.

## Controls

| Action | Keyboard | Touch |
| --- | --- | --- |
| Move | WASD or arrow keys | Virtual joystick |
| Phase dash | Shift or Space | Dash button |
| Pause | P | — |

The game also includes procedural sound, shield health, elite predictive enemies, escalating difficulty, screen shake, particle effects, responsive layouts, and a complete game-over loop.

## Run locally

```bash
python3 -m http.server 8080
```

Then open <http://localhost:8080>.

## License

[MIT](LICENSE)
