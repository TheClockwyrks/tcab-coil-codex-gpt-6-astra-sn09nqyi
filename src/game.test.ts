/// <reference types="node" />
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import {
  createEngine,
  ConstantClock,
  SequenceClock,
  type Clock,
} from "@clockwyrks/simple-2d";
import { game, BACKGROUND, type CoilState } from "./game";
import {
  START_CELLS,
  TICK_SECONDS,
  COMBO_WINDOW,
  COMBO_MAX,
  BOARD_X,
  BOARD_Y,
  CELL,
  STAGE_W,
  STAGE_H,
  LAYOUT,
  type Cell,
  type Screen,
} from "./constants";
import type { DeepReadonly } from "ts-essentials";

// Real PNG decoding and canvas rendering; only browser transport/audio are adapted.
beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    async (url: string) => new Response(await readFile(url)),
  );
  vi.stubGlobal("createImageBitmap", async (blob: Blob) =>
    loadImage(Buffer.from(await blob.arrayBuffer())),
  );
  vi.stubGlobal(
    "AudioContext",
    class {
      state = "suspended";
      async decodeAudioData(data: ArrayBuffer) {
        return { duration: data.byteLength / 176400 };
      }
      async resume() {
        /* No audio device in the Node test host. */
      }
    },
  );
});
// A cleanup callback avoids coupling the harness to any engine internals.
const cleanup: (() => void)[] = [];
afterEach(() => {
  cleanup.splice(0).forEach((f) => f());
  vi.unstubAllGlobals();
});
async function setup(clock: Clock = new ConstantClock(125)) {
  const events = new EventTarget();
  const canvas = createCanvas(STAGE_W, STAGE_H);
  const engine = createEngine({
    canvas: canvas as unknown as HTMLCanvasElement,
    width: STAGE_W,
    height: STAGE_H,
    game,
    background: BACKGROUND,
    layout: LAYOUT,
    clock,
    surface: {
      cssWidth: () => STAGE_W,
      cssHeight: () => STAGE_H,
      dpr: () => 1,
      events: () => events,
    },
  });
  cleanup.push(() => engine.destroy());
  await engine.initialize();
  const d = engine.debug;
  const pose = (f: (s: DeepReadonly<CoilState>) => CoilState) =>
    engine.apply(f);
  const snap = () => d.snapshot(engine.state);
  function key(code: string, down = true, repeat = false) {
    events.dispatchEvent(
      Object.assign(new Event(down ? "keydown" : "keyup"), { code, repeat }),
    );
  }
  async function press(code: string) {
    key(code);
    await engine.advance(1);
    key(code, false);
  }
  function pointer(type: string, index: number, device = "mouse", id = 1) {
    const r = d.menuItemRect(engine.state, index);
    events.dispatchEvent(
      Object.assign(new Event(`pointer${type}`), {
        pointerId: id,
        pointerType: device,
        isPrimary: true,
        button: 0,
        buttons: type === "up" ? 0 : 1,
        clientX: r ? r.x + 20 : 20,
        clientY: r ? r.y + 20 : 20,
      }),
    );
  }
  function play() {
    pose((s) => d.setScreen(s, "playing"));
  }
  return { engine, d, pose, snap, key, press, pointer, play, canvas };
}

describe("fixed-step simulation", () => {
  it("opens with the specified state, sprites and diagnostics", async () => {
    const h = await setup();
    expect(h.snap()).toMatchObject({
      screen: "title",
      score: 0,
      best: 0,
      combo: 1,
      ticks: 0,
      simTime: 0,
      snake: START_CELLS,
      pellet: null,
      nextPellet: null,
    });
    expect(h.engine.state.sprites.head).toHaveLength(4);
    expect(h.engine.diagnostics().every((d) => !d.error)).toBe(true);
    expect(h.engine.diagnostics().map((d) => d.name)).toEqual(
      expect.arrayContaining([
        "screen",
        "score",
        "best",
        "combo",
        "comboWindow",
        "dir",
        "length",
        "head",
        "pellet",
      ]),
    );
  });
  it("carries remainders and is independent of frame delivery", async () => {
    const a = await setup(new ConstantClock(1000));
    const b = await setup(new SequenceClock([30, 70, 210, 40, 150]));
    a.play();
    b.play();
    await a.engine.advance(1);
    await b.engine.advance(10);
    expect(a.snap()).toEqual(b.snap());
    expect(a.snap().snake[0]).toEqual({ col: 23, row: 8 });
    expect(a.snap().ticks).toBe(8);
  });
  it("does not move on fractional ticks and preserves the input state", async () => {
    const h = await setup(new ConstantClock(50));
    h.play();
    const before = h.engine.state;
    await h.engine.advance(2);
    expect(h.snap().snake).toEqual(START_CELLS);
    await h.engine.advance(1);
    expect(h.snap().ticks).toBe(1);
    expect(h.engine.state.accumulator).toBeCloseTo(0.025);
    expect(before.simTime).toBe(0);
    expect(before.snake).toEqual(START_CELLS);
  });
  it("buffers two requests, rejects overflow and turns once per tick", async () => {
    const h = await setup({ delta: () => 0 });
    h.play();
    await h.press("ArrowDown");
    await h.press("ArrowLeft");
    await h.press("ArrowUp");
    expect(h.snap().turns).toEqual(["down", "left"]);
    h.engine.setClock(new ConstantClock(125));
    await h.engine.advance(1);
    expect(h.snap().snake[0]).toEqual({ col: 15, row: 9 });
    await h.engine.advance(1);
    expect(h.snap().snake[0]).toEqual({ col: 14, row: 9 });
  });
  it("rejects reversal and repeated direction at tick time", async () => {
    const h = await setup();
    h.play();
    await h.press("KeyA");
    expect(h.snap().dir).toBe("right");
    await h.press("KeyD");
    expect(h.snap().snake[0]).toEqual({ col: 17, row: 8 });
  });
  it("a held key and OS repeat produce just one turn", async () => {
    const h = await setup();
    h.play();
    h.key("KeyS");
    await h.engine.advance(2);
    h.key("KeyS", true, true);
    await h.engine.advance(1);
    expect(h.snap().turns).toEqual([]);
    expect(h.snap().snake[0]).toEqual({ col: 15, row: 11 });
  });
  it("grows, scores immediately and emits exactly the eat and combo cues", async () => {
    const h = await setup();
    h.play();
    const cues: string[] = [];
    h.engine.events.on("cue:played", (e) => cues.push(e.cue));
    h.pose((s) => h.d.setPellet(s, 16, 8));
    h.pose((s) => h.d.setNextPellet(s, 17, 8));
    await h.engine.advance(1);
    expect(h.snap()).toMatchObject({
      score: 10,
      best: 10,
      combo: 1,
      comboWindow: COMBO_WINDOW - TICK_SECONDS,
      pellet: { col: 17, row: 8 },
    });
    await h.engine.advance(1);
    expect(h.snap()).toMatchObject({ score: 30, best: 30, combo: 2 });
    expect(h.snap().snake).toHaveLength(5);
    expect(cues).toEqual(["eat", "eat", "combo-up"]);
  });
  it("caps the combo and lapses on the 28th tick", async () => {
    const h = await setup();
    h.play();
    h.pose((s) => h.d.setCombo(s, COMBO_MAX));
    h.pose((s) => h.d.setComboWindow(s, COMBO_WINDOW));
    h.pose((s) => h.d.setPellet(s, 16, 8));
    await h.engine.advance(1);
    expect(h.snap().score).toBe(50);
    h.pose((s) => h.d.setSnakeTravel(s, false));
    await h.engine.advance(26);
    expect(h.snap().comboWindow).toBe(TICK_SECONDS);
    expect(h.snap().combo).toBe(5);
    await h.engine.advance(1);
    expect(h.snap()).toMatchObject({ combo: 1, comboWindow: 0 });
  });
  it("an eat on the last open tick extends the combo", async () => {
    const h = await setup();
    h.play();
    h.pose((s) => h.d.setCombo(s, 3));
    h.pose((s) => h.d.setComboWindow(s, TICK_SECONDS));
    h.pose((s) => h.d.setPellet(s, 16, 8));
    await h.engine.advance(1);
    expect(h.snap()).toMatchObject({
      combo: 4,
      score: 40,
      comboWindow: COMBO_WINDOW - TICK_SECONDS,
    });
  });
  it("a closed window resets the multiplier before awarding points", async () => {
    const h = await setup();
    h.play();
    h.pose((s) => h.d.setCombo(s, 5));
    h.pose((s) => h.d.setPellet(s, 16, 8));
    await h.engine.advance(1);
    expect(h.snap()).toMatchObject({ score: 10, combo: 1 });
  });
  it("wall collision ends the update, preserves the board and spends remaining time", async () => {
    const h = await setup(new ConstantClock(2000));
    h.play();
    h.pose((s) => h.d.setSnake(s, [{ col: 28, row: 8 }]));
    h.pose((s) => h.d.setComboWindow(s, 2));
    const cues: string[] = [];
    h.engine.events.on("cue:played", (e) => cues.push(e.cue));
    await h.engine.advance(1);
    expect(h.snap()).toMatchObject({
      screen: "gameover",
      ticks: 1,
      comboWindow: 2,
      snake: [{ col: 28, row: 8 }],
    });
    expect(cues).toEqual(["death"]);
    expect(h.engine.state.accumulator).toBe(0);
    h.pose((s) => h.d.setDirection(s, "left"));
    h.play();
    h.engine.setClock({ delta: () => 0 });
    await h.engine.advance(1);
    expect(h.snap().ticks).toBe(1);
  });
  it("allows entering a vacating tail but rejects every other body cell", async () => {
    const h = await setup();
    h.play();
    h.pose((s) =>
      h.d.setSnake(s, [
        { col: 8, row: 8 },
        { col: 8, row: 9 },
        { col: 9, row: 9 },
        { col: 9, row: 8 },
      ]),
    );
    await h.engine.advance(1);
    expect(h.snap().screen).toBe("playing");
    expect(h.snap().snake[0]).toEqual({ col: 9, row: 8 });
    h.pose((s) => h.d.setDirection(s, "down"));
    await h.engine.advance(1);
    expect(h.snap().screen).toBe("playing");
    h.pose((s) => h.d.setDirection(s, "up"));
    await h.engine.advance(1);
    expect(h.snap().screen).toBe("gameover");
  });
  it("the tail is solid when the same tick would eat", async () => {
    const h = await setup();
    h.play();
    h.pose((s) => h.d.setPellet(s, 16, 8));
    h.pose((s) =>
      h.d.setSnake(s, [
        { col: 15, row: 8 },
        { col: 15, row: 9 },
        { col: 16, row: 9 },
        { col: 16, row: 8 },
      ]),
    );
    await h.engine.advance(1);
    expect(h.snap().screen).toBe("gameover");
    expect(h.snap().score).toBe(0);
  });
  it("driver switches operate independently and preserve a deferred spawn", async () => {
    const h = await setup();
    h.play();
    h.pose((s) => h.d.setPelletRespawn(s, false));
    h.pose((s) => h.d.setNextPellet(s, 20, 8));
    h.pose((s) => h.d.setPellet(s, 16, 8));
    await h.engine.advance(1);
    expect(h.snap()).toMatchObject({
      pellet: null,
      nextPellet: { col: 20, row: 8 },
      screen: "playing",
    });
    h.pose((s) => h.d.setSnakeTravel(s, false));
    await h.press("KeyS");
    expect(h.snap().dir).toBe("down");
    expect(h.snap().snake[0]).toEqual({ col: 16, row: 8 });
    h.pose((s) => h.d.setSnakeSteering(s, false));
    await h.press("KeyA");
    expect(h.snap().dir).toBe("down");
    expect(h.snap().turns).toEqual([]);
  });
  it("clears the board when the last free cell is eaten", async () => {
    const h = await setup();
    const path: Cell[] = [];
    for (let row = 1; row <= 16; row++)
      for (let i = 0; i < 28; i++)
        path.push({ col: row % 2 ? i + 1 : 28 - i, row });
    h.pose((s) => h.d.setSnake(s, path.slice(1)));
    h.pose((s) => h.d.setDirection(s, "left"));
    h.pose((s) => h.d.setPellet(s, 1, 1));
    h.play();
    await h.engine.advance(1);
    expect(h.snap()).toMatchObject({
      screen: "cleared",
      pellet: null,
      score: 10,
    });
    expect(h.snap().snake).toHaveLength(448);
    expect(h.d.drawPelletCell(h.engine.state)).toBeNull();
  });
});

describe("menus, poses and input", () => {
  it("remembers the title item and supports keyboard wrap and back", async () => {
    const h = await setup({ delta: () => 0 });
    await h.press("ArrowUp");
    expect(h.snap().menuIndex).toBe(1);
    await h.press("Enter");
    expect(h.snap().screen).toBe("howto");
    await h.press("Escape");
    expect(h.snap()).toMatchObject({
      screen: "title",
      menuIndex: 1,
      titleIndex: 1,
    });
    await h.press("ArrowDown");
    await h.press("Space");
    expect(h.snap()).toMatchObject({
      screen: "playing",
      menuIndex: 0,
      titleIndex: 0,
    });
    expect(h.snap().pellet).not.toBeNull();
  });
  it("freezes counters, bite and combo on pause; music resumes without restarting", async () => {
    const h = await setup();
    const sounds: string[] = [];
    h.engine.events.on("cue:looped", (e) => sounds.push(e.cue));
    h.engine.events.on("cue:stopped", (e) => sounds.push(`stop:${e.cue}`));
    await h.press("Enter");
    h.pose((s) => h.d.setCombo(s, 2));
    h.pose((s) => h.d.setComboWindow(s, 2));
    await h.press("KeyP");
    const frozen = h.snap();
    await h.engine.advance(20);
    expect(h.snap()).toEqual(frozen);
    await h.press("KeyP");
    expect(h.snap().simTime).toBe(frozen.simTime + 0.125);
    expect(sounds).toEqual(["music"]);
    await h.press("Escape");
    h.pose((s) => h.d.setMenuIndex(s, 2));
    await h.press("Enter");
    expect(sounds).toEqual(["music", "stop:music"]);
  });
  it("restart and play again reset a round, retain best and consume a first-spawn pose", async () => {
    const h = await setup({ delta: () => 0 });
    await h.press("Enter");
    h.pose((s) => h.d.setScore(s, 120));
    await h.press("KeyP");
    h.pose((s) => h.d.setNextPellet(s, 5, 5));
    h.pose((s) => h.d.setMenuIndex(s, 1));
    await h.press("Enter");
    expect(h.snap()).toMatchObject({
      screen: "playing",
      score: 0,
      best: 120,
      pellet: { col: 5, row: 5 },
      nextPellet: null,
      snake: START_CELLS,
    });
    h.pose((s) => h.d.setScreen(s, "gameover"));
    await h.press("Enter");
    expect(h.snap().screen).toBe("playing");
  });
  it("pointer and touch require both edges in the same menu item, including one-frame taps", async () => {
    const h = await setup({ delta: () => 0 });
    h.pointer("move", 1);
    await h.engine.advance(1);
    expect(h.snap().menuIndex).toBe(1);
    h.pointer("down", 0);
    h.pointer("up", 1);
    await h.engine.advance(1);
    expect(h.snap().screen).toBe("title");
    h.pointer("down", 1, "touch", 2);
    h.pointer("up", 1, "touch", 2);
    await h.engine.advance(1);
    expect(h.snap().screen).toBe("howto");
    h.pointer("down", 0);
    h.pointer("up", 0);
    await h.engine.advance(1);
    expect(h.snap()).toMatchObject({ screen: "title", menuIndex: 1 });
  });
  it("mute works on every screen and survives reset", async () => {
    const h = await setup({ delta: () => 0 });
    await h.press("KeyM");
    expect(h.snap().muted).toBe(true);
    h.pose((s) => h.d.reset(s));
    expect(h.snap().muted).toBe(true);
    for (const screen of [
      "howto",
      "playing",
      "paused",
      "gameover",
      "cleared",
    ] as Screen[]) {
      h.pose((s) => h.d.setScreen(s, screen));
      const before = h.snap().muted;
      await h.press("KeyM");
      expect(h.snap().muted).toBe(!before);
    }
  });
  it("all poses are independent, reconcile is inert, and snapshots are detached", async () => {
    const h = await setup({ delta: () => 0 });
    h.pose((s) => h.d.setScore(s, 100));
    expect(h.snap().best).toBe(0);
    h.pose((s) => h.d.reconcile(s));
    expect(h.snap().best).toBe(0);
    await h.engine.advance(1);
    expect(h.snap().best).toBe(100);
    h.pose((s) => h.d.setBest(s, 5));
    expect(h.snap().score).toBe(100);
    const before = h.engine.state;
    h.pose((s) => h.d.clearPellet(s));
    h.pose((s) => h.d.clearTurns(s));
    expect(before.score).toBe(100);
    h.pose((s) => h.d.reset(s));
    expect(h.snap()).toMatchObject({
      score: 0,
      best: 0,
      screen: "title",
      ticks: 0,
      simTime: 0,
      travel: true,
      steering: true,
      pelletRespawn: true,
    });
    expect(h.d.snapshot(h.engine.state).snake).not.toBe(h.engine.state.snake);
  });
  it("validates invalid debug domains without clamping", async () => {
    const h = await setup();
    const s = h.engine.state;
    for (const call of [
      () => h.d.setScore(s, -1),
      () => h.d.setBest(s, NaN),
      () => h.d.setCombo(s, 6),
      () => h.d.setComboWindow(s, 4),
      () => h.d.setMenuIndex(s, 2),
      () => h.d.menuItemRect(s, -1),
      () => h.d.setSnake(s, []),
      () =>
        h.d.setSnake(s, [
          { col: 1, row: 1 },
          { col: 3, row: 1 },
        ]),
      () =>
        h.d.setSnake(s, [
          { col: 1, row: 1 },
          { col: 1, row: 1 },
        ]),
      () => h.d.setPellet(s, 15, 8),
      () => h.d.setNextPellet(s, 30, 1),
      () => h.d.setScreen(s, "invalid" as Screen),
    ])
      expect(call).toThrow();
    expect(h.d.menuItemRect(s, 99)).toBeNull();
    h.play();
    expect(h.d.menuItemRect(h.engine.state, 0)).toBeNull();
    expect(() => h.d.setMenuIndex(h.engine.state, 1)).toThrow();
  });
  it("pellet draws exclude occupied cells, ignore the pose, and do not mutate", async () => {
    const h = await setup();
    h.pose((s) => h.d.setNextPellet(s, 2, 2));
    h.pose((s) => h.d.setPellet(s, 1, 1));
    const before = h.snap();
    const cells = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      const c = h.d.drawPelletCell(h.engine.state)!;
      expect(c.col).toBeGreaterThan(0);
      expect(c.col).toBeLessThan(29);
      expect(c.row).toBeGreaterThan(0);
      expect(c.row).toBeLessThan(17);
      expect([...START_CELLS, { col: 1, row: 1 }]).not.toContainEqual(c);
      cells.add(`${c.col},${c.row}`);
    }
    expect(cells.size).toBeGreaterThan(300);
    expect(h.snap()).toEqual(before);
  });
  it("invalid next-spawn cells fall back to a valid draw and are consumed", async () => {
    const h = await setup({ delta: () => 0 });
    h.pose((s) => h.d.setNextPellet(s, 0, 0));
    await h.press("Enter");
    expect(h.snap().nextPellet).toBeNull();
    expect(h.snap().pellet?.col).toBeGreaterThan(0);
  });
  it("renders every screen and bite pose without advancing state", async () => {
    const h = await setup({ delta: () => 0 });
    for (const screen of [
      "title",
      "howto",
      "playing",
      "paused",
      "gameover",
      "cleared",
    ] as Screen[]) {
      h.pose((s) => h.d.setScreen(s, screen));
      await h.engine.advance(1);
    }
    h.play();
    h.pose((s) => h.d.setPellet(s, 16, 8));
    h.engine.setClock(new ConstantClock(125));
    await h.engine.advance(1);
    const before = h.snap();
    h.engine.setClock({ delta: () => 0 });
    await h.engine.advance(1);
    expect(h.snap()).toEqual(before);
    // Pixel evidence: produced head, wall and empty field differ.
    const c = h.canvas.getContext("2d");
    const pixel = (x: number, y: number) =>
      Array.from(c.getImageData(x, y, 1, 1).data);
    expect(
      pixel(BOARD_X + 16 * CELL + 16, BOARD_Y + 8 * CELL + 10),
    ).not.toEqual(pixel(BOARD_X + 16, BOARD_Y + 16));
  });
});
