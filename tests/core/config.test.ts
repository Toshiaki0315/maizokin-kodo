import { describe, expect, it } from 'vitest';
import {
  ACTION_INTERVAL_THRESHOLD_MS,
  ALIEN_BASE_MOVE_INTERVAL_MS,
  ALIEN_MIN_MOVE_INTERVAL_MS,
  ALIEN_MOVE_INTERVAL_STEP_MS,
  BOARD_HEIGHT,
  BOARD_WIDTH,
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  ALIEN_COLORS,
  COLS,
  DIRS,
  DIR_VECTORS,
  DISPLAY_SCALE,
  OPPOSITE_DIR,
  FIXED_STEP_MS,
  HOLE_MAX_STAGE,
  INITIAL_HI_SCORE,
  INITIAL_LIVES,
  MAX_ALIENS,
  MAX_STEPS_PER_FRAME,
  MISS_BLINK_INTERVAL_MS,
  MISS_DURATION_MS,
  MISS_FLASH_ALPHA,
  MISS_FLASH_MS,
  MOVE_INTERVAL_THRESHOLD_MS,
  PLAYER_START,
  PORTAL_POS,
  PORTAL_POST_SPAWN_MS,
  PORTAL_PRE_SPAWN_MS,
  RESPAWN_DELAY_MS,
  SCORE_ALIEN_KILLED,
  SCORE_GOLD,
  SCORE_LEVEL_CLEAR,
  SCORE_STAIRS_APPEARED,
  ROWS,
  STATUS_BAR_HEIGHT,
  TILE_SIZE,
  TRAP_DURATION_MS,
  TURN_COOLDOWN_MS,
  WALK_ANIM_INTERVAL_MS,
  alienCount,
  alienMoveInterval,
  goldCount,
  initialSpawnDelay,
} from '../../src/core/config';

describe('config：盤面と画面', () => {
  it('グリッドは 15×15 マス（仕様 2章 COLS / ROWS）', () => {
    expect(COLS).toBe(15);
    expect(ROWS).toBe(15);
  });

  it('1マスは 40px（仕様 2章 TILE_SIZE）', () => {
    expect(TILE_SIZE).toBe(40);
  });

  it('キャンバスは 600×640、上 40px がステータス帯、下 600px が盤面（仕様 2章・3章）', () => {
    expect(CANVAS_WIDTH).toBe(600);
    expect(CANVAS_HEIGHT).toBe(640);
    expect(STATUS_BAR_HEIGHT).toBe(40);
    expect(BOARD_WIDTH).toBe(600);
    expect(BOARD_HEIGHT).toBe(600);
  });

  it('盤面はマス数×マスの大きさで、ステータス帯と合わせてキャンバスの高さになる（仕様 3章）', () => {
    expect(BOARD_WIDTH).toBe(COLS * TILE_SIZE);
    expect(BOARD_HEIGHT).toBe(ROWS * TILE_SIZE);
    expect(STATUS_BAR_HEIGHT + BOARD_HEIGHT).toBe(CANVAS_HEIGHT);
  });

  it('表示倍率は 1.5 で、600×640 を 900×960 で表示する（仕様 2章・16.4）', () => {
    expect(DISPLAY_SCALE).toBe(1.5);
    expect(CANVAS_WIDTH * DISPLAY_SCALE).toBe(900);
    expect(CANVAS_HEIGHT * DISPLAY_SCALE).toBe(960);
  });
});

describe('config：位置', () => {
  it('プレイヤー初期位置は (7, 13)（仕様 2章）', () => {
    expect(PLAYER_START).toEqual({ x: 7, y: 13 });
  });

  it('ポータル／階段位置は盤面中央の (7, 7)（仕様 2章）', () => {
    expect(PORTAL_POS).toEqual({ x: 7, y: 7 });
  });
});

describe('config：プレイヤー操作の時間', () => {
  it('移動の連続入力間隔は 180ms（仕様 2章 moveIntervalThreshold）', () => {
    expect(MOVE_INTERVAL_THRESHOLD_MS).toBe(180);
  });

  it('向き変更直後の移動禁止時間は 150ms（仕様 2章 turnCooldown）', () => {
    expect(TURN_COOLDOWN_MS).toBe(150);
  });

  it('掘る／埋めるの連続入力間隔は 200ms（仕様 2章 actionIntervalThreshold）', () => {
    expect(ACTION_INTERVAL_THRESHOLD_MS).toBe(200);
  });

  it('歩行アニメの切り替えは 150ms（仕様 2章）', () => {
    expect(WALK_ANIM_INTERVAL_MS).toBe(150);
  });
});

describe('config：エイリアンの時間', () => {
  it('捕獲時間は 5000ms（仕様 2章 trapTimer）', () => {
    expect(TRAP_DURATION_MS).toBe(5000);
  });

  it('撃破後の再出現待ちは 15000ms（仕様 2章）', () => {
    expect(RESPAWN_DELAY_MS).toBe(15000);
  });

  it('ポータル表示は出現前 1000ms ＋ 出現後 1000ms（仕様 2章 portalTimer）', () => {
    expect(PORTAL_PRE_SPAWN_MS).toBe(1000);
    expect(PORTAL_POST_SPAWN_MS).toBe(1000);
  });

  it('i 番目（0始まり）のエイリアンの初回出現遅延は (i+1)×1000ms（仕様 2章）', () => {
    expect(initialSpawnDelay(0)).toBe(1000);
    expect(initialSpawnDelay(1)).toBe(2000);
    expect(initialSpawnDelay(4)).toBe(5000);
  });
});

describe('config：レベルによるエイリアンの移動間隔（仕様 16.17）', () => {
  it('基準 450ms、1レベルごとに 20ms 短く、下限 250ms（仕様 2章・16.17）', () => {
    expect(ALIEN_BASE_MOVE_INTERVAL_MS).toBe(450);
    expect(ALIEN_MOVE_INTERVAL_STEP_MS).toBe(20);
    expect(ALIEN_MIN_MOVE_INTERVAL_MS).toBe(250);
  });

  // 仕様 16.17：テストでレベル1・2・11・20の値を確認する
  it.each([
    [1, 450],
    [2, 430],
    [11, 250],
    [20, 250],
  ])('レベル %i は %ims', (level, expected) => {
    expect(alienMoveInterval(level)).toBe(expected);
  });

  it.each([
    [3, 410],
    [5, 370],
    [6, 350],
    [10, 270],
  ])('仕様 16.17 の表：レベル %i は %ims', (level, expected) => {
    expect(alienMoveInterval(level)).toBe(expected);
  });

  it('下限の 250ms はプレイヤーの移動間隔（180ms）より遅い（仕様 16.17）', () => {
    expect(ALIEN_MIN_MOVE_INTERVAL_MS).toBeGreaterThan(MOVE_INTERVAL_THRESHOLD_MS);
  });
});

describe('config：数と上限', () => {
  it('穴の最大深さは 3（仕様 2章）', () => {
    expect(HOLE_MAX_STAGE).toBe(3);
  });

  it('初期残機は 3（仕様 2章 lives）', () => {
    expect(INITIAL_LIVES).toBe(3);
  });

  it('ハイスコアの初期値は 5000（仕様 2章 hiScore・16.10）', () => {
    expect(INITIAL_HI_SCORE).toBe(5000);
  });

  it('エイリアン数は 2 + level、最大 5 体（仕様 2章・13.1 #4）', () => {
    expect(MAX_ALIENS).toBe(5);
    expect(alienCount(1)).toBe(3);
    expect(alienCount(2)).toBe(4);
    expect(alienCount(3)).toBe(5);
    // 仕様 13.1 #4：level 4 以降は上限で頭打ち
    expect(alienCount(4)).toBe(5);
    expect(alienCount(100)).toBe(5);
  });

  it('金塊数は 5 + level × 2（仕様 2章）。配置できる通路マス数での上限は配置側で扱う（13.1 #3）', () => {
    expect(goldCount(1)).toBe(7);
    expect(goldCount(2)).toBe(9);
    expect(goldCount(45)).toBe(95);
  });
});

describe('config：デスクトップ版のループとミス演出', () => {
  it('固定タイムステップは 1000/60ms（仕様 2章・14.3）', () => {
    expect(FIXED_STEP_MS).toBe(1000 / 60);
  });

  it('1フレームの最大ステップ数は 5（仕様 2章・14.3）', () => {
    expect(MAX_STEPS_PER_FRAME).toBe(5);
  });

  it('ミス演出は 1500ms、点滅間隔 100ms（仕様 2章・16.5）', () => {
    expect(MISS_DURATION_MS).toBe(1500);
    expect(MISS_BLINK_INTERVAL_MS).toBe(100);
  });

  it('赤フラッシュは不透明度 0.35 から 300ms で 0 まで（仕様 2章・16.5）', () => {
    expect(MISS_FLASH_MS).toBe(300);
    expect(MISS_FLASH_ALPHA).toBe(0.35);
  });
});

describe('config：エイリアンの色（仕様 8.1）', () => {
  it('赤・青・黄・緑・紫の5色を、この順で循環させる', () => {
    expect(ALIEN_COLORS).toEqual(['#FF3333', '#3388FF', '#FFFF33', '#33FF33', '#CC33FF']);
  });

  it('色の数はエイリアン数の上限と同じで、同じレベルのエイリアンの色は重ならない（仕様 13.1 #4）', () => {
    expect(ALIEN_COLORS).toHaveLength(MAX_ALIENS);
  });
});

describe('config：方向（仕様 3章・5.3・8.4）', () => {
  it('4方向は 上・下・左・右 の順（原作の方向配列の順、乱数で選ぶときの順序に使う）', () => {
    expect(DIRS).toEqual(['UP', 'DOWN', 'LEFT', 'RIGHT']);
  });

  it('方向ごとの移動量：x は右が正、y は下が正（仕様 3章）', () => {
    expect(DIR_VECTORS).toEqual({
      UP: { x: 0, y: -1 },
      DOWN: { x: 0, y: 1 },
      LEFT: { x: -1, y: 0 },
      RIGHT: { x: 1, y: 0 },
    });
  });

  it('逆方向（エイリアンの逆走防止に使う、仕様 8.4）', () => {
    expect(OPPOSITE_DIR).toEqual({ UP: 'DOWN', DOWN: 'UP', LEFT: 'RIGHT', RIGHT: 'LEFT' });
  });
});

describe('config：スコア（仕様 10.2）', () => {
  it('撃破 +100、金塊 +200、階段出現 +500、レベルクリア +1000', () => {
    expect(SCORE_ALIEN_KILLED).toBe(100);
    expect(SCORE_GOLD).toBe(200);
    expect(SCORE_STAIRS_APPEARED).toBe(500);
    expect(SCORE_LEVEL_CLEAR).toBe(1000);
  });
});
