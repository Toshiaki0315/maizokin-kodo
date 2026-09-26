// ゲーム全体の定数（仕様 2章）。値はここに集約し、ほかのモジュールで直接書かない。
// 時間の単位はすべてミリ秒。

/** マス単位の座標。x=列、y=行（仕様 3章） */
export interface Point {
  readonly x: number;
  readonly y: number;
}

/** 向き（仕様 5.2・14.5） */
export type Dir = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT';

// ---- 盤面と画面（仕様 2章・3章・16.4） ----

/** グリッドの列数（原作 COLS） */
export const COLS = 15;
/** グリッドの行数（原作 ROWS） */
export const ROWS = 15;
/** 1マスの描画サイズ（論理px、原作 TILE_SIZE） */
export const TILE_SIZE = 40;

/** 論理解像度の幅。ステータス帯と盤面で共通 */
export const CANVAS_WIDTH = 600;
/** 論理解像度の高さ。上がステータス帯、下が盤面 */
export const CANVAS_HEIGHT = 640;
/** 画面上端のステータス帯の高さ */
export const STATUS_BAR_HEIGHT = 40;
/** 盤面の幅（マス数×マスの大きさ） */
export const BOARD_WIDTH = COLS * TILE_SIZE;
/** 盤面の高さ（マス数×マスの大きさ） */
export const BOARD_HEIGHT = ROWS * TILE_SIZE;

/** 表示倍率。600×640 を 900×960 で表示する（デスクトップ版、16.4） */
export const DISPLAY_SCALE = 1.5;

// ---- 位置（仕様 2章） ----

/** プレイヤー初期位置。ミス後もここに戻る */
export const PLAYER_START: Point = Object.freeze({ x: 7, y: 13 });
/** ポータル／階段の位置。盤面中央で、エイリアンの出現点でもある */
export const PORTAL_POS: Point = Object.freeze({ x: 7, y: 7 });

// ---- 方向（仕様 3章・5.3・8.4） ----

/** 4方向。原作の方向配列と同じ順にし、乱数で方向を選ぶときの順序を原作とそろえる */
export const DIRS: readonly Dir[] = ['UP', 'DOWN', 'LEFT', 'RIGHT'];
/** 方向ごとの1マスの移動量。x は右が正、y は下が正（3章） */
export const DIR_VECTORS: Readonly<Record<Dir, Point>> = {
  UP: { x: 0, y: -1 },
  DOWN: { x: 0, y: 1 },
  LEFT: { x: -1, y: 0 },
  RIGHT: { x: 1, y: 0 },
};
/** 逆方向。エイリアンの逆走防止に使う（8.4） */
export const OPPOSITE_DIR: Readonly<Record<Dir, Dir>> = {
  UP: 'DOWN',
  DOWN: 'UP',
  LEFT: 'RIGHT',
  RIGHT: 'LEFT',
};

// ---- プレイヤー操作（仕様 2章・5章） ----

/** 移動の連続入力間隔（原作 moveIntervalThreshold） */
export const MOVE_INTERVAL_THRESHOLD_MS = 180;
/** 向き変更直後の移動禁止時間（原作 turnCooldown） */
export const TURN_COOLDOWN_MS = 150;
/** 掘る／埋めるの連続入力間隔（原作 actionIntervalThreshold） */
export const ACTION_INTERVAL_THRESHOLD_MS = 200;
/** 歩行アニメの切り替え間隔（2フレーム交互） */
export const WALK_ANIM_INTERVAL_MS = 150;

// ---- エイリアン（仕様 2章・8章・16.17） ----

/** 穴に落ちてから自力で脱出するまでの時間（原作 trapTimer） */
export const TRAP_DURATION_MS = 5000;
/** 撃破から再出現までの時間 */
export const RESPAWN_DELAY_MS = 15000;
/** 出現前にポータルを表示する時間（原作 portalTimer の前半） */
export const PORTAL_PRE_SPAWN_MS = 1000;
/** 出現後もポータルを表示し続ける時間（原作 portalTimer の後半） */
export const PORTAL_POST_SPAWN_MS = 1000;
/** 初回出現遅延の単位。i 番目のエイリアンは (i+1) 倍待つ */
const INITIAL_SPAWN_DELAY_UNIT_MS = 1000;

/** レベル1の移動間隔（原作は全レベルこの値、原作 moveInterval） */
export const ALIEN_BASE_MOVE_INTERVAL_MS = 450;
/** レベルが1上がるごとに短くする量（16.17） */
export const ALIEN_MOVE_INTERVAL_STEP_MS = 20;
/** 移動間隔の下限。プレイヤーの 180ms より遅く保ち、逃げ切れる余地を残す（16.17） */
export const ALIEN_MIN_MOVE_INTERVAL_MS = 250;
/** エイリアン数の上限。原作は上限なし（13.1 #4 で最大5体を採用） */
export const MAX_ALIENS = 5;
/** エイリアンの色。i 番目は i % 5 で循環する（8.1） */
export const ALIEN_COLORS: readonly string[] = ['#FF3333', '#3388FF', '#FFFF33', '#33FF33', '#CC33FF'];

/** i 番目（0始まり）のエイリアンの初回出現遅延（仕様 2章） */
export function initialSpawnDelay(index: number): number {
  return (index + 1) * INITIAL_SPAWN_DELAY_UNIT_MS;
}

/**
 * レベルに応じたエイリアンの移動間隔（仕様 16.17）。
 * エイリアン数が5体で頭打ちになる代わりに、レベルが上がるほど速くして難しさを上げる
 */
export function alienMoveInterval(level: number): number {
  return Math.max(
    ALIEN_MIN_MOVE_INTERVAL_MS,
    ALIEN_BASE_MOVE_INTERVAL_MS - ALIEN_MOVE_INTERVAL_STEP_MS * (level - 1),
  );
}

/** レベルに応じたエイリアン数。原作の 2 + level に上限を付ける（仕様 2章・13.1 #4） */
export function alienCount(level: number): number {
  return Math.min(2 + level, MAX_ALIENS);
}

// ---- 穴・残機・スコア・金塊（仕様 2章） ----

/** 穴の最大深さ（stage 1〜3）。この深さでエイリアンを捕獲できる */
export const HOLE_MAX_STAGE = 3;
/** 初期残機（エクステンドなし） */
export const INITIAL_LIVES = 3;
/** 保存データがないときのハイスコア（原作で宣言だけされていた hiScore、16.10） */
export const INITIAL_HI_SCORE = 5000;

/**
 * レベルに応じた金塊数（仕様 2章）。
 * 配置できる通路マス数を超える分は置かない（13.1 #3）が、それは迷路に依存するため配置側で扱う
 */
export function goldCount(level: number): number {
  return 5 + level * 2;
}

// ---- スコア（仕様 10.2） ----

/** エイリアンを倒した */
export const SCORE_ALIEN_KILLED = 100;
/** 金塊を1個取った */
export const SCORE_GOLD = 200;
/** 金塊をすべて取って階段が出た（1レベル1回） */
export const SCORE_STAIRS_APPEARED = 500;
/** 階段に着いてレベルクリア */
export const SCORE_LEVEL_CLEAR = 1000;

// ---- ループとミス演出（デスクトップ版、仕様 2章・14.3・16.5） ----

/** ロジック更新の固定タイムステップ（1/60 秒） */
export const FIXED_STEP_MS = 1000 / 60;
/** 1フレームで消化するステップ数の上限。超えた経過時間は切り捨てる（13.1 #2 の対策） */
export const MAX_STEPS_PER_FRAME = 5;
/** MISS 状態の長さ */
export const MISS_DURATION_MS = 1500;
/** ミス演出中のプレイヤーの表示・非表示の切り替え間隔 */
export const MISS_BLINK_INTERVAL_MS = 100;
/** ミス演出開始時の赤フラッシュが消えるまでの時間 */
export const MISS_FLASH_MS = 300;
/** 赤フラッシュの開始時の不透明度 */
export const MISS_FLASH_ALPHA = 0.35;
