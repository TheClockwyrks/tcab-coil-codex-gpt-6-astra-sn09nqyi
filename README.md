# Coil

A complete browser arcade game: steer a luminous pixel serpent around a bordered grid, eat amber pellets, and route efficiently to keep a scoring combo alive. The multiplier climbs to x5, then drops to x1 when its 3.5-second window expires. Walls and your own body end the round. Your best score lasts for the session.

## Run

Requires Node.js 22.12+ and npm.

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite. No backend, credentials, or network services are needed to play.

```sh
npm run build
npm run preview
```

`dist/` is the complete static site. Serve it at a host's root or under a subdirectory. Asset URLs are page-relative. `public/assets` is a repository symlink to the committed `assets/` directory; Vite copies those files into the production bundle. Preserve symlinks when checking out the source.

## Controls

| Action | Keys |
| --- | --- |
| Steer / navigate menus | Arrow keys or WASD |
| Confirm | Enter or Space |
| Back / pause | Escape |
| Pause / resume | P |
| Mute / unmute | M |
| Debug overlay | Backtick |

Menus also accept mouse and touch. Touchscreen devices receive the engine's directional controls. Sound unlocks after the first interaction. The pause menu freezes movement, combo time, and bite animation while the music continues.

## Assets

All seven transparent 32×32 snake sprites and all four WAV files are original, committed assets. Body, corner and tail were rendered with `draw`; the four head poses with `draw-sheet`; the event cues with `sfx-synth`; and the eight-bar music loop with `music`. `tools/produce-assets.py` preserves their one-time authorship recipe. It requires those creation tools, but **neither building nor playing runs it**. The game loads the finished PNG and WAV files through Simple 2D's asset loader and cue bus.

The board, menus, amber pellets and deterministic eat sparks are canvas drawings. The snake always uses its produced sprites, with native-size quarter-turn rotations and nearest-neighbor sampling.

## Verification and structure

```sh
npm run typecheck
npm run lint
npm run format
npm test
node tools/check-browser.mjs # after npm run build
```

The tests run the actual game through Simple 2D, using a real canvas and PNG decoder with scripted clocks. Browser audio transport is adapted in the Node test host. They cover timing, turn buffering, scoring, collisions, full-board wins, debug poses, audio events, menus, touch, and rendering.

`src/core.ts` contains the render-free simulation; `src/game.ts` owns initialization and frame transitions; `src/debug.ts` implements the automation surface; `src/menu.ts` shares hit-region geometry; and `src/render.ts` draws the game. The engine exclusively owns input, frame delivery, viewport fitting, asset loading, audio and the diagnostic overlay. Automation obtains the debug API through `engine.debug`; no game object is installed on the page.

The player-facing showcase is in `showcase/`. With the dev server running, `node tools/capture-showcase.mjs` recaptures its screenshots and five-second engine drawing replay through a private browser harness. Playwright launches with `--no-sandbox` for container compatibility.
