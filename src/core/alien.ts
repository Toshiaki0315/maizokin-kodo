// エイリアンの状態・タイマー・移動AI（仕様 8章、16.13、16.17）。
// 乱数は注入された Rng を使い、スコアの加算と撃破イベントは update() の戻り値を受けた game.ts が行う（14.5）。
import {
  ALIEN_COLORS,
  COLS,
  DIR_VECTORS,
  DIRS,
  OPPOSITE_DIR,
  PORTAL_POS,
  PORTAL_POST_SPAWN_MS,
  PORTAL_PRE_SPAWN_MS,
  RESPAWN_DELAY_MS,
  ROWS,
  TRAP_DURATION_MS,
  alienCount,
  alienMoveInterval,
  initialSpawnDelay,
  type Dir,
  type Point,
} from './config';
import type { Holes } from './holes';
import { PATH, type Grid } from './maze';
import { randomInt, type Rng } from './rng';

export type AlienState = 'WAITING_SPAWN' | 'WALKING' | 'TRAPPED' | 'DEAD';

/** update() が参照する盤面の状態 */
export interface AlienContext {
  readonly grid: Grid;
  readonly holes: Holes;
  readonly player: Point;
  /** 階段が出ているか。出ている間は出現しない（16.13） */
  readonly stairsVisible: boolean;
  /** 同じ盤面のお化け全員（自分を含む）。ほかのお化けと重ならないように使う（8.4） */
  readonly aliens: readonly Alien[];
}

/** update() で起きたこと。撃破したときだけ 'killed' を返す */
export type AlienUpdateResult = 'killed' | null;

export class Alien {
  x: number = PORTAL_POS.x;
  y: number = PORTAL_POS.y;
  state: AlienState;
  /** 前回の移動方向。逆走防止に使う（8.2） */
  dir: Dir;
  /** 出現までの残り時間 */
  respawnTimer: number;
  /** 出現後のポータル表示の残り時間 */
  portalTimer: number = PORTAL_POST_SPAWN_MS;
  /** 捕獲状態の残り時間 */
  trapTimer = 0;
  moveTimer = 0;

  constructor(
    private readonly rng: Rng,
    spawnDelayMs: number,
    readonly color: string,
    /** 移動間隔。生成時のレベルで決め、レベル中は変えない（16.17） */
    readonly moveInterval: number,
  ) {
    this.dir = this.randomDir();
    if (spawnDelayMs > 0) {
      this.state = 'WAITING_SPAWN';
      this.respawnTimer = spawnDelayMs;
    } else {
      this.state = 'WALKING';
      this.respawnTimer = 0;
    }
  }

  /** 1ステップ分進める（8.3）。撃破されたステップだけ 'killed' を返す */
  update(dt: number, ctx: AlienContext): AlienUpdateResult {
    // 手順1：出現待ち。階段が出ている間は出現せず、残り時間も進めない（16.13）
    if (this.state === 'WAITING_SPAWN') {
      if (ctx.stairsVisible) return null;
      this.respawnTimer -= dt;
      // ポータルにほかのお化けがいる間は、重ならないようにどくまで待つ（デスクトップ版で追加）
      if (this.respawnTimer <= 0 && !this.isOccupied(PORTAL_POS.x, PORTAL_POS.y, ctx)) this.spawn();
      // 出現したステップは動かない
      return null;
    }

    // 手順2
    if (this.portalTimer > 0) this.portalTimer -= dt;

    // 手順3：DEAD は1ステップだけの遷移状態
    if (this.state === 'DEAD') {
      this.state = 'WAITING_SPAWN';
      this.respawnTimer = RESPAWN_DELAY_MS;
      this.portalTimer = PORTAL_POST_SPAWN_MS;
      return null;
    }

    // 手順4：捕獲中。埋め切られたかを脱出より先に判定する
    if (this.state === 'TRAPPED') {
      this.trapTimer -= dt;
      if (!ctx.holes.has(this.x, this.y)) {
        this.state = 'DEAD';
        return 'killed';
      }
      if (this.trapTimer <= 0) {
        this.state = 'WALKING';
        ctx.holes.remove(this.x, this.y);
      }
      return null;
    }

    // 手順5：歩行。移動したら余った時間は捨てる
    this.moveTimer += dt;
    if (this.moveTimer >= this.moveInterval) {
      this.moveTimer = 0;
      this.decideMove(ctx);
    }
    return null;
  }

  private spawn(): void {
    this.x = PORTAL_POS.x;
    this.y = PORTAL_POS.y;
    this.state = 'WALKING';
    this.trapTimer = 0;
    this.portalTimer = PORTAL_POST_SPAWN_MS;
    this.dir = this.randomDir();
  }

  /** 移動AI（8.4） */
  private decideMove(ctx: AlienContext): void {
    const targetDir = this.chaseDir(ctx);
    const validDirs = DIRS.filter((d) => {
      const nx = this.x + DIR_VECTORS[d].x;
      const ny = this.y + DIR_VECTORS[d].y;
      // ほかのお化けがいるマスには進まない（デスクトップ版で追加）。行き場がなければとどまる
      return (
        nx >= 0 && nx < COLS && ny >= 0 && ny < ROWS && ctx.grid[ny][nx] === PATH && !this.isOccupied(nx, ny, ctx)
      );
    });
    if (validDirs.length === 0) return;

    let chosen: Dir;
    if (targetDir !== null && validDirs.includes(targetDir)) {
      chosen = targetDir;
    } else {
      // 逆走を除いた中から一様に選ぶ。行き止まりで候補がなくなったら逆走も含めて選ぶ
      const nonReverse = validDirs.filter((d) => d !== OPPOSITE_DIR[this.dir]);
      const candidates = nonReverse.length > 0 ? nonReverse : validDirs;
      chosen = candidates[randomInt(this.rng, candidates.length)];
    }

    this.dir = chosen;
    this.x += DIR_VECTORS[chosen].x;
    this.y += DIR_VECTORS[chosen].y;

    // 捕獲は stage 3 の穴に入った瞬間だけ判定する（7章）
    if (ctx.holes.stageAt(this.x, this.y) === 3) {
      this.state = 'TRAPPED';
      this.trapTimer = TRAP_DURATION_MS;
    }
  }

  /**
   * プレイヤーと同じ列・行にいて、間（両端を除く）に壁がなければプレイヤーの方向を返す（8.4 手順1）。
   * 穴や他のエイリアンは視線を遮らない。同じマスにいるときは列の判定が先に当たり UP になる
   */
  private chaseDir(ctx: AlienContext): Dir | null {
    const { player, grid } = ctx;
    if (this.x === player.x) {
      const from = Math.min(this.y, player.y);
      const to = Math.max(this.y, player.y);
      for (let y = from + 1; y < to; y++) {
        if (grid[y][this.x] !== PATH) return null;
      }
      return player.y > this.y ? 'DOWN' : 'UP';
    }
    if (this.y === player.y) {
      const from = Math.min(this.x, player.x);
      const to = Math.max(this.x, player.x);
      for (let x = from + 1; x < to; x++) {
        if (grid[this.y][x] !== PATH) return null;
      }
      return player.x > this.x ? 'RIGHT' : 'LEFT';
    }
    return null;
  }

  /**
   * ほかのお化けが (x, y) にいるか。見えているお化け（歩行中・捕獲中）だけを数える。
   * お化けは1体ずつ順に動くので、同じステップで先に動いたお化けの新しい位置も避けられる
   */
  private isOccupied(x: number, y: number, ctx: AlienContext): boolean {
    return ctx.aliens.some(
      (other) => other !== this && (other.state === 'WALKING' || other.state === 'TRAPPED') && other.x === x && other.y === y,
    );
  }

  private randomDir(): Dir {
    return DIRS[randomInt(this.rng, DIRS.length)];
  }
}

/** レベルに応じてエイリアンを作り直す（原作 restartLife() のエイリアン部分、8.1・16.17） */
export function createAliens(level: number, rng: Rng): Alien[] {
  const interval = alienMoveInterval(level);
  return Array.from(
    { length: alienCount(level) },
    (_, i) => new Alien(rng, initialSpawnDelay(i), ALIEN_COLORS[i % ALIEN_COLORS.length], interval),
  );
}

/**
 * ポータルを表示するか（12.3）。いずれかのエイリアンが出現 1000ms 前から出現後 1000ms の間なら表示する。
 * 階段が出ている間は表示しない（16.13）
 */
export function isPortalShown(aliens: readonly Alien[], stairsVisible: boolean): boolean {
  if (stairsVisible) return false;
  return aliens.some(
    (a) =>
      (a.state === 'WAITING_SPAWN' && a.respawnTimer <= PORTAL_PRE_SPAWN_MS) ||
      (a.state === 'WALKING' && a.portalTimer > 0),
  );
}
