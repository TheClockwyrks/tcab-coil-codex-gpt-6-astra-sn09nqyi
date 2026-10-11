import type { DeepReadonly } from "ts-essentials";
import type { CoilState } from "./game";
import {
  COIL_DEBUG_VERSION,
  COMBO_MAX,
  COMBO_WINDOW,
  DIRECTIONS,
  SCREENS,
  GRID_COLS,
  GRID_ROWS,
  type Cell,
  type Direction,
  type Screen,
} from "./constants";
import { opening, interior, same, drawPelletCell, type Snapshot } from "./core";
import { items, menuRect } from "./menu";
type State = DeepReadonly<CoilState>;
function requireValid(valid: boolean, name: string): void {
  if (!valid) throw new RangeError(`Invalid ${name}`);
}
function number(value: number, max = Infinity, min = 0, integer = true): void {
  requireValid(
    Number.isFinite(value) &&
      value >= min &&
      value <= max &&
      (!integer || Number.isInteger(value)),
    "numeric pose",
  );
}
function boolean(value: boolean): void {
  requireValid(typeof value === "boolean", "switch");
}
export const debug = {
  version: COIL_DEBUG_VERSION,
  reset: (s: State): CoilState => ({ ...s, ...opening(s.muted) }),
  reconcile: (s: State): CoilState => ({ ...s }),
  snapshot(s: State): Snapshot {
    const {
      version,
      screen,
      menuIndex,
      titleIndex,
      mode,
      score,
      best,
      combo,
      comboWindow,
      muted,
      ticks,
      simTime,
      dir,
      steering,
      travel,
      pelletRespawn,
    } = s;
    return {
      version,
      screen,
      menuIndex,
      titleIndex,
      mode,
      score,
      best,
      combo,
      comboWindow,
      muted,
      ticks,
      simTime,
      dir,
      steering,
      travel,
      pelletRespawn,
      turns: [...s.turns],
      snake: s.snake.map((c) => ({ ...c })),
      obstacles: s.obstacles.map((c) => ({ ...c })),
      pellet: s.pellet ? { ...s.pellet } : null,
      nextPellet: s.nextPellet ? { ...s.nextPellet } : null,
    };
  },
  menuItemRect: (s: State, index: number) => menuRect(s.screen, index),
  setScreen(s: State, screen: Screen): CoilState {
    requireValid(SCREENS.includes(screen), "screen");
    return { ...s, screen };
  },
  setMenuIndex(s: State, menuIndex: number): CoilState {
    number(menuIndex, Math.max(0, items(s.screen).length - 1));
    return { ...s, menuIndex };
  },
  setScore(s: State, score: number): CoilState {
    number(score);
    return { ...s, score };
  },
  setBest(s: State, best: number): CoilState {
    number(best);
    return { ...s, best };
  },
  setCombo(s: State, combo: number): CoilState {
    number(combo, COMBO_MAX, 1);
    return { ...s, combo };
  },
  setComboWindow(s: State, comboWindow: number): CoilState {
    number(comboWindow, COMBO_WINDOW, 0, false);
    return { ...s, comboWindow };
  },
  setSnake(s: State, cells: readonly Cell[]): CoilState {
    requireValid(Array.isArray(cells) && cells.length > 0, "chain");
    cells.forEach((c, i) => {
      requireValid(
        interior(c) &&
          !s.obstacles.some((o) => same(o, c)) &&
          !cells.slice(0, i).some((o) => same(o, c)),
        "chain cell",
      );
      if (i)
        requireValid(
          Math.abs(c.col - cells[i - 1].col) +
            Math.abs(c.row - cells[i - 1].row) ===
            1,
          "chain adjacency",
        );
    });
    return { ...s, snake: cells.map((c) => ({ ...c })) };
  },
  setDirection(s: State, dir: Direction): CoilState {
    requireValid(DIRECTIONS.includes(dir), "direction");
    return { ...s, dir };
  },
  clearTurns: (s: State): CoilState => ({ ...s, turns: [] }),
  setSnakeSteering(s: State, steering: boolean): CoilState {
    boolean(steering);
    return { ...s, steering, turns: steering ? s.turns : [] };
  },
  setSnakeTravel(s: State, travel: boolean): CoilState {
    boolean(travel);
    return { ...s, travel };
  },
  setPellet(s: State, col: number, row: number): CoilState {
    const pellet = { col, row };
    requireValid(
      interior(pellet) &&
        ![...s.snake, ...s.obstacles].some((c) => same(c, pellet)),
      "pellet",
    );
    return { ...s, pellet };
  },
  clearPellet: (s: State): CoilState => ({ ...s, pellet: null }),
  setPelletRespawn(s: State, pelletRespawn: boolean): CoilState {
    boolean(pelletRespawn);
    return { ...s, pelletRespawn };
  },
  setNextPellet(s: State, col: number, row: number): CoilState {
    number(col, GRID_COLS - 1);
    number(row, GRID_ROWS - 1);
    return { ...s, nextPellet: { col, row } };
  },
  drawPelletCell,
};
