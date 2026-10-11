import type { RenderApi } from "@clockwyrks/simple-2d";
import type { DeepReadonly } from "ts-essentials";
import type { CoilState } from "./game";
import {
  BOARD_X,
  BOARD_Y,
  CELL,
  GRID_COLS,
  GRID_ROWS,
  STAGE_W,
  STAGE_H,
  STAGE_CX,
  TITLE_TEXT,
  TAGLINE_TEXT,
  SCORE_LABEL,
  BEST_LABEL,
  MODE_LABEL,
  GAMEOVER_TEXT,
  CLEARED_TEXT,
  COMBO_WINDOW,
  BITE_SECONDS,
  HEAD_FRAMES,
  PELLET_POINTS,
  type Cell,
} from "./constants";
import { menuRect, items } from "./menu";

const mint = "#8affca",
  bright = "#e6fff3",
  muted = "#7a9d9f",
  amber = "#ffcd79";
const mono = '"Courier New", monospace';
const sans = "Arial, sans-serif";
type State = DeepReadonly<CoilState>;
function text(
  c: CanvasRenderingContext2D,
  value: string,
  x: number,
  y: number,
  size = 16,
  color = muted,
  align: CanvasTextAlign = "left",
  weight = 400,
): void {
  c.fillStyle = color;
  c.font = `${weight} ${size}px ${size < 23 ? mono : sans}`;
  c.textAlign = align;
  c.textBaseline = "middle";
  c.fillText(value, x, y);
}
function line(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  x2: number,
  y2: number,
  color: string,
  width = 1,
): void {
  c.strokeStyle = color;
  c.lineWidth = width;
  c.beginPath();
  c.moveTo(x, y);
  c.lineTo(x2, y2);
  c.stroke();
}
function rect(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  fill: string,
  stroke?: string,
): void {
  c.fillStyle = fill;
  c.fillRect(x, y, w, h);
  if (stroke) {
    c.strokeStyle = stroke;
    c.lineWidth = 1;
    c.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  }
}
function board(c: CanvasRenderingContext2D): void {
  const w = GRID_COLS * CELL,
    h = GRID_ROWS * CELL;
  const field = c.createLinearGradient(
    BOARD_X,
    BOARD_Y,
    BOARD_X + w,
    BOARD_Y + h,
  );
  field.addColorStop(0, "#0b1e29");
  field.addColorStop(1, "#091620");
  c.fillStyle = field;
  c.fillRect(BOARD_X, BOARD_Y, w, h);
  for (let row = 0; row < GRID_ROWS; row++)
    for (let col = 0; col < GRID_COLS; col++) {
      const x = BOARD_X + col * CELL,
        y = BOARD_Y + row * CELL;
      if (
        row === 0 ||
        row === GRID_ROWS - 1 ||
        col === 0 ||
        col === GRID_COLS - 1
      ) {
        rect(c, x + 1, y + 1, CELL - 2, CELL - 2, "#19333d", "#28454b");
        line(c, x + 7, y + 8, x + 15, y + 8, "#426564");
        line(c, x + 17, y + 23, x + 24, y + 23, "#102630");
      } else {
        c.strokeStyle = "#142a33";
        c.lineWidth = 0.7;
        c.strokeRect(x + 0.5, y + 0.5, CELL, CELL);
      }
    }
  c.strokeStyle = "#548277";
  c.lineWidth = 1;
  c.strokeRect(
    BOARD_X + CELL - 0.5,
    BOARD_Y + CELL - 0.5,
    w - 2 * CELL + 1,
    h - 2 * CELL + 1,
  );
  for (const [x, y, sx, sy] of [
    [BOARD_X - 5, BOARD_Y - 5, 1, 1],
    [BOARD_X + w + 5, BOARD_Y - 5, -1, 1],
    [BOARD_X - 5, BOARD_Y + h + 5, 1, -1],
    [BOARD_X + w + 5, BOARD_Y + h + 5, -1, -1],
  ]) {
    line(c, x, y, x + sx * 22, y, "#8affca", 2);
    line(c, x, y, x, y + sy * 22, "#8affca", 2);
  }
  for (let col = 4; col < GRID_COLS - 1; col += 4)
    text(
      c,
      String(col).padStart(2, "0"),
      BOARD_X + col * CELL + 16,
      BOARD_Y + 16,
      9,
      "#678b86",
      "center",
    );
}
function angle(from: Cell, to: Cell): number {
  return Math.atan2(to.row - from.row, to.col - from.col);
}
function snake(c: CanvasRenderingContext2D, s: State, cells = s.snake): void {
  const elapsed = s.simTime - s.biteAt;
  const frame =
    elapsed >= 0 && elapsed < BITE_SECONDS
      ? 1 +
        Math.min(
          HEAD_FRAMES - 2,
          Math.floor((elapsed / BITE_SECONDS) * (HEAD_FRAMES - 1)),
        )
      : 0;
  const facing = {
    right: 0,
    down: Math.PI / 2,
    left: Math.PI,
    up: -Math.PI / 2,
  };
  cells.forEach((cell, i) => {
    let sprite = s.sprites.body,
      rotation = 0;
    if (i === 0) {
      sprite = s.sprites.head[frame];
      rotation = facing[s.dir];
    } else if (i === cells.length - 1) {
      sprite = s.sprites.tail;
      rotation = angle(cell, cells[i - 1]);
    } else {
      const a = cells[i - 1],
        b = cells[i + 1];
      if (a.col === b.col) rotation = Math.PI / 2;
      else if (a.row !== b.row) {
        sprite = s.sprites.corner;
        const right = a.col > cell.col || b.col > cell.col;
        const down = a.row > cell.row || b.row > cell.row;
        rotation = right
          ? down
            ? 0
            : -Math.PI / 2
          : down
            ? Math.PI / 2
            : Math.PI;
      }
    }
    c.save();
    c.translate(
      BOARD_X + (cell.col + 0.5) * CELL,
      BOARD_Y + (cell.row + 0.5) * CELL,
    );
    c.rotate(rotation);
    c.shadowColor = i === 0 ? "#9affca" : "#37d5a3";
    c.shadowBlur = i === 0 ? 11 : 5;
    c.drawImage(sprite, -CELL / 2, -CELL / 2, CELL, CELL);
    c.restore();
  });
}
function pellet(c: CanvasRenderingContext2D, s: State): void {
  if (!s.pellet) return;
  const x = BOARD_X + (s.pellet.col + 0.5) * CELL,
    y = BOARD_Y + (s.pellet.row + 0.5) * CELL;
  c.save();
  c.translate(x, y);
  c.strokeStyle = "#b48a4c";
  c.lineWidth = 1;
  c.strokeRect(-14, -14, 28, 28);
  c.rotate(Math.PI / 4);
  c.shadowColor = amber;
  c.shadowBlur = 12 + Math.sin(s.simTime * 5) * 3;
  rect(c, -7, -7, 14, 14, amber);
  rect(c, -3, -3, 6, 6, "#fff5cb");
  c.restore();
}
function burst(c: CanvasRenderingContext2D, s: State): void {
  if (!s.burst) return;
  const age = s.simTime - s.burst.at;
  if (age < 0 || age > 0.6) return;
  const x = BOARD_X + (s.burst.cell.col + 0.5) * CELL,
    y = BOARD_Y + (s.burst.cell.row + 0.5) * CELL;
  c.save();
  c.globalAlpha = 1 - age / 0.6;
  for (let i = 0; i < 12; i++) {
    const a = (i * Math.PI) / 6,
      r = 12 + age * (45 + (i % 3) * 20);
    const px = x + Math.cos(a) * r,
      py = y + Math.sin(a) * r;
    line(
      c,
      px,
      py,
      px + Math.cos(a) * 5,
      py + Math.sin(a) * 5,
      i % 2 ? amber : mint,
      2,
    );
  }
  text(
    c,
    `+${s.burst.combo * PELLET_POINTS}`,
    x,
    y - 25 - age * 35,
    15,
    amber,
    "center",
    700,
  );
  c.restore();
}
function hud(c: CanvasRenderingContext2D, s: State): void {
  text(c, TITLE_TEXT, BOARD_X, 54, 33, mint, "left", 900);
  text(c, "GRID / 01", BOARD_X, 83, 11, muted);
  text(c, SCORE_LABEL, 340, 39, 12);
  text(c, String(s.score).padStart(4, "0"), 340, 73, 34, bright, "left", 700);
  text(c, BEST_LABEL, 520, 39, 12);
  text(c, String(s.best).padStart(4, "0"), 520, 73, 34, "#a3b8b4", "left", 700);
  if (s.combo >= 2) {
    text(c, `x${s.combo}`, 707, 57, 39, amber, "left", 700);
    text(c, "CHAIN", 766, 48, 11, amber);
    rect(c, 707, 84, 130, 4, "#32403c");
    rect(c, 707, 84, (130 * s.comboWindow) / COMBO_WINDOW, 4, amber);
  }
  text(c, MODE_LABEL, 943, 46, 14, mint);
  text(
    c,
    s.muted ? "M / MUTED" : "M / SOUND ON",
    943,
    77,
    12,
    s.muted ? amber : muted,
  );
  line(c, BOARD_X, 106, BOARD_X + GRID_COLS * CELL, 106, "#29433f");
  c.save();
  c.translate(100, 408);
  c.rotate(-Math.PI / 2);
  text(c, "KEEP MOVING.  MAKE IT COUNT.", 0, 0, 11, "#547772", "center");
  c.restore();
  c.save();
  c.translate(1179, 408);
  c.rotate(Math.PI / 2);
  text(c, "WASD / ARROWS     P / PAUSE", 0, 0, 11, "#547772", "center");
  c.restore();
}
function menu(c: CanvasRenderingContext2D, s: State): void {
  items(s.screen).forEach((item, i) => {
    const r = menuRect(s.screen, i)!,
      selected = i === s.menuIndex;
    rect(
      c,
      r.x,
      r.y,
      r.w,
      r.h,
      selected ? mint : "#0d2029",
      selected ? mint : "#30484d",
    );
    text(
      c,
      item,
      r.x + 24,
      r.y + r.h / 2,
      16,
      selected ? "#0b2827" : "#a6c2bb",
      "left",
      700,
    );
    text(
      c,
      selected ? "↗" : "—",
      r.x + r.w - 24,
      r.y + r.h / 2,
      20,
      selected ? "#0b2827" : "#496962",
      "right",
    );
  });
}
function title(c: CanvasRenderingContext2D, s: State): void {
  // An ornamental coil uses the same native-size sprites as live play.
  const cells: Cell[] = [];
  for (let col = 6; col >= 3; col--) cells.push({ col, row: 4 });
  for (let row = 5; row <= 13; row++) cells.push({ col: 3, row });
  for (let col = 4; col <= 25; col++) cells.push({ col, row: 13 });
  for (let row = 12; row >= 4; row--) cells.push({ col: 25, row });
  for (let col = 24; col >= 22; col--) cells.push({ col, row: 4 });
  c.save();
  c.globalAlpha = 0.65;
  snake(c, s, cells);
  c.restore();
  const fade = c.createLinearGradient(380, 0, 900, 0);
  fade.addColorStop(0, "#07131af0");
  fade.addColorStop(0.5, "#091820");
  fade.addColorStop(1, "#07131af0");
  c.fillStyle = fade;
  c.fillRect(390, 152, 500, 496);
  text(c, "01 / THE ARCADE COLLECTION", STAGE_CX, 185, 11, mint, "center");
  c.save();
  c.shadowColor = "#4adea7";
  c.shadowBlur = 25;
  text(c, TITLE_TEXT, STAGE_CX, 280, 144, bright, "center", 900);
  c.restore();
  text(c, TAGLINE_TEXT.split("").join(" "), STAGE_CX, 357, 16, mint, "center");
  text(
    c,
    "Find your line. Feed the chain.",
    STAGE_CX,
    391,
    15,
    muted,
    "center",
  );
  text(
    c,
    `${BEST_LABEL}  ${String(s.best).padStart(4, "0")}`,
    STAGE_CX,
    574,
    14,
    amber,
    "center",
  );
  text(c, "↑ ↓ SELECT     ENTER TO BEGIN", STAGE_CX, 615, 11, muted, "center");
}
function panel(c: CanvasRenderingContext2D, s: State): void {
  rect(c, 0, BOARD_Y, STAGE_W, STAGE_H - BOARD_Y, "#040c13b8");
  const how = s.screen === "howto";
  rect(
    c,
    how ? 300 : 404,
    how ? 155 : 214,
    how ? 680 : 472,
    how ? 504 : 380,
    "#0a1922",
    "#38544f",
  );
  rect(c, how ? 300 : 404, how ? 155 : 214, how ? 680 : 472, 3, mint);
  if (how) {
    text(c, "LEARN THE LINE", STAGE_CX, 196, 30, bright, "center", 700);
    const rows = [
      [
        "01 / KEEP MOVING",
        "The serpent never stops. Turns land on the next tick.",
      ],
      [
        "02 / FIND A WAY",
        "Turn sideways to your path. You cannot double back.",
      ],
      [
        "03 / FEED THE CHAIN",
        "Each amber pellet adds one cell. Avoid walls and yourself.",
      ],
      [
        "04 / MAKE IT COUNT",
        "Eat quickly to build x5. A fading bar means back to x1.",
      ],
    ];
    rows.forEach(([label, body], i) => {
      text(c, label, 332, 246 + i * 65, 12, mint);
      text(c, body, 332, 271 + i * 65, 13, "#b0c6c2");
    });
    text(
      c,
      "ARROWS / WASD  steer     ENTER / SPACE  select",
      332,
      525,
      13,
      bright,
    );
    text(
      c,
      "ESC  back / pause     P  pause / resume     M  mute",
      332,
      550,
      13,
      bright,
    );
  } else if (s.screen === "paused") {
    text(c, "TAKE A BREATH", STAGE_CX, 274, 36, bright, "center", 700);
    text(
      c,
      "Your line will be right here.",
      STAGE_CX,
      318,
      14,
      muted,
      "center",
    );
  } else {
    text(
      c,
      s.screen === "cleared" ? CLEARED_TEXT : GAMEOVER_TEXT,
      STAGE_CX,
      272,
      37,
      s.screen === "cleared" ? mint : amber,
      "center",
      700,
    );
    text(
      c,
      s.screen === "cleared"
        ? "Every cell. One perfect coil."
        : "One turn ends it. Another begins it.",
      STAGE_CX,
      314,
      13,
      muted,
      "center",
    );
    text(c, SCORE_LABEL, 550, 359, 11, muted, "center");
    text(c, BEST_LABEL, 730, 359, 11, muted, "center");
    text(c, String(s.score), 550, 392, 34, bright, "center", 700);
    text(c, String(s.best), 730, 392, 34, mint, "center", 700);
  }
}
export function render(s: State, api: RenderApi): void {
  const c = api.ctx;
  c.imageSmoothingEnabled = false;
  const wash = c.createRadialGradient(STAGE_CX, 330, 30, STAGE_CX, 330, 740);
  wash.addColorStop(0, "#112632");
  wash.addColorStop(1, "#070f18");
  c.fillStyle = wash;
  c.fillRect(0, 0, STAGE_W, STAGE_H);
  board(c);
  hud(c, s);
  if (s.screen === "title") title(c, s);
  else {
    for (const cell of s.obstacles)
      rect(
        c,
        BOARD_X + cell.col * CELL + 2,
        BOARD_Y + cell.row * CELL + 2,
        CELL - 4,
        CELL - 4,
        "#516775",
        "#d5a574",
      );
    pellet(c, s);
    snake(c, s);
    burst(c, s);
    if (s.screen !== "playing") panel(c, s);
  }
  if (s.screen !== "playing") menu(c, s);
}
