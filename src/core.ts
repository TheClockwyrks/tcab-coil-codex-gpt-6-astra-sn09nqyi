import type { DeepReadonly } from "ts-essentials";
import {
  COIL_DEBUG_VERSION,
  MODE,
  START_CELLS,
  START_DIR,
  OBSTACLE_CELLS,
  INTERIOR_MIN_COL,
  INTERIOR_MAX_COL,
  INTERIOR_MIN_ROW,
  INTERIOR_MAX_ROW,
  TICK_SECONDS,
  COMBO_WINDOW,
  COMBO_MAX,
  PELLET_POINTS,
  CUES,
  TURN_QUEUE_MAX,
  type Cell,
  type Direction,
  type Screen,
  type CueName,
} from "./constants";

export interface Snapshot {
  version: number;
  screen: Screen;
  menuIndex: number;
  titleIndex: number;
  mode: typeof MODE;
  score: number;
  best: number;
  combo: number;
  comboWindow: number;
  muted: boolean;
  ticks: number;
  simTime: number;
  dir: Direction;
  turns: readonly Direction[];
  snake: readonly Cell[];
  pellet: Cell | null;
  obstacles: readonly Cell[];
  steering: boolean;
  travel: boolean;
  pelletRespawn: boolean;
  nextPellet: Cell | null;
}
export interface CoreState extends Snapshot {
  accumulator: number;
  biteAt: number;
  burst: { cell: Cell; at: number; combo: number } | null;
  contacts: Readonly<Record<number, { screen: Screen; index: number }>>;
}
export type ReadCore = DeepReadonly<CoreState>;
export const vectors: Record<Direction, Cell> = {
  right: { col: 1, row: 0 },
  down: { col: 0, row: 1 },
  left: { col: -1, row: 0 },
  up: { col: 0, row: -1 },
};
export const same = (a: Cell | null, b: Cell | null): boolean =>
  !!a && !!b && a.col === b.col && a.row === b.row;
export const interior = (c: Cell): boolean =>
  Number.isInteger(c.col) &&
  Number.isInteger(c.row) &&
  c.col >= INTERIOR_MIN_COL &&
  c.col <= INTERIOR_MAX_COL &&
  c.row >= INTERIOR_MIN_ROW &&
  c.row <= INTERIOR_MAX_ROW;
export function opening(muted = false): CoreState {
  return {
    version: COIL_DEBUG_VERSION,
    screen: "title",
    menuIndex: 0,
    titleIndex: 0,
    mode: MODE,
    score: 0,
    best: 0,
    combo: 1,
    comboWindow: 0,
    muted,
    ticks: 0,
    simTime: 0,
    dir: START_DIR,
    turns: [],
    snake: START_CELLS.map((c) => ({ ...c })),
    pellet: null,
    obstacles: [...OBSTACLE_CELLS],
    steering: true,
    travel: true,
    pelletRespawn: true,
    nextPellet: null,
    accumulator: 0,
    biteAt: -Infinity,
    burst: null,
    contacts: {},
  };
}
export function validCells(s: ReadCore): Cell[] {
  const occupied = new Set(
    [...s.snake, ...s.obstacles, ...(s.pellet ? [s.pellet] : [])].map(
      (c) => `${c.col},${c.row}`,
    ),
  );
  const cells: Cell[] = [];
  for (let row = INTERIOR_MIN_ROW; row <= INTERIOR_MAX_ROW; row++)
    for (let col = INTERIOR_MIN_COL; col <= INTERIOR_MAX_COL; col++)
      if (!occupied.has(`${col},${row}`)) cells.push({ col, row });
  return cells;
}
export function drawPelletCell(s: ReadCore): Cell | null {
  const cells = validCells(s);
  return cells.length ? cells[Math.floor(Math.random() * cells.length)] : null;
}
export function spawn<T extends CoreState>(s: T): T {
  const cells = validCells(s);
  const pellet =
    cells.find((c) => same(c, s.nextPellet)) ??
    (cells.length ? cells[Math.floor(Math.random() * cells.length)] : null);
  return {
    ...s,
    pellet,
    nextPellet: null,
    ...(pellet ? {} : { screen: "cleared", menuIndex: 0, accumulator: 0 }),
  };
}
export function startRound<T extends CoreState>(s: T): T {
  // Session counters and the one-shot spawn pose survive a new round.
  return spawn({
    ...s,
    screen: "playing",
    menuIndex: 0,
    score: 0,
    combo: 1,
    comboWindow: 0,
    snake: START_CELLS.map((c) => ({ ...c })),
    dir: START_DIR,
    turns: [],
    pellet: null,
    obstacles: [...OBSTACLE_CELLS],
    accumulator: 0,
    biteAt: -Infinity,
    burst: null,
    contacts: {},
  });
}
export function queueTurn<T extends CoreState>(s: T, dir: Direction): T {
  return s.steering && s.turns.length < TURN_QUEUE_MAX
    ? { ...s, turns: [...s.turns, dir] }
    : s;
}
export function tick<T extends CoreState>(
  s: T,
  cue: (name: CueName) => void,
  tickTime: number,
): T {
  let next = { ...s, ticks: s.ticks + 1 };
  if (s.steering && s.turns.length) {
    const turn = s.turns[0];
    const a = vectors[turn],
      b = vectors[s.dir];
    next = {
      ...next,
      turns: s.turns.slice(1),
      dir: a.col * b.col + a.row * b.row === 0 ? turn : s.dir,
    };
  }
  if (next.travel) {
    const v = vectors[next.dir],
      head = next.snake[0];
    const target = { col: head.col + v.col, row: head.row + v.row };
    const eats = same(target, next.pellet);
    const solid = eats ? next.snake : next.snake.slice(0, -1);
    if (
      !interior(target) ||
      next.obstacles.some((c) => same(c, target)) ||
      solid.some((c) => same(c, target))
    ) {
      cue(CUES.death);
      return {
        ...next,
        screen: "gameover",
        menuIndex: 0,
        accumulator: 0,
        contacts: {},
      };
    }
    next = {
      ...next,
      snake: [target, ...(eats ? next.snake : next.snake.slice(0, -1))],
    };
    if (eats) {
      const combo =
        next.comboWindow > 0 ? Math.min(COMBO_MAX, next.combo + 1) : 1;
      cue(CUES.eat);
      if (combo > next.combo) cue(CUES.comboUp);
      next = {
        ...next,
        combo,
        comboWindow: COMBO_WINDOW,
        score: next.score + PELLET_POINTS * combo,
        biteAt: tickTime,
        burst: { cell: target, at: tickTime, combo },
      };
      next = next.pelletRespawn ? spawn(next) : { ...next, pellet: null };
    }
  }
  const comboWindow = Math.max(0, next.comboWindow - TICK_SECONDS);
  return { ...next, comboWindow, combo: comboWindow > 0 ? next.combo : 1 };
}
