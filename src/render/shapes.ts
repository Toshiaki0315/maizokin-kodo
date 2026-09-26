// 盤面の図形（仕様 12章・16.16）。座標と色は仕様書の値をそのまま使う。
// 形の変わらないものは GraphicsContext として一度だけ作り、Graphics で使い回す（14.3）
import { Graphics, GraphicsContext } from 'pixi.js';
import { COLS, ROWS, TILE_SIZE } from '../core/config';
import { PATH, type Grid } from '../core/maze';
import { DOT_SIZE, type PixelArt } from './sprites';

const HALF = TILE_SIZE / 2;

// ---- 壁（12.2）：マス左上原点のレンガ模様 ----

const WALL_BASE = 0x003300;
const BRICK = 0x00cc00;
const BRICK_HIGHLIGHT = 0x33ff33;
const BRICK_SHADOW = 0x006600;

/** レンガ本体（x, y, 幅, 高さ）。ハイライトは各レンガの上端、シャドウは下端（y+10）に高さ2で重ねる */
const BRICKS: ReadonlyArray<readonly [number, number, number, number]> = [
  [1, 1, 18, 12],
  [21, 1, 18, 12],
  [1, 14, 8, 12],
  [11, 14, 18, 12],
  [31, 14, 8, 12],
  [1, 27, 18, 12],
  [21, 27, 18, 12],
];

/** 迷路のすべての壁を1つの Graphics に描く。レベル開始時に1回だけ呼ぶ（14.3） */
export function drawWalls(g: Graphics, grid: Grid): void {
  g.clear();
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      if (grid[y][x] === PATH) continue;
      const ox = x * TILE_SIZE;
      const oy = y * TILE_SIZE;
      g.rect(ox, oy, TILE_SIZE, TILE_SIZE).fill(WALL_BASE);
      for (const [bx, by, bw, bh] of BRICKS) {
        g.rect(ox + bx, oy + by, bw, bh).fill(BRICK);
        g.rect(ox + bx, oy + by, bw, 2).fill(BRICK_HIGHLIGHT);
        g.rect(ox + bx, oy + by + 10, bw, 2).fill(BRICK_SHADOW);
      }
    }
  }
}

// ---- ポータル（12.3）：マス中心原点。時間で形が変わるので毎フレーム描き直す ----

/** 三角形 (0,0)-(8,16)-(-8,16) を angle だけ回した頂点 */
function rotatedTriangle(angle: number): number[] {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const rotate = (x: number, y: number): [number, number] => [x * cos - y * sin, x * sin + y * cos];
  return [...rotate(0, 0), ...rotate(8, 16), ...rotate(-8, 16)];
}

export function drawPortal(g: Graphics, nowMs: number): void {
  g.clear();
  g.rect(-HALF, -HALF, TILE_SIZE, TILE_SIZE).fill(0x110022);
  const color = Math.floor(nowMs / 150) % 2 === 0 ? 0xff0000 : 0xff00ff;
  const base = nowMs / 500;
  for (let i = 0; i < 8; i++) {
    g.poly(rotatedTriangle(base + (i * Math.PI) / 4)).fill(color);
  }
  g.circle(0, 0, 6 + Math.sin(nowMs / 150) * 3)
    .fill(0x000000)
    .stroke({ width: 2, color: 0xffffff });
}

// ---- 階段（12.4）：マス中心原点 ----

export function stairsContext(): GraphicsContext {
  const ctx = new GraphicsContext().rect(-14, -14, 28, 28).fill(0x555555);
  for (const i of [-10, -4, 2]) {
    ctx.rect(-12, i, 24, 4).fill(0x888888);
    ctx.rect(-12, i + 4, 24, 2).fill(0x333333);
  }
  return ctx;
}

// ---- 穴（12.5）：白い円の輪郭。半径は深さで決まる ----

const HOLE_RADIUS: Readonly<Record<number, number>> = { 1: 6, 2: 12, 3: 16 };

export function drawHole(g: Graphics, x: number, y: number, stage: number): void {
  g.circle(x * TILE_SIZE + HALF, y * TILE_SIZE + HALF, HOLE_RADIUS[stage]).stroke({ width: 4, color: 0xffffff });
}

// ---- 金塊（12.6）：マス中心原点。回転（−π/8）は Graphics 側で行う ----

export const GOLD_ROTATION = -Math.PI / 8;

export function goldContext(): GraphicsContext {
  return new GraphicsContext()
    .rect(-10, -4, 24, 14)
    .fill(0xb8860b) // 影
    .rect(-12, -6, 24, 14)
    .fill(0xdaa520) // 本体
    .rect(-10, -4, 20, 10)
    .fill(0xffdf00) // 上面
    .rect(-8, -2, 14, 2)
    .fill(0xffffff) // 光沢（L字）
    .rect(-8, -2, 2, 6)
    .fill(0xffffff);
}

// ---- ドット絵（16.16）：1ドット＝論理2px、マスの左上に合わせる ----

/** ドット絵を GraphicsContext にする。同じ色が横に続くドットは1つの矩形にまとめる */
export function pixelArtContext(art: PixelArt, palette: Readonly<Record<string, number>>): GraphicsContext {
  const ctx = new GraphicsContext();
  art.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const symbol = row[x];
      let end = x + 1;
      while (end < row.length && row[end] === symbol) end++;
      if (symbol !== '.') {
        ctx.rect(x * DOT_SIZE, y * DOT_SIZE, (end - x) * DOT_SIZE, DOT_SIZE).fill(palette[symbol]);
      }
      x = end;
    }
  });
  return ctx;
}
