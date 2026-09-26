import { describe, expect, it } from 'vitest';
import { COLS, PLAYER_START, PORTAL_POS, ROWS } from '../../src/core/config';
import { generateMaze, PATH, WALL, type Grid } from '../../src/core/maze';
import { createRng } from '../../src/core/rng';

// 迷路の性質は乱数に左右されないはずなので、多くのシードでまとめて確かめる
const SEEDS = Array.from({ length: 300 }, (_, i) => i * 2654435761);
const mazes: ReadonlyArray<readonly [number, Grid]> = SEEDS.map((seed) => [seed, generateMaze(createRng(seed))]);

const DIRS = [
  { x: 0, y: -1 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
  { x: 1, y: 0 },
] as const;

function forEachCell(fn: (x: number, y: number) => void): void {
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      fn(x, y);
    }
  }
}

function countPaths(grid: Grid): number {
  let count = 0;
  forEachCell((x, y) => {
    if (grid[y][x] === PATH) count++;
  });
  return count;
}

/** (sx, sy) から通路だけをたどって行けるマス数 */
function countReachable(grid: Grid, sx: number, sy: number): number {
  const seen = new Set<string>([`${sx},${sy}`]);
  const queue: Array<[number, number]> = [[sx, sy]];
  while (queue.length > 0) {
    const [x, y] = queue.shift()!;
    for (const d of DIRS) {
      const nx = x + d.x;
      const ny = y + d.y;
      const key = `${nx},${ny}`;
      if (grid[ny]?.[nx] === PATH && !seen.has(key)) {
        seen.add(key);
        queue.push([nx, ny]);
      }
    }
  }
  return seen.size;
}

/** (sx, sy) から、skip のマスを通らずにたどれる通路マス数 */
function countReachableWithout(grid: Grid, sx: number, sy: number, skip: string): number {
  const seen = new Set<string>([`${sx},${sy}`]);
  const queue: Array<[number, number]> = [[sx, sy]];
  while (queue.length > 0) {
    const [x, y] = queue.shift()!;
    for (const d of DIRS) {
      const nx = x + d.x;
      const ny = y + d.y;
      const key = `${nx},${ny}`;
      if (key !== skip && grid[ny]?.[nx] === PATH && !seen.has(key)) {
        seen.add(key);
        queue.push([nx, ny]);
      }
    }
  }
  return seen.size;
}

/** 取り除くと通路が分断される通路マス（切断点）の一覧 */
function cutCells(grid: Grid): string[] {
  const total = countPaths(grid);
  const cuts: string[] = [];
  forEachCell((x, y) => {
    if (grid[y][x] !== PATH) return;
    // 取り除くマス以外から探索を始める
    const start = x === 1 && y === 1 ? [1, 3] : [1, 1];
    if (countReachableWithout(grid, start[0], start[1], `${x},${y}`) !== total - 1) cuts.push(`${x},${y}`);
  });
  return cuts;
}

describe('generateMaze：迷路生成（仕様 6章）', () => {
  it('15×15 のグリッドで、各マスは通路か壁（仕様 2章・3章）', () => {
    for (const [, grid] of mazes) {
      expect(grid).toHaveLength(ROWS);
      for (const row of grid) {
        expect(row).toHaveLength(COLS);
        for (const tile of row) {
          expect([PATH, WALL]).toContain(tile);
        }
      }
    }
  });

  it('外周はすべて壁（仕様 3章・6.1 手順4）', () => {
    for (const [seed, grid] of mazes) {
      forEachCell((x, y) => {
        if (x === 0 || y === 0 || x === COLS - 1 || y === ROWS - 1) {
          expect(grid[y][x], `seed=${seed} (${x},${y})`).toBe(WALL);
        }
      });
    }
  });

  it('奇数×奇数の座標はすべて通路（仕様 6.1 手順2）', () => {
    for (const [seed, grid] of mazes) {
      forEachCell((x, y) => {
        if (x % 2 === 1 && y % 2 === 1) {
          expect(grid[y][x], `seed=${seed} (${x},${y})`).toBe(PATH);
        }
      });
    }
  });

  it('プレイヤー初期位置 (7,13) と中央 (7,7) は通路（仕様 6.1 手順2）', () => {
    for (const [, grid] of mazes) {
      expect(grid[PLAYER_START.y][PLAYER_START.x]).toBe(PATH);
      expect(grid[PORTAL_POS.y][PORTAL_POS.x]).toBe(PATH);
    }
  });

  it('偶数×偶数の座標は常に壁（柱）のまま（仕様 6.2）', () => {
    for (const [seed, grid] of mazes) {
      forEachCell((x, y) => {
        if (x % 2 === 0 && y % 2 === 0) {
          expect(grid[y][x], `seed=${seed} (${x},${y})`).toBe(WALL);
        }
      });
    }
  });

  it('袋小路がない：どの通路マスも上下左右の壁が2つ以下（仕様 6.1 手順3・6.2）', () => {
    for (const [seed, grid] of mazes) {
      forEachCell((x, y) => {
        if (grid[y][x] !== PATH) return;
        const walls = DIRS.filter((d) => grid[y + d.y][x + d.x] === WALL).length;
        expect(walls, `seed=${seed} (${x},${y})`).toBeLessThanOrEqual(2);
      });
    }
  });

  it('すべての通路が連結している（仕様 6.2）', () => {
    for (const [seed, grid] of mazes) {
      expect(countReachable(grid, PLAYER_START.x, PLAYER_START.y), `seed=${seed}`).toBe(countPaths(grid));
    }
  });

  it('1か所でしかつながっていない区画がない：どの通路マスを取り除いても分断されない（仕様 6.1 手順6）', () => {
    // 入口が1つしかない区画に入ると、お化けに入口をふさがれて逃げ道がなくなるため
    for (const [seed, grid] of mazes) {
      expect(cutCells(grid), `seed=${seed}`).toEqual([]);
    }
  });

  it('同じシードなら同じ迷路になる（仕様 15.3）', () => {
    expect(generateMaze(createRng(2024))).toEqual(generateMaze(createRng(2024)));
  });

  it('シードが違えば迷路も変わる（レベルごとにランダム生成、仕様 6章）', () => {
    const distinct = new Set(mazes.map(([, grid]) => JSON.stringify(grid)));
    expect(distinct.size).toBeGreaterThan(SEEDS.length * 0.9);
  });

  it('呼び出しごとに新しいグリッドを返す（前のレベルの迷路を書き換えない）', () => {
    const rng = createRng(1);
    const first = generateMaze(rng);
    const snapshot = JSON.stringify(first);
    generateMaze(rng);
    expect(JSON.stringify(first)).toBe(snapshot);
  });
});
