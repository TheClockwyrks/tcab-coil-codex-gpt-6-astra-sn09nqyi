import {
  TITLE_ITEMS,
  PAUSE_ITEMS,
  OVER_ITEMS,
  STAGE_CX,
  type Screen,
} from "./constants";
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export function items(screen: Screen): readonly string[] {
  switch (screen) {
    case "title":
      return TITLE_ITEMS;
    case "paused":
      return PAUSE_ITEMS;
    case "gameover":
    case "cleared":
      return OVER_ITEMS;
    case "howto":
      return ["BACK"];
    case "playing":
      return [];
  }
}
export function menuRect(screen: Screen, index: number): Rect | null {
  if (!Number.isInteger(index) || index < 0)
    throw new RangeError("Menu index must be a nonnegative integer");
  if (index >= items(screen).length) return null;
  const y =
    screen === "title"
      ? 422
      : screen === "howto"
        ? 584
        : screen === "paused"
          ? 358
          : 432;
  return { x: STAGE_CX - 174, y: y + index * 62, w: 348, h: 50 };
}
export function hit(screen: Screen, x: number, y: number): number {
  return items(screen).findIndex((_, i) => {
    const r = menuRect(screen, i)!;
    return x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
  });
}
