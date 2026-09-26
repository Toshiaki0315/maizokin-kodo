// 複数のテストで使う道具。ファイル名が *.test.ts ではないので、これ自体はテストとして実行されない
import { COLS, ROWS, type Point } from '../../src/core/config';
import { PATH, WALL, type Grid } from '../../src/core/maze';
import type { Rng } from '../../src/core/rng';

/** 決まった値を順に返す Rng。乱数の使われ方を狙いどおりに決めるため */
export function sequenceRng(...values: number[]): Rng {
  let i = 0;
  return { next: () => values[i++ % values.length] };
}

/** 外周だけが壁で、内側がすべて通路の盤面。walls に挙げたマスは壁にする */
export function openGrid(walls: Point[] = []): Grid {
  const grid: Grid = Array.from({ length: ROWS }, (_, y) =>
    Array.from({ length: COLS }, (_, x) => (x === 0 || y === 0 || x === COLS - 1 || y === ROWS - 1 ? WALL : PATH)),
  );
  for (const w of walls) grid[w.y][w.x] = WALL;
  return grid;
}

/** すべて壁で、paths に挙げたマスだけ通路の盤面 */
export function closedGrid(paths: Point[]): Grid {
  const grid: Grid = Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => WALL));
  for (const p of paths) grid[p.y][p.x] = PATH;
  return grid;
}
