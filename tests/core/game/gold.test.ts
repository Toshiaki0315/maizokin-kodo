import { describe, expect, it } from 'vitest';
import { Alien } from '../../../src/core/alien';
import { FIXED_STEP_MS, INITIAL_LIVES, PLAYER_START, PORTAL_POS, goldCount } from '../../../src/core/config';
import type { Game } from '../../../src/core/game';
import { openGrid, sequenceRng } from '../helpers';
import { ENTER, NO_INPUT, input, playingGame, position, stepN } from './gameHelpers';

const UP = input({ dir: 'UP' });

/** プレイヤーの真上 (7,12) に金塊を1つだけ置く */
function withGoldAhead(game: Game): void {
  game.gold = [{ x: 7, y: 12, collected: false }];
}

/** 残りの金塊をすべて取った状態にして階段を出し、プレイヤーを階段の真下に置く */
function readyToClear(game: Game): void {
  for (const g of game.gold) g.collected = true;
  game.step(FIXED_STEP_MS, NO_INPUT);
  game.player.x = 7;
  game.player.y = 8;
}

/** 階段に乗ってレベルクリアにする */
function clearLevel(game: Game): void {
  game.grid = openGrid();
  game.aliens = [];
  readyToClear(game);
  game.step(FIXED_STEP_MS, UP);
}

describe('金塊（仕様 9.2・10.2）', () => {
  it('プレイヤーが金塊のマスに入ると取得し、+200 点', () => {
    const game = playingGame();
    game.gold.push({ x: 7, y: 12, collected: false });
    game.step(FIXED_STEP_MS, UP);
    expect(game.gold[1].collected).toBe(true);
    expect(game.score).toBe(200);
  });

  it('取得した金塊は配列に残り、二度は取れない', () => {
    const game = playingGame();
    game.gold.push({ x: 7, y: 12, collected: false });
    game.step(FIXED_STEP_MS, UP);
    game.player.y = 13;
    game.step(FIXED_STEP_MS, NO_INPUT);
    game.player.y = 12;
    game.step(FIXED_STEP_MS, NO_INPUT);
    expect(game.gold).toHaveLength(2);
    expect(game.score).toBe(200);
  });

  it('エイリアンは金塊を取らない（仕様 9.2）', () => {
    const game = playingGame();
    const alien = new Alien(sequenceRng(0), 0, '#FF3333', 450);
    alien.x = 3;
    alien.y = 3;
    alien.dir = 'RIGHT';
    game.aliens = [alien];
    game.gold.push({ x: 4, y: 3, collected: false });
    // エイリアンが (4,3) に進むまで待つ（右以外に進む可能性もあるので、周りを壁で囲んで一本道にする）
    game.grid = openGrid([
      { x: 3, y: 2 },
      { x: 3, y: 4 },
      { x: 4, y: 2 },
      { x: 4, y: 4 },
      { x: 5, y: 3 },
      { x: 2, y: 3 },
    ]);
    stepN(game, 30);
    expect(position(alien)).toEqual({ x: 4, y: 3 });
    expect(game.gold[1].collected).toBe(false);
  });
});

describe('階段（仕様 9.3・10.2・11章）', () => {
  it('金塊が残っている間は階段が出ない', () => {
    const game = playingGame();
    stepN(game, 10);
    expect(game.stairs).toBeNull();
  });

  it('最後の金塊を取ったステップで (7,7) に階段が出て、+500 点（+200 と合わせて +700）', () => {
    const game = playingGame();
    withGoldAhead(game);
    game.step(FIXED_STEP_MS, UP);
    expect(game.stairs).toEqual(PORTAL_POS);
    expect(game.score).toBe(700);
  });

  it('階段の +500 点は1レベル1回だけ', () => {
    const game = playingGame();
    withGoldAhead(game);
    game.step(FIXED_STEP_MS, UP);
    stepN(game, 10);
    expect(game.score).toBe(700);
  });

  it('階段に乗ると LEVEL_CLEAR になり、+1000 点', () => {
    const game = playingGame();
    readyToClear(game);
    const before = game.score;
    game.step(FIXED_STEP_MS, UP);
    expect(position(game.player)).toEqual(PORTAL_POS);
    expect(game.state).toBe('LEVEL_CLEAR');
    expect(game.score).toBe(before + 1000);
  });

  it('階段が出ていなければ (7,7) に乗ってもクリアにならない', () => {
    const game = playingGame();
    game.player.y = 8;
    game.step(FIXED_STEP_MS, UP);
    expect(position(game.player)).toEqual(PORTAL_POS);
    expect(game.state).toBe('PLAYING');
  });
});

describe('LEVEL_CLEAR（仕様 4章・9.3・16.1・16.7）', () => {
  it('クリアした瞬間の盤面のまま止まる（ロジックを進めない）', () => {
    const game = playingGame();
    clearLevel(game);
    const alien = new Alien(sequenceRng(0), 1000, '#FF3333', 450);
    game.aliens = [alien];
    stepN(game, 120, input({ dir: 'DOWN' }));
    expect(game.state).toBe('LEVEL_CLEAR');
    expect(alien.respawnTimer).toBe(1000);
    expect(position(game.player)).toEqual(PORTAL_POS);
  });

  it('Enter を押すまで次の坑道に進まない（押下エッジのみ）', () => {
    const game = playingGame();
    clearLevel(game);
    stepN(game, 10);
    expect(game.state).toBe('LEVEL_CLEAR');
    expect(game.level).toBe(1);
  });

  it('Enter で level +1 の新しい坑道を始める。スコアと残機は引き継ぐ（仕様 9.3）', () => {
    const game = playingGame();
    clearLevel(game);
    const score = game.score;
    const oldGrid = game.grid;
    game.step(FIXED_STEP_MS, ENTER);
    expect(game.state).toBe('PLAYING');
    expect(game.level).toBe(2);
    expect(game.score).toBe(score);
    expect(game.lives).toBe(INITIAL_LIVES);
    expect(game.grid).not.toBe(oldGrid);
  });

  it('新しい坑道は 9.1 のとおり初期化する（金塊・エイリアン・穴・階段・プレイヤー）', () => {
    const game = playingGame();
    game.holes.dig(3, 3);
    clearLevel(game);
    game.step(FIXED_STEP_MS, ENTER);
    expect(game.gold).toHaveLength(goldCount(2));
    expect(game.gold.every((g) => !g.collected)).toBe(true);
    expect(game.aliens).toHaveLength(4);
    expect(game.aliens.every((a) => a.moveInterval === 430)).toBe(true);
    expect(game.holes.entries()).toEqual([]);
    expect(game.stairs).toBeNull();
    expect(position(game.player)).toEqual(PLAYER_START);
    expect(game.player.dir).toBe('UP');
  });

  it('次の坑道を始めるときに入力リセットを依頼する（仕様 16.7）', () => {
    const game = playingGame();
    clearLevel(game);
    expect(game.step(FIXED_STEP_MS, ENTER)).toContainEqual({ type: 'inputReset' });
  });

  it('次の坑道を始めるときに移動のクールダウンを戻す（仕様 16.7）', () => {
    const game = playingGame();
    clearLevel(game); // 階段へ移動した直後なので移動のクールダウンが残っている
    game.step(FIXED_STEP_MS, ENTER);
    game.step(FIXED_STEP_MS, UP);
    expect(position(game.player)).toEqual({ x: 7, y: 12 });
  });

  it('レベル 4 以降もエイリアンは 5 体（仕様 13.1 #4）', () => {
    const game = playingGame();
    for (let i = 0; i < 4; i++) {
      clearLevel(game);
      game.step(FIXED_STEP_MS, ENTER);
    }
    expect(game.level).toBe(5);
    expect(game.aliens).toHaveLength(5);
  });
});
