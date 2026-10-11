/* global document, KeyboardEvent */
import { chromium } from "playwright";
import { writeFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import process from "node:process";
import { Buffer } from "node:buffer";

// Run against `npm run dev`. This harness owns an engine without publishing it.
const base = process.argv[2] ?? "http://localhost:5173";
const browser = await chromium.launch({ args: ["--no-sandbox"] });
try {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 720 },
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/capture.html", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: '<html><body style="margin:0"><canvas id="capture" style="width:1280px;height:720px"></canvas></body></html>',
    }),
  );
  await page.goto(`${base}/capture.html`);
  const result = await page.evaluate(async () => {
    const { createEngine, ConstantClock } =
      await import("/node_modules/@clockwyrks/simple-2d/dist/index.js");
    const { game, BACKGROUND } = await import("/src/game.ts");
    const { STAGE_W, STAGE_H, LAYOUT } = await import("/src/constants.ts");
    const canvas = document.getElementById("capture");
    const engine = createEngine({
      canvas,
      width: STAGE_W,
      height: STAGE_H,
      layout: LAYOUT,
      background: BACKGROUND,
      game,
      clock: { delta: () => 0 },
    });
    await engine.initialize();
    await engine.advance(1);
    const title = canvas.toDataURL();
    const d = engine.debug;
    const chain = [];
    for (let col = 14; col >= 6; col--) chain.push({ col, row: 8 });
    for (let row = 9; row <= 12; row++) chain.push({ col: 6, row });
    for (let col = 7; col <= 20; col++) chain.push({ col, row: 12 });
    for (let row = 11; row >= 10; row--) chain.push({ col: 20, row });
    engine.apply((s) => d.setSnake(s, chain));
    engine.apply((s) => d.setScreen(s, "playing"));
    engine.apply((s) => d.setScore(s, 130));
    engine.apply((s) => d.setCombo(s, 2));
    engine.apply((s) => d.setComboWindow(s, 3.5));
    const targets = [
      { col: 18, row: 8 },
      { col: 18, row: 5 },
      { col: 25, row: 5 },
      { col: 25, row: 12 },
      { col: 22, row: 12 },
      { col: 22, row: 9 },
      { col: 15, row: 9 },
    ];
    engine.apply((s) => d.setPellet(s, targets[0].col, targets[0].row));
    engine.apply((s) => d.setNextPellet(s, targets[1].col, targets[1].row));
    let next = 1,
      lastTicks = 0;
    engine.setClock(new ConstantClock(1000 / 30));
    engine.startRecording();
    let live = "";
    for (let frame = 0; frame < 150; frame++) {
      const s = engine.state;
      if (s.ticks !== lastTicks) {
        lastTicks = s.ticks;
        if (s.nextPellet === null && next < targets.length - 1) {
          next++;
          engine.apply((s) =>
            d.setNextPellet(s, targets[next].col, targets[next].row),
          );
        }
      }
      const head = engine.state.snake[0];
      let code = null;
      if (head.col === 18 && head.row === 8 && s.dir === "right")
        code = "ArrowUp";
      if (head.col === 18 && head.row === 5 && s.dir === "up")
        code = "ArrowRight";
      if (head.col === 25 && head.row === 5 && s.dir === "right")
        code = "ArrowDown";
      if (head.col === 25 && head.row === 12 && s.dir === "down")
        code = "ArrowLeft";
      if (head.col === 22 && head.row === 12 && s.dir === "left")
        code = "ArrowUp";
      if (head.col === 22 && head.row === 9 && s.dir === "up")
        code = "ArrowLeft";
      if (code && !s.turns.length) {
        document.dispatchEvent(new KeyboardEvent("keydown", { code }));
        document.dispatchEvent(new KeyboardEvent("keyup", { code }));
      }
      await engine.advance(1);
      if (frame === 82) live = canvas.toDataURL();
      if (engine.state.screen !== "playing") break;
    }
    const recording = engine.stopRecording();
    const final = d.snapshot(engine.state);
    engine.destroy();
    return { title, live, recording, final };
  });
  for (const name of ["title", "live"])
    await writeFile(
      `showcase/${name}.png`,
      Buffer.from(result[name].split(",")[1], "base64"),
    );
  await writeFile(
    "showcase/combo.json.gz",
    gzipSync(JSON.stringify(result.recording)),
  );
  if (errors.length) throw new Error(errors.join("\n"));
  process.stdout.write(
    `Captured ${result.recording.frames.length} frames; final score ${result.final.score}, screen ${result.final.screen}.\n`,
  );
} finally {
  await browser.close();
}
