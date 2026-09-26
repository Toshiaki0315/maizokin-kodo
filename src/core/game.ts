// ゲーム本体：状態遷移・プレイヤー操作・金塊・階段・スコア・残機（仕様 4〜5章、9〜11章、16章）。
// main.ts が固定ステップごとに step() を呼び、外部への要求と描画用の出来事をイベントで受け取る（14.5）。
import { Alien, createAliens } from './alien';
import {
  ACTION_INTERVAL_THRESHOLD_MS,
  COLS,
  DIR_VECTORS,
  INITIAL_LIVES,
  MISS_DURATION_MS,
  MOVE_INTERVAL_THRESHOLD_MS,
  PLAYER_START,
  PORTAL_POS,
  ROWS,
  SCORE_ALIEN_KILLED,
  SCORE_GOLD,
  SCORE_LEVEL_CLEAR,
  SCORE_STAIRS_APPEARED,
  TURN_COOLDOWN_MS,
  goldCount,
  type Dir,
} from './config';
import { Holes } from './holes';
import type { InputSnapshot } from './input';
import { generateMaze, PATH, type Grid } from './maze';
import { shuffle, type Rng } from './rng';

export type GameState = 'START' | 'PLAYING' | 'PAUSED' | 'MISS' | 'LEVEL_CLEAR' | 'GAMEOVER' | 'QUIT_CONFIRM';

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

  private _missElapsedMs = 0;
  /** PAUSED から P で戻る先（16.1） */
  private pauseReturn: 'PLAYING' | 'MISS' = 'PLAYING';
  /** QUIT_CONFIRM に入る前の状態。取り消し時の戻り先を決める（16.1） */
  private quitReturn: GameState = 'START';
  /** 終了を確定したか。確定後は何も受け付けない */
  private quitting = false;
  /** 前回保存したハイスコア。これより増えたときだけ保存する（16.10） */
  private savedHiScore: number;
  /** そのゲームの開始時点のハイスコア。「ハイスコア更新！」の判定に使う（16.10） */
  private gameStartHiScore: number;

  // 移動と掘る・埋めるの連続入力間隔（原作ではグローバル変数、5.3）
  private moveCooldown = 0;
  private actionCooldown = 0;

  constructor(
    private readonly rng: Rng,
    initialHiScore: number,
  ) {
    this.hiScore = initialHiScore;
    this.savedHiScore = initialHiScore;
    this.gameStartHiScore = initialHiScore;
    // 起動時に level 1 を用意し、START 画面の背景に盤面を見せる（4章）
    this.initLevel();
  }

  get state(): GameState {
    return this._state;
  }

  /** そのゲームの開始時点のハイスコアを上回ったか。GAMEOVER の「ハイスコア更新！」に使う（16.10） */
  get newRecord(): boolean {
    return this.hiScore > this.gameStartHiScore;
  }

  /** MISS に入ってからの経過時間。点滅と赤フラッシュの描画に使う（16.5） */
  get missElapsedMs(): number {
    return this._missElapsedMs;
  }

  /** 固定ステップ1回分進める（14.5）。状態に関係なく毎ステップ呼ぶ */
  step(dtMs: number, input: InputSnapshot): GameEvent[] {
    const events: GameEvent[] = [];
    // ESC はどの状態からでも終了確認に入れる（16.3）。QUIT_CONFIRM 中の ESC は取り消し
    if (input.escape && this._state !== 'QUIT_CONFIRM') {
      this.openQuitConfirm();
      return events;
    }
    switch (this._state) {
      case 'START':
        if (input.enter) {
          this.gameStartHiScore = this.hiScore;
          this._state = 'PLAYING';
        }
        break;
      case 'PLAYING':
        if (input.pause) {
          this.pause('PLAYING');
        } else {
          this.update(dtMs, input, events);
        }
        break;
      case 'PAUSED':
        // ロジックは止め、P だけ受け付ける。Enter は無視する（16.2）
        if (input.pause) {
          this._state = this.pauseReturn;
          this.resetInput(events);
        }
        break;
      case 'MISS':
        // P と Enter は無視する（16.5）
        this.updateMiss(dtMs, events);
        break;
      case 'QUIT_CONFIRM':
        this.updateQuitConfirm(input, events);
        break;
      case 'LEVEL_CLEAR':
        // クリアした瞬間の盤面のまま止め、Enter で次の坑道へ（4章）
        if (input.enter) this.nextLevel(events);
        break;
      case 'GAMEOVER':
        // タイトルに戻らず、level 1 の新しいゲームを始める（4章）
        if (input.enter) this.retry(events);
        break;
    }
    this.updateHiScore();
    return events;
  }

  /** ウィンドウのフォーカスが外れた。PLAYING・MISS 中なら PAUSED にする（16.2） */
  focusLost(): void {
    if (this._state === 'PLAYING' || this._state === 'MISS') this.pause(this._state);
  }

  /** ×ボタン・⌘Q。どの状態からでも QUIT_CONFIRM にする（16.3） */
  closeRequested(): void {
    this.openQuitConfirm();
  }

  private pause(from: 'PLAYING' | 'MISS'): void {
    this.pauseReturn = from;
    this._state = 'PAUSED';
  }

  /** QUIT_CONFIRM 中にもう一度来ても、確認画面と取り消し先はそのまま（16.3） */
  private openQuitConfirm(): void {
    if (this._state === 'QUIT_CONFIRM') return;
    this.quitReturn = this._state;
    this._state = 'QUIT_CONFIRM';
  }

  /** Enter で終了を確定し、ESC で取り消す（16.3） */
  private updateQuitConfirm(input: InputSnapshot, events: GameEvent[]): void {
    if (this.quitting) return;
    if (input.enter) {
      this.quitting = true;
      // 保存 → 終了 の順で返す。platform.ts は保存の完了を待ってからウィンドウを破棄する（14.5）
      this.saveHiScoreIfNeeded(events);
      events.push({ type: 'quit' });
    } else if (input.escape) {
      // PLAYING から来たときは、すぐ再開せず PAUSED で止める。ほかは元の状態へ（16.1 の表）
      if (this.quitReturn === 'PLAYING') {
        this.pause('PLAYING');
      } else {
        this._state = this.quitReturn;
      }
    }
  }

  /** PLAYING 中のロジック更新（11章） */
  private update(dt: number, input: InputSnapshot, events: GameEvent[]): void {
    // すれ違いの判定のため、動く前のプレイヤーの位置を記録する（16.14）
    const playerBefore = { x: this.player.x, y: this.player.y };
    this.handleInput(dt, input, events);

    const ctx = {
      grid: this.grid,
      holes: this.holes,
      player: this.player,
      stairsVisible: this.stairs !== null,
    };
    // 手順2：エイリアンを配列順に更新し、1体ごとに直後にミスを判定する
    for (const alien of this.aliens) {
      const before = { x: alien.x, y: alien.y, state: alien.state };
      if (alien.update(dt, ctx) === 'killed') {
        this.score += SCORE_ALIEN_KILLED;
        events.push({ type: 'alienKilled', x: alien.x, y: alien.y, color: alien.color });
      }
      if (this.collides(alien, before, playerBefore)) {
        // ミスしたらそのステップの残り（残りのエイリアン・金塊・階段）を打ち切る（10.1）
        this.startMiss(events);
        return;
      }
    }

    // 手順3：金塊の取得
    for (const gold of this.gold) {
      if (!gold.collected && gold.x === this.player.x && gold.y === this.player.y) {
        gold.collected = true;
        this.score += SCORE_GOLD;
        events.push({ type: 'goldCollected', x: gold.x, y: gold.y });
      }
    }

    // 手順4：全金塊を取った最初のステップで階段を出す（1レベル1回）
    if (this.stairs === null && this.gold.length > 0 && this.gold.every((g) => g.collected)) {
      this.stairs = { x: PORTAL_POS.x, y: PORTAL_POS.y };
      this.score += SCORE_STAIRS_APPEARED;
      events.push({ type: 'stairsAppeared' });
    }

    // 手順5：階段に乗ったらクリア
    if (this.stairs !== null && this.player.x === this.stairs.x && this.player.y === this.stairs.y) {
      this._state = 'LEVEL_CLEAR';
      this.score += SCORE_LEVEL_CLEAR;
      this.saveHiScoreIfNeeded(events);
    }
  }

  /**
   * 歩いているエイリアンとぶつかったか（10.1・16.14）。
   * 同じマスにいるか、同じステップで互いのマスへ入れ替わったらぶつかったとする。
   * 出現した瞬間（出現待ちから歩行になったステップ）は移動ではないので、入れ替わりは判定しない
   */
  private collides(
    alien: Alien,
    before: { x: number; y: number; state: Alien['state'] },
    playerBefore: { x: number; y: number },
  ): boolean {
    if (alien.state !== 'WALKING') return false;
    const { player } = this;
    if (alien.x === player.x && alien.y === player.y) return true;
    return (
      before.state === 'WALKING' &&
      alien.x === playerBefore.x &&
      alien.y === playerBefore.y &&
      player.x === before.x &&
      player.y === before.y
    );
  }

  /** ミスした瞬間に残機を減らし、MISS に入る（16.5） */
  private startMiss(events: GameEvent[]): void {
    events.push({ type: 'miss' });
    this.lives -= 1;
    this._missElapsedMs = 0;
    this._state = 'MISS';
  }

  /** MISS 中はロジックを止め、経過時間だけ数える。1500ms で再開かゲームオーバー（16.5） */
  private updateMiss(dt: number, events: GameEvent[]): void {
    this._missElapsedMs += dt;
    if (this._missElapsedMs < MISS_DURATION_MS) return;
    if (this.lives > 0) {
      this.restartLife();
      this.resetInput(events);
      this._state = 'PLAYING';
    } else {
      this._state = 'GAMEOVER';
      this.saveHiScoreIfNeeded(events);
    }
  }

  /** ゲームオーバーからのリトライ（4章）。ハイスコアは戻さない（16.10） */
  private retry(events: GameEvent[]): void {
    this.score = 0;
    this.lives = INITIAL_LIVES;
    this.level = 1;
    this.gameStartHiScore = this.hiScore;
    this.initLevel();
    this.resetInput(events);
    this._state = 'PLAYING';
  }

  /** スコアがハイスコアを上回ったら、ハイスコアをスコアと同じ値にする（16.10） */
  private updateHiScore(): void {
    if (this.score > this.hiScore) this.hiScore = this.score;
  }

  /** 前回保存した値から増えていれば保存を依頼する（16.10） */
  private saveHiScoreIfNeeded(events: GameEvent[]): void {
    this.updateHiScore();
    if (this.hiScore > this.savedHiScore) {
      this.savedHiScore = this.hiScore;
      events.push({ type: 'saveHiScore', value: this.hiScore });
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
  private handleInput(dt: number, input: InputSnapshot, events: GameEvent[]): void {
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
            const before = this.holes.stageAt(tx, ty);
            // stage 3 で深さが変わらなくてもクールダウンは付く。イベントは深くなったときだけ返す
            if (this.holes.dig(tx, ty) > before) events.push({ type: 'holeDug', x: tx, y: ty });
            this.actionCooldown = ACTION_INTERVAL_THRESHOLD_MS;
          } else if (this.holes.fill(tx, ty)) {
            // 穴がなければ何もせず、クールダウンも付けない
            events.push({ type: 'holeFilled', x: tx, y: ty });
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
