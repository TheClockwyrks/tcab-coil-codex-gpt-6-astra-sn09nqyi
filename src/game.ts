import type { Game, UpdateApi } from "@clockwyrks/simple-2d";
import type { DeepReadonly } from "ts-essentials";
import {
  ACTIONS,
  BINDINGS,
  CUES,
  CUE_PATHS,
  SPRITE_PATHS,
  DIRECTIONS,
  TICK_SECONDS,
} from "./constants";
import { opening, startRound, queueTurn, tick, type CoreState } from "./core";
import { debug } from "./debug";
import { items, hit } from "./menu";
import { render } from "./render";

export const BACKGROUND = "#070f18";
export interface CoilState extends CoreState {
  sprites: {
    head: readonly ImageBitmap[];
    body: ImageBitmap;
    corner: ImageBitmap;
    tail: ImageBitmap;
  };
}
export type CoilDebugApi = typeof debug;

function arrive(s: CoilState, screen: CoilState["screen"]): CoilState {
  return {
    ...s,
    screen,
    menuIndex: screen === "title" ? s.titleIndex : 0,
    contacts: {},
  };
}
function confirm(s: CoilState, api: UpdateApi): CoilState {
  const index = s.menuIndex;
  if (s.screen === "title") {
    s = { ...s, titleIndex: index };
    if (index === 1) return arrive(s, "howto");
  } else if (s.screen === "howto") return arrive(s, "title");
  else if (s.screen === "paused") {
    if (index === 0) return arrive(s, "playing");
    if (index === 2) return arrive(s, "title");
  } else if (s.screen === "gameover" || s.screen === "cleared") {
    if (index === 1) return arrive(s, "title");
  } else return s;
  api.audio.loop(CUES.music);
  return startRound(s);
}
function update(
  state: DeepReadonly<CoilState>,
  api: UpdateApi,
  dt: number,
): CoilState {
  let s: CoilState = { ...state };
  const edges = Object.fromEntries(
    ACTIONS.map((a) => [a, api.input.pressed(a)]),
  );
  const samples = api.input.pointerSamples();
  if (edges.mute) api.audio.setMuted(!api.audio.muted());
  s.muted = api.audio.muted();
  if (s.screen === "playing") {
    if (edges.back || edges.pause) s = arrive(s, "paused");
    else for (const dir of DIRECTIONS) if (edges[dir]) s = queueTurn(s, dir);
  } else {
    const length = items(s.screen).length;
    if (edges.up) s.menuIndex = (s.menuIndex + length - 1) % length;
    if (edges.down) s.menuIndex = (s.menuIndex + 1) % length;
    if (edges.back || (edges.pause && s.screen === "paused")) {
      if (s.screen === "paused") s = arrive(s, "playing");
      else if (s.screen !== "title") s = arrive(s, "title");
    } else if (edges.confirm) s = confirm(s, api);
  }
  for (const sample of samples) {
    if (s.screen === "playing") break;
    const index = hit(s.screen, sample.x, sample.y);
    if (index >= 0) s = { ...s, menuIndex: index };
    if (sample.type === "down" && sample.button === "primary") {
      s = {
        ...s,
        contacts: { ...s.contacts, [sample.id]: { screen: s.screen, index } },
      };
    } else if (sample.type === "up") {
      const press = s.contacts[sample.id];
      const contacts = { ...s.contacts };
      delete contacts[sample.id];
      s = { ...s, contacts };
      if (
        press &&
        press.screen === s.screen &&
        index >= 0 &&
        press.index === index
      )
        s = confirm(s, api);
    }
  }
  if (s.screen === "playing") {
    s = { ...s, simTime: s.simTime + dt, accumulator: s.accumulator + dt };
    while (s.accumulator + 1e-10 >= TICK_SECONDS && s.screen === "playing") {
      s = { ...s, accumulator: Math.max(0, s.accumulator - TICK_SECONDS) };
      s = tick(s, (name) => api.audio.play(name), s.simTime - s.accumulator);
    }
  }
  s.best = Math.max(s.best, s.score);
  if (s.screen !== "playing" && s.screen !== "paused")
    api.audio.stop(CUES.music);
  return s;
}
export const game: Game<CoilState, CoilDebugApi> = {
  async initialize(api) {
    for (const action of ACTIONS)
      api.input.register(action, { keys: [...BINDINGS[action]] });
    const [head, body, corner, tail] = await Promise.all([
      Promise.all(SPRITE_PATHS.head.map((path) => api.assets.loadImage(path))),
      api.assets.loadImage(SPRITE_PATHS.body),
      api.assets.loadImage(SPRITE_PATHS.corner),
      api.assets.loadImage(SPRITE_PATHS.tail),
      ...Object.values(CUES).map((cue) => api.audio.load(cue, CUE_PATHS[cue])),
    ]);
    for (const key of [
      "screen",
      "score",
      "best",
      "combo",
      "comboWindow",
      "dir",
    ] as const)
      api.diagnostics.register(key, (s) => s[key]);
    api.diagnostics.register("length", (s) => s.snake.length);
    api.diagnostics.register(
      "head",
      (s) => `${s.snake[0].col}, ${s.snake[0].row}`,
    );
    api.diagnostics.register("pellet", (s) =>
      s.pellet ? `${s.pellet.col}, ${s.pellet.row}` : "none",
    );
    return [{ ...opening(), sprites: { head, body, corner, tail } }, debug];
  },
  update,
  render,
};
