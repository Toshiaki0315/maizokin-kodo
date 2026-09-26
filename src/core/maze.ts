// 迷路生成（仕様 6章）。穴掘り法で完全迷路を作り、行き止まりがなくなるまで壁を壊して
// 袋小路のないループ迷路にする。乱数は注入された Rng だけを使う（15.5）。
import { COLS, ROWS, type Point } from './config';
import { randomInt, shuffle, type Rng } from './rng';

/** 通路 */
export const PATH = 0;
/** 壁 */
export const WALL = 1;
export type Tile = typeof PATH | typeof WALL;
/** 盤面。grid[y][x] で引く（仕様 3章） */
export type Grid = Tile[][];

/** 穴掘り法で2マス先へ進む方向（仕様 6.1 手順2） */
const CARVE_STEPS = [
  { x: 0, y: -2 },
  { x: 0, y: 2 },
  { x: -2, y: 0 },
  { x: 2, y: 0 },
] as const;

/** 行き止まり判定で調べる上下左右（仕様 6.1 手順3） */
const NEIGHBORS = [
  { x: 0, y: -1 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
  { x: 1, y: 0 },
] as const;

/** 外周を除く内側のマスか */
function isInner(x: number, y: number): boolean {
  return x > 0 && x < COLS - 1 && y > 0 && y < ROWS - 1;
}

/** ループ迷路を新しく作って返す（原作 generateLoopMaze()） */
export function generateMaze(rng: Rng): Grid {
  // 手順1：すべて壁で初期化
  const grid: Grid = Array.from({ length: ROWS }, () => Array<Tile>(COLS).fill(WALL));
  const visited = Array.from({ length: ROWS }, () => Array<boolean>(COLS).fill(false));

  // 手順2：(1,1) から穴掘り法。方向は Fisher–Yates で並べる（13.1 #12）。
  // 内側の奇数マスは 7×7=49 個なので、再帰の深さは問題にならない
  const carve = (cx: number, cy: number): void => {
    visited[cy][cx] = true;
    grid[cy][cx] = PATH;
    for (const d of shuffle(rng, CARVE_STEPS)) {
      const nx = cx + d.x;
      const ny = cy + d.y;
      if (isInner(nx, ny) && !visited[ny][nx]) {
        grid[cy + d.y / 2][cx + d.x / 2] = PATH;
        carve(nx, ny);
      }
    }
  };
  carve(1, 1);

  // 手順3：行き止まりが1つも見つからない1周まで繰り返す。
  // 原作どおり1周の中で即座に書き換えるため、同じ周の後続マスの判定にも影響する
  let deadEndFound = true;
  while (deadEndFound) {
    deadEndFound = false;
    for (let y = 1; y < ROWS - 1; y++) {
      for (let x = 1; x < COLS - 1; x++) {
        if (grid[y][x] !== PATH) continue;
        let wallCount = 0;
        const candidates: Array<{ x: number; y: number }> = [];
        for (const d of NEIGHBORS) {
          const tx = x + d.x;
          const ty = y + d.y;
          if (grid[ty][tx] === WALL) {
            wallCount++;
            if (isInner(tx, ty)) candidates.push({ x: tx, y: ty });
          }
        }
        if (wallCount >= 3) {
          deadEndFound = true;
          // 外周の壁はマスごとに最大2つなので、壁が3つ以上なら内側の候補は必ず1つ以上ある
          const target = candidates[randomInt(rng, candidates.length)];
          grid[target.y][target.x] = PATH;
        }
      }
    }
  }

  // 手順6（デスクトップ版で追加）：1か所でしかつながっていない区画をなくす
  removeCutCells(grid, rng);

  // 原作の手順4（外周を壁に戻す）と手順5（(7,7) を通路に戻す）は、実際には何も変えない処理のため移植しない（13.1 #11）
  return grid;
}

/** 壊すのを試す回数の上限。通常は数十回で終わる。万一終わらなくても迷路として使えるよう、打ち切る */
const MAX_CUT_REPAIRS = 200;

/**
 * 取り除くと通路が分断される通路マス（切断点）がなくなるまで、壁を壊す（6.1 手順6）。
 * 切断点の先の区画は入口が1つしかなく、そこに入るとお化けに入口をふさがれて逃げ道がなくなるため。
 * 区画と外側を直接隔てている「通路と通路の間の壁」を1つ壊して、別の入口を作る。柱（偶数×偶数）は壊さない
 */
function removeCutCells(grid: Grid, rng: Rng): void {
  for (let i = 0; i < MAX_CUT_REPAIRS; i++) {
    const cut = findCutCell(grid);
    if (cut === null) return;
    // 切断点を除いて分かれた区画のうち、いちばん小さいものに別の入口を作る
    const regions = regionsWithout(grid, cut);
    regions.sort((a, b) => a.size - b.size);
    const region = regions[0];
    const candidates: Point[] = [];
    for (let y = 1; y < ROWS - 1; y++) {
      for (let x = 1; x < COLS - 1; x++) {
        if (grid[y][x] !== WALL) continue;
        // 通路と通路の間の壁は、片方の座標だけが偶数。その向かい合う2マスが両側の通路
        const [a, b] =
          x % 2 === 1 && y % 2 === 0
            ? [key(x, y - 1), key(x, y + 1)]
            : x % 2 === 0 && y % 2 === 1
              ? [key(x - 1, y), key(x + 1, y)]
              : [null, null];
        if (a === null || b === null) continue;
        const cutKey = key(cut.x, cut.y);
        if (a === cutKey || b === cutKey) continue;
        if (region.has(a) !== region.has(b)) candidates.push({ x, y });
      }
    }
    if (candidates.length === 0) return;
    const target = candidates[randomInt(rng, candidates.length)];
    grid[target.y][target.x] = PATH;
  }
}

function key(x: number, y: number): string {
  return `${x},${y}`;
}

/** 通路マスを cut を除いてつながりごとに分ける */
function regionsWithout(grid: Grid, cut: Point): Array<Set<string>> {
  const seen = new Set<string>([key(cut.x, cut.y)]);
  const regions: Array<Set<string>> = [];
  for (let y = 1; y < ROWS - 1; y++) {
    for (let x = 1; x < COLS - 1; x++) {
      if (grid[y][x] !== PATH || seen.has(key(x, y))) continue;
      const region = new Set<string>();
      const stack: Point[] = [{ x, y }];
      seen.add(key(x, y));
      while (stack.length > 0) {
        const p = stack.pop()!;
        region.add(key(p.x, p.y));
        for (const d of NEIGHBORS) {
          const nx = p.x + d.x;
          const ny = p.y + d.y;
          if (grid[ny][nx] === PATH && !seen.has(key(nx, ny))) {
            seen.add(key(nx, ny));
            stack.push({ x: nx, y: ny });
          }
        }
      }
      regions.push(region);
    }
  }
  return regions;
}

/** 切断点を1つ返す（左上から順に探す）。なければ null */
function findCutCell(grid: Grid): Point | null {
  for (let y = 1; y < ROWS - 1; y++) {
    for (let x = 1; x < COLS - 1; x++) {
      if (grid[y][x] === PATH && regionsWithout(grid, { x, y }).length > 1) return { x, y };
    }
  }
  return null;
}
