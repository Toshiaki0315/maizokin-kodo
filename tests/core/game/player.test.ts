import { describe, expect, it } from 'vitest';
import { PLAYER_START } from '../../../src/core/config';
import { openGrid } from '../helpers';
import { NO_INPUT, input, playingGame, position, stepN } from './gameHelpers';

// 固定ステップ（1000/60ms）でクールダウンが切れるまでのステップ数（仕様 14.3。誤差で最大1ステップ遅れる）
const MOVE_STEPS = 11; // 180ms
const ACTION_STEPS = 13; // 200ms

const UP = input({ dir: 'UP' });
const LEFT = input({ dir: 'LEFT' });
const RIGHT = input({ dir: 'RIGHT' });
const DIG = input({ dig: true });
const FILL = input({ fill: true });

const START = PLAYER_START; // (7,13)、上向き

describe('移動（仕様 5.3 手順6・5.4）', () => {
  it('向いている方向を押すと、そのステップですぐ1マス進む', () => {
    const game = playingGame();
    game.step(16, UP);
    expect(position(game.player)).toEqual({ x: 7, y: 12 });
  });

  it('押しっぱなしなら 180ms ごとに1マス進む', () => {
    const game = playingGame();
    stepN(game, MOVE_STEPS, UP);
    expect(game.player.y).toBe(12);
    game.step(1000 / 60, UP);
    expect(game.player.y).toBe(11);
  });

  it('離すと移動のクールダウンが 0 に戻り、タップするたびに即座に進む（仕様 5.4）', () => {
    const game = playingGame();
    game.step(16, UP);
    game.step(16, NO_INPUT);
    game.step(16, UP);
    game.step(16, NO_INPUT);
    game.step(16, UP);
    expect(game.player.y).toBe(10);
  });

  it('違う方向を押すと向きが変わるだけで進まず、180ms 押し続けると進み始める（仕様 5.4）', () => {
    const game = playingGame();
    game.step(1000 / 60, LEFT);
    expect(game.player.dir).toBe('LEFT');
    expect(position(game.player)).toEqual(START);
    stepN(game, MOVE_STEPS - 1, LEFT);
    expect(position(game.player)).toEqual(START);
    game.step(1000 / 60, LEFT);
    expect(position(game.player)).toEqual({ x: 6, y: 13 });
  });

  it('向き変更の直後は、離して押し直しても 150ms は進めない（turnCooldown、仕様 5.3 手順6）', () => {
    const game = playingGame();
    game.step(50, LEFT); // 向きを変える。turnCooldown 150ms
    game.step(50, NO_INPUT); // 離すと moveCooldown は 0 になるが turnCooldown は残る（残り 100ms）
    game.step(50, LEFT); // 残り 50ms
    expect(position(game.player)).toEqual(START);
    game.step(50, LEFT); // 0 になったので進む
    expect(position(game.player)).toEqual({ x: 6, y: 13 });
  });

  it('壁には進めず、クールダウンも付かない（壁がなくなればすぐ進める、仕様 5.3 手順6-2）', () => {
    const game = playingGame();
    game.grid = openGrid([{ x: 7, y: 12 }]);
    stepN(game, 3, UP);
    expect(position(game.player)).toEqual(START);
    game.grid = openGrid();
    game.step(16, UP);
    expect(position(game.player)).toEqual({ x: 7, y: 12 });
  });

  it.each([1, 2, 3])('stage %i の穴には進めない（深さに関係なく壁と同じ、仕様 5.4）', (stage) => {
    const game = playingGame();
    for (let i = 0; i < stage; i++) game.holes.dig(7, 12);
    stepN(game, 30, UP);
    expect(position(game.player)).toEqual(START);
  });

  it('盤面の外には出ない', () => {
    const game = playingGame();
    // 外周も通路にした盤面で、上端の (7,0) から上へ進もうとする
    game.grid = game.grid.map((row) => row.map(() => 0));
    game.player.x = 7;
    game.player.y = 0;
    stepN(game, 3, UP);
    expect(position(game.player)).toEqual({ x: 7, y: 0 });
  });
});

describe('向きと見た目（仕様 5.2・5.3 手順2〜3）', () => {
  it('左右キーで見た目の向き（faceDir）が変わり、上下キーでは変わらない', () => {
    const game = playingGame();
    game.step(16, LEFT);
    expect(game.player.faceDir).toBe('LEFT');
    game.step(16, UP);
    expect(game.player.faceDir).toBe('LEFT');
    game.step(16, RIGHT);
    expect(game.player.faceDir).toBe('RIGHT');
  });

  it('掘っている間の方向入力でも faceDir は変わる（仕様 5.2）', () => {
    const game = playingGame();
    game.step(16, input({ dir: 'LEFT', dig: true }));
    expect(game.player.faceDir).toBe('LEFT');
  });

  it('方向を押している間は歩行アニメ（isMoving）、離すと止まる。進めないときも歩行アニメになる（仕様 5.3 手順2）', () => {
    const game = playingGame();
    game.step(16, UP);
    expect(game.player.isMoving).toBe(true);
    game.step(16, NO_INPUT);
    expect(game.player.isMoving).toBe(false);
    game.grid = openGrid([{ x: 7, y: 11 }]);
    game.step(16, UP);
    expect(game.player.isMoving).toBe(true);
  });
});

describe('掘る（仕様 5.3 手順5・7章）', () => {
  it('前方のマスに stage 1 の穴を掘る', () => {
    const game = playingGame();
    game.step(16, DIG);
    expect(game.holes.stageAt(7, 12)).toBe(1);
  });

  it('押しっぱなしなら 200ms ごとに1段深くなり、3回で最も深くなる', () => {
    const game = playingGame();
    stepN(game, ACTION_STEPS, DIG);
    expect(game.holes.stageAt(7, 12)).toBe(1);
    stepN(game, 1, DIG);
    expect(game.holes.stageAt(7, 12)).toBe(2);
    stepN(game, ACTION_STEPS, DIG);
    expect(game.holes.stageAt(7, 12)).toBe(3);
    stepN(game, ACTION_STEPS * 3, DIG);
    expect(game.holes.stageAt(7, 12)).toBe(3);
  });

  it('掘っている間は、方向を押していても移動しない（アクション優先、仕様 5.3 手順5-4）', () => {
    const game = playingGame();
    stepN(game, 30, input({ dir: 'UP', dig: true }));
    expect(position(game.player)).toEqual(START);
    expect(game.player.isMoving).toBe(false);
  });

  it('掘りながら方向を押すと、クールダウンなしで即座にその方向を向いて掘る（仕様 5.3 手順5-1）', () => {
    const game = playingGame();
    game.step(16, input({ dir: 'LEFT', dig: true }));
    expect(game.player.dir).toBe('LEFT');
    expect(game.holes.stageAt(6, 13)).toBe(1);
    expect(game.holes.stageAt(7, 12)).toBe(0);
  });

  it('向きを変えて掘っても turnCooldown は付かない（掘り終えてすぐその方向へ進める）', () => {
    const game = playingGame();
    game.step(16, input({ dir: 'LEFT', dig: true }));
    game.holes.clear();
    game.step(16, LEFT);
    expect(position(game.player)).toEqual({ x: 6, y: 13 });
  });

  it('前方が壁なら何もせず、クールダウンも付かない（向きを変えればすぐ掘れる、仕様 5.3 手順5-3）', () => {
    const game = playingGame();
    game.grid = openGrid([{ x: 7, y: 12 }]);
    game.step(16, DIG);
    expect(game.holes.entries()).toEqual([]);
    game.step(16, input({ dir: 'LEFT', dig: true }));
    expect(game.holes.stageAt(6, 13)).toBe(1);
  });

  it('stage 3 の穴を掘っても変わらないが、クールダウンは付く（仕様 5.3 手順5-2）', () => {
    const game = playingGame();
    for (let i = 0; i < 3; i++) game.holes.dig(7, 12);
    game.step(16, DIG); // stage 3 のまま、クールダウン 200ms
    game.step(16, input({ dir: 'LEFT', dig: true })); // クールダウン中なので左は掘れない
    expect(game.holes.stageAt(6, 13)).toBe(0);
  });

  it('ポータル (7,7) や金塊のマスにも掘れる（仕様 5.4）', () => {
    const game = playingGame();
    game.player.y = 8;
    game.gold = [{ x: 6, y: 8, collected: false }];
    game.step(16, DIG);
    expect(game.holes.stageAt(7, 7)).toBe(1);
    game.step(1000, input({ dir: 'LEFT', dig: true }));
    expect(game.holes.stageAt(6, 8)).toBe(1);
  });
});

describe('埋める（仕様 5.3 手順5・7章）', () => {
  it('前方の穴を1段浅くし、0 になったら穴が消える', () => {
    const game = playingGame();
    game.holes.dig(7, 12);
    game.holes.dig(7, 12);
    game.step(16, FILL);
    expect(game.holes.stageAt(7, 12)).toBe(1);
    stepN(game, ACTION_STEPS, FILL);
    expect(game.holes.has(7, 12)).toBe(false);
  });

  it('押しっぱなしなら 200ms ごとに1段ずつ埋める', () => {
    const game = playingGame();
    for (let i = 0; i < 3; i++) game.holes.dig(7, 12);
    stepN(game, ACTION_STEPS, FILL);
    expect(game.holes.stageAt(7, 12)).toBe(2);
    stepN(game, 1, FILL);
    expect(game.holes.stageAt(7, 12)).toBe(1);
  });

  it('穴がなければ何もせず、クールダウンも付かない（向きを変えればすぐ埋められる、仕様 5.3 手順5-2）', () => {
    const game = playingGame();
    game.holes.dig(6, 13);
    game.step(16, FILL); // 前方 (7,12) に穴はない
    game.step(16, input({ dir: 'LEFT', fill: true }));
    expect(game.holes.has(6, 13)).toBe(false);
  });

  it('埋めている間も移動しない', () => {
    const game = playingGame();
    stepN(game, 5, input({ dir: 'UP', fill: true }));
    expect(position(game.player)).toEqual(START);
  });

  it('穴を埋め切れば、そのマスへ進めるようになる', () => {
    const game = playingGame();
    game.holes.dig(7, 12);
    game.step(16, FILL);
    game.step(16, UP);
    expect(position(game.player)).toEqual({ x: 7, y: 12 });
  });
});
