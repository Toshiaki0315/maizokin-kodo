// ゲーム本体：状態遷移・プレイヤー操作・金塊・階段・スコア・残機（仕様 4〜5章、9〜11章、16章）。
// main.ts が固定ステップごとに step() を呼び、外部への要求と描画用の出来事をイベントで受け取る（14.5）。
import { Alien, createAliens } from './alien';
import {
  ACTION_INTERVAL_THRESHOLD_MS,
  COLS,
  DIR_VECTORS,
  INITIAL_LIVES,
  MOVE_INTERVAL_THRESHOLD_MS,
  PLAYER_START,
  PORTAL_POS,
  ROWS,
  TURN_COOLDOWN_MS,
  goldCount,
  type Dir,
} from './config';
import { Holes } from './holes';
import type { InputSnapshot } from './input';
import { generateMaze, PATH, type Grid } from './maze';
import { shuffle, type Rng } from './rng';

export type GameState = 'START' | 'PLAYING' | 'LEVEL_CLEAR' | 'GAMEOVER';

/** step() が返すイベント（14.5） */
export type GameEvent =
  // 外部への要求
  | { type: 'inputReset' }
  | { type: 'saveHiScore'; value: number }
  | { type: 'quit' }
  // 描画側への通知（エフェクト用、16.15）
  | { type: 'goldCollected'; x: number; y: number }
  | { type: 'holeDug'; x: number; y: number }
  | { type: 'holeFilled'; x: number; y: number }
  | { type: 'alienKilled'; x: number; y: number; color: string }
  | { type: 'stairsAppeared' }
  | { type: 'miss' };

export interface Player {
  x: number;
  y: number;
  /** 論理的な向き（掘る・埋める対象の方向） */
  dir: Dir;
  /** 見た目の左右。左右キーの入力でだけ変わる（5.2） */
  faceDir: 'LEFT' | 'RIGHT';
  /** 向き変更後の移動禁止の残り時間 */
  turnCooldown: number;
  /** 歩行アニメを再生するか */
  isMoving: boolean;
}

export interface Gold {
  x: number;
  y: number;
  collected: boolean;
}

/**
 * 金塊を置く（9.1 手順4）。原作は条件を満たすまで無限に再抽選するため、通路マスが足りないとハングする。
 * 通路マスのリストをシャッフルして先頭から取り、置ききれない分は置かない（13.1 #3）
 */
export function placeGold(grid: Grid, count: number, rng: Rng): Gold[] {
  const candidates: Array<{ x: number; y: number }> = [];
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      if (grid[y][x] !== PATH) continue;
      if (x === PLAYER_START.x && y === PLAYER_START.y) continue;
      if (x === PORTAL_POS.x && y === PORTAL_POS.y) continue;
      candidates.push({ x, y });
    }
  }
  return shuffle(rng, candidates)
    .slice(0, count)
    .map(({ x, y }) => ({ x, y, collected: false }));
}

export class Game {
  private _state: GameState = 'START';
  score = 0;
  hiScore: number;
  lives = INITIAL_LIVES;
  level = 1;

  // 描画とテストのために公開する。描画側は読むだけにする（15.5 #4）
  grid: Grid = [];
  holes = new Holes();
  gold: Gold[] = [];
  aliens: Alien[] = [];
  /** 階段の位置。金塊をすべて取るまでは null */
  stairs: { x: number; y: number } | null = null;
  player: Player = Game.initialPlayer();

  // 移動と掘る・埋めるの連続入力間隔（原作ではグローバル変数、5.3）
  private moveCooldown = 0;
  private actionCooldown = 0;

  constructor(
    private readonly rng: Rng,
    initialHiScore: number,
  ) {
    this.hiScore = initialHiScore;
    // 起動時に level 1 を用意し、START 画面の背景に盤面を見せる（4章）
    this.initLevel();
  }

  get state(): GameState {
    return this._state;
  }

  /** 固定ステップ1回分進める（14.5）。状態に関係なく毎ステップ呼ぶ */
  step(dtMs: number, input: InputSnapshot): GameEvent[] {
    const events: GameEvent[] = [];
    switch (this._state) {
      case 'START':
        if (input.enter) this._state = 'PLAYING';
        break;
      case 'PLAYING':
        this.update(dtMs, input, events);
        break;
      case 'LEVEL_CLEAR':
        // クリアした瞬間の盤面のまま止め、Enter で次の坑道へ（4章）
        if (input.enter) this.nextLevel(events);
        break;
      default:
        break;
    }
    return events;
  }

  /** PLAYING 中のロジック更新（11章） */
  private update(dt: number, input: InputSnapshot, _events: GameEvent[]): void {
    this.handleInput(dt, input);

    const ctx = {
      grid: this.grid,
      holes: this.holes,
      player: this.player,
      stairsVisible: this.stairs !== null,
    };
    for (const alien of this.aliens) {
      alien.update(dt, ctx);
    }

    // 手順3：金塊の取得
    for (const gold of this.gold) {
      if (!gold.collected && gold.x === this.player.x && gold.y === this.player.y) {
        gold.collected = true;
        this.score += 200;
      }
    }

    // 手順4：全金塊を取った最初のステップで階段を出す（1レベル1回）
    if (this.stairs === null && this.gold.length > 0 && this.gold.every((g) => g.collected)) {
      this.stairs = { x: PORTAL_POS.x, y: PORTAL_POS.y };
      this.score += 500;
    }

    // 手順5：階段に乗ったらクリア
    if (this.stairs !== null && this.player.x === this.stairs.x && this.player.y === this.stairs.y) {
      this._state = 'LEVEL_CLEAR';
      this.score += 1000;
    }
  }

  /** 次の坑道へ（9.3）。スコアと残機は引き継ぐ */
  private nextLevel(events: GameEvent[]): void {
    this.level += 1;
    this.initLevel();
    this.resetInput(events);
    this._state = 'PLAYING';
  }

  /**
   * 入力リセット（16.7）。クールダウンをゲーム側で戻し、キーの押下状態は input.ts に依頼する。
   * 原作は状態遷移のときにリセットしない（13.1 #9）
   */
  private resetInput(events: GameEvent[]): void {
    this.moveCooldown = 0;
    this.actionCooldown = 0;
    this.player.turnCooldown = 0;
    events.push({ type: 'inputReset' });
  }

  /** プレイヤーの移動・掘る・埋める（5.3） */
  private handleInput(dt: number, input: InputSnapshot): void {
    const player = this.player;
    const inputDir = input.dir;
    player.isMoving = inputDir !== null;
    if (inputDir === 'LEFT' || inputDir === 'RIGHT') player.faceDir = inputDir;

    if (this.moveCooldown > 0) this.moveCooldown -= dt;
    if (this.actionCooldown > 0) this.actionCooldown -= dt;
    if (player.turnCooldown > 0) player.turnCooldown -= dt;

    // 手順5：Z・X はアクション優先。方向入力は向きを変えるだけで、このステップは移動しない
    if (input.dig || input.fill) {
      if (inputDir !== null) player.dir = inputDir;
      if (this.actionCooldown <= 0) {
        const tx = player.x + DIR_VECTORS[player.dir].x;
        const ty = player.y + DIR_VECTORS[player.dir].y;
        // 前方が壁・盤面外なら何もせず、クールダウンも付けない
        if (this.isPath(tx, ty)) {
          if (input.dig) {
            this.holes.dig(tx, ty);
            this.actionCooldown = ACTION_INTERVAL_THRESHOLD_MS;
          } else if (this.holes.fill(tx, ty)) {
            // 穴がなければ何もせず、クールダウンも付けない
            this.actionCooldown = ACTION_INTERVAL_THRESHOLD_MS;
          }
        }
      }
      player.isMoving = false;
      return;
    }

    // 手順7：方向入力なし。離すと移動のクールダウンを戻すので、タップですぐ進める（5.4）
    if (inputDir === null) {
      this.moveCooldown = 0;
      return;
    }

    // 手順6-1：違う方向なら向きを変えるだけ
    if (player.dir !== inputDir) {
      player.dir = inputDir;
      player.turnCooldown = TURN_COOLDOWN_MS;
      this.moveCooldown = MOVE_INTERVAL_THRESHOLD_MS;
      return;
    }

    // 手順6-2：穴のある通路には、深さに関係なく入れない（5.4）。進めないときはクールダウンを付けない
    if (this.moveCooldown <= 0 && player.turnCooldown <= 0) {
      const nx = player.x + DIR_VECTORS[inputDir].x;
      const ny = player.y + DIR_VECTORS[inputDir].y;
      if (this.isPath(nx, ny) && !this.holes.has(nx, ny)) {
        player.x = nx;
        player.y = ny;
        this.moveCooldown = MOVE_INTERVAL_THRESHOLD_MS;
      }
    }
  }

  /** 盤面内の通路か */
  private isPath(x: number, y: number): boolean {
    return x >= 0 && x < COLS && y >= 0 && y < ROWS && this.grid[y][x] === PATH;
  }

  /** レベル開始（9.1 の順）。迷路 → プレイヤーとエイリアン → 穴と階段 → 金塊 */
  private initLevel(): void {
    this.grid = generateMaze(this.rng);
    this.restartLife();
    this.holes.clear();
    this.stairs = null;
    this.gold = placeGold(this.grid, goldCount(this.level), this.rng);
  }

  /** プレイヤーを初期位置に戻し、エイリアンを作り直す（10.1）。迷路・穴・金塊・階段はそのまま */
  private restartLife(): void {
    this.player = Game.initialPlayer();
    this.aliens = createAliens(this.level, this.rng);
  }

  private static initialPlayer(): Player {
    return {
      x: PLAYER_START.x,
      y: PLAYER_START.y,
      dir: 'UP',
      faceDir: 'RIGHT',
      turnCooldown: 0,
      isMoving: false,
    };
  }
}
