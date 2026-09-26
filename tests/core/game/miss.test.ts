import { describe, expect, it } from 'vitest';
import { Alien } from '../../../src/core/alien';
import { FIXED_STEP_MS, INITIAL_LIVES, PLAYER_START, PORTAL_POS, type Dir } from '../../../src/core/config';
import type { Game } from '../../../src/core/game';
import { closedGrid, openGrid, sequenceRng } from '../helpers';
import { ENTER, NO_INPUT, input, playingGame, position, stepN } from './gameHelpers';

/** (x, y) に dir を向いて歩いているエイリアン。移動タイマーは 0 */
function walker(x: number, y: number, dir: Dir = 'UP'): Alien {
  const alien = new Alien(sequenceRng(0), 0, '#FF3333', 450);
  alien.x = x;
  alien.y = y;
  alien.dir = dir;
  return alien;
}

/** プレイヤーと同じマスに歩いているエイリアンを置いてミスにする */
function miss(game: Game): void {
  game.aliens = [walker(game.player.x, game.player.y)];
  game.step(FIXED_STEP_MS, NO_INPUT);
}

/** MISS の演出（1500ms）を終わらせる */
function finishMiss(game: Game) {
  return [...game.step(500, NO_INPUT), ...game.step(500, NO_INPUT), ...game.step(500, NO_INPUT)];
}

describe('ミス判定（仕様 10.1）', () => {
  it('歩いているエイリアンと同じマスにいると、残機が 1 減って MISS になる（仕様 16.5）', () => {
    const game = playingGame();
    miss(game);
    expect(game.lives).toBe(INITIAL_LIVES - 1);
    expect(game.state).toBe('MISS');
  });

  it('エイリアンが移動してきて重なってもミス', () => {
    const game = playingGame();
    const alien = walker(7, 11, 'DOWN');
    alien.moveTimer = 449;
    game.aliens = [alien];
    game.step(FIXED_STEP_MS, NO_INPUT); // プレイヤーを追って (7,12) へ
    expect(game.state).toBe('PLAYING');
    game.player.y = 12;
    game.step(FIXED_STEP_MS, NO_INPUT);
    expect(game.state).toBe('MISS');
  });

  it('捕獲中のエイリアンと重なっても安全（仕様 10.1）', () => {
    const game = playingGame();
    const alien = walker(7, 13);
    alien.state = 'TRAPPED';
    alien.trapTimer = 5000;
    game.holes.dig(7, 13);
    game.aliens = [alien];
    stepN(game, 5);
    expect(game.state).toBe('PLAYING');
  });

  it('出現待ちのエイリアンと重なっても安全（仕様 10.1）', () => {
    const game = playingGame();
    game.player.x = PORTAL_POS.x;
    game.player.y = PORTAL_POS.y;
    game.aliens = [new Alien(sequenceRng(0), 5000, '#FF3333', 450)];
    stepN(game, 5);
    expect(game.state).toBe('PLAYING');
  });

  it('出現した瞬間に (7,7) にプレイヤーがいればミス（原作どおり、仕様 13.1 #5・16.13）', () => {
    const game = playingGame();
    game.player.x = PORTAL_POS.x;
    game.player.y = PORTAL_POS.y;
    game.aliens = [new Alien(sequenceRng(0), 10, '#FF3333', 450)];
    game.step(FIXED_STEP_MS, NO_INPUT);
    expect(game.state).toBe('MISS');
  });

  it('ミスしたステップは残りの処理（金塊の取得など）を打ち切る（仕様 10.1）', () => {
    const game = playingGame();
    game.gold.push({ x: 7, y: 12, collected: false });
    game.aliens = [walker(7, 12)];
    game.step(FIXED_STEP_MS, input({ dir: 'UP' })); // 金塊のマスに進んだが、そこにエイリアンがいる
    expect(game.state).toBe('MISS');
    expect(game.gold[1].collected).toBe(false);
    expect(game.score).toBe(0);
  });

  it('ミスしたエイリアンより後ろのエイリアンは、そのステップ更新しない（仕様 11章）', () => {
    const game = playingGame();
    const first = walker(7, 13);
    const second = walker(3, 3);
    game.aliens = [first, second];
    game.step(FIXED_STEP_MS, NO_INPUT);
    expect(first.moveTimer).toBeGreaterThan(0);
    expect(second.moveTimer).toBe(0);
  });
});

describe('すれ違いの衝突（仕様 16.14）', () => {
  // 縦一本道 (7,11)〜(7,13)。(7,10) は壁なので、(7,11) のエイリアンは下にしか進めない
  function swapSetup(): { game: Game; alien: Alien } {
    const game = playingGame();
    game.grid = closedGrid([
      { x: 7, y: 11 },
      { x: 7, y: 12 },
      { x: 7, y: 13 },
    ]);
    game.player.y = 12;
    const alien = walker(7, 11, 'DOWN');
    alien.moveTimer = 450 - FIXED_STEP_MS; // このステップで動く
    game.aliens = [alien];
    return { game, alien };
  }

  it('同じステップで互いのマスへ移動した（入れ替わった）ら、ミスにする（仕様 15.3）', () => {
    const { game, alien } = swapSetup();
    game.step(FIXED_STEP_MS, input({ dir: 'UP' }));
    expect(position(game.player)).toEqual({ x: 7, y: 11 });
    expect(position(alien)).toEqual({ x: 7, y: 12 });
    expect(game.state).toBe('MISS');
  });

  it('プレイヤーが動かなければ、エイリアンが入ってきた時点で同じマスとしてミス', () => {
    const { game } = swapSetup();
    game.step(FIXED_STEP_MS, NO_INPUT);
    expect(game.state).toBe('MISS');
  });

  it('出現した瞬間は移動ではないので、入れ替わりの判定をしない（仕様 16.14）', () => {
    const game = playingGame();
    // 撃破されて (6,7) に座標が残ったまま出現を待つエイリアン
    const alien = new Alien(sequenceRng(0), 10, '#FF3333', 450);
    alien.x = 6;
    alien.y = 7;
    game.aliens = [alien];
    game.player.x = PORTAL_POS.x;
    game.player.y = PORTAL_POS.y;
    game.player.dir = 'LEFT';
    game.step(FIXED_STEP_MS, input({ dir: 'LEFT' })); // プレイヤーは (6,7) へ、エイリアンは (7,7) に出現
    expect(position(game.player)).toEqual({ x: 6, y: 7 });
    expect(position(alien)).toEqual(PORTAL_POS);
    expect(game.state).toBe('PLAYING');
  });
});

describe('MISS の演出（仕様 16.5）', () => {
  it('MISS の間は、ぶつかったエイリアンを含め全員が止まり、プレイヤーも動かない', () => {
    const game = playingGame();
    miss(game);
    const other = walker(3, 3);
    game.aliens.push(other);
    stepN(game, 30, input({ dir: 'LEFT' }));
    expect(game.state).toBe('MISS');
    expect(other.moveTimer).toBe(0);
    expect(position(game.player)).toEqual(PLAYER_START);
  });

  it('経過時間をロジック側で数える', () => {
    const game = playingGame();
    miss(game);
    expect(game.missElapsedMs).toBe(0);
    game.step(400, NO_INPUT);
    expect(game.missElapsedMs).toBe(400);
  });

  it('1500ms 経ったら、残機があれば PLAYING に戻り、入力リセットを依頼する（仕様 16.5・16.7）', () => {
    const game = playingGame();
    miss(game);
    game.step(1000, NO_INPUT);
    expect(game.state).toBe('MISS');
    const events = game.step(500, NO_INPUT);
    expect(game.state).toBe('PLAYING');
    expect(events).toContainEqual({ type: 'inputReset' });
  });

  it('再開時はプレイヤーを初期位置に戻し、エイリアンを作り直す。迷路・穴・金塊・階段はそのまま（仕様 10.1）', () => {
    const game = playingGame();
    game.player.x = 3;
    game.player.dir = 'LEFT';
    game.holes.dig(5, 5);
    game.gold.push({ x: 9, y: 9, collected: true });
    const grid = game.grid;
    miss(game);
    finishMiss(game);
    expect(position(game.player)).toEqual(PLAYER_START);
    expect(game.player.dir).toBe('UP');
    expect(game.aliens).toHaveLength(3);
    expect(game.aliens.every((a) => a.state === 'WAITING_SPAWN')).toBe(true);
    expect(game.holes.stageAt(5, 5)).toBe(1);
    expect(game.gold[1].collected).toBe(true);
    expect(game.grid).toBe(grid);
  });

  it('再開時に移動のクールダウンを戻す（仕様 16.7）', () => {
    const game = playingGame();
    game.step(FIXED_STEP_MS, input({ dir: 'UP' })); // 移動してクールダウンが付く
    miss(game);
    finishMiss(game);
    game.step(FIXED_STEP_MS, input({ dir: 'UP' }));
    expect(position(game.player)).toEqual({ x: 7, y: 12 });
  });

  it('残機が 0 になったミスは、1500ms 後に GAMEOVER になる（仕様 16.5）', () => {
    const game = playingGame();
    game.lives = 1;
    miss(game);
    expect(game.lives).toBe(0);
    expect(game.state).toBe('MISS');
    finishMiss(game);
    expect(game.state).toBe('GAMEOVER');
  });

  it('階段が出た後のミスで作り直したエイリアンは出現しない（仕様 16.13）', () => {
    const game = playingGame();
    game.gold = [{ x: 7, y: 12, collected: false }];
    game.step(FIXED_STEP_MS, input({ dir: 'UP' })); // 最後の金塊を取って階段が出る
    expect(game.stairs).not.toBeNull();
    miss(game);
    finishMiss(game);
    stepN(game, 600);
    expect(game.aliens.every((a) => a.state === 'WAITING_SPAWN')).toBe(true);
  });
});

describe('GAMEOVER とリトライ（仕様 4章・10.2・16.7）', () => {
  function gameOver(): Game {
    const game = playingGame();
    game.score = 1234;
    game.lives = 1;
    miss(game);
    finishMiss(game);
    return game;
  }

  it('GAMEOVER の間はロジックを進めない', () => {
    const game = gameOver();
    const alien = new Alien(sequenceRng(0), 1000, '#FF3333', 450);
    game.aliens = [alien];
    stepN(game, 60);
    expect(alien.respawnTimer).toBe(1000);
  });

  it('Enter でタイトルに戻らず、レベル 1 の新しいゲームを始める。スコア 0・残機 3（仕様 4章）', () => {
    const game = gameOver();
    const events = game.step(FIXED_STEP_MS, ENTER);
    expect(game.state).toBe('PLAYING');
    expect(game.score).toBe(0);
    expect(game.lives).toBe(INITIAL_LIVES);
    expect(game.level).toBe(1);
    expect(game.aliens).toHaveLength(3);
    expect(events).toContainEqual({ type: 'inputReset' });
  });

  it('Enter を押すまで GAMEOVER のまま（押下エッジのみ）', () => {
    const game = gameOver();
    stepN(game, 10);
    expect(game.state).toBe('GAMEOVER');
  });

  it('リトライでは迷路を作り直す', () => {
    const game = gameOver();
    const grid = game.grid;
    game.step(FIXED_STEP_MS, ENTER);
    expect(game.grid).not.toBe(grid);
  });
});

describe('撃破（仕様 7章・10.2・11章）', () => {
  it('捕獲中のエイリアンの穴を埋め切ると、同じステップで撃破されて +100 点', () => {
    const game = playingGame();
    const alien = walker(7, 12);
    alien.state = 'TRAPPED';
    alien.trapTimer = 5000;
    game.holes.dig(7, 12);
    game.aliens = [alien];
    game.step(FIXED_STEP_MS, input({ fill: true })); // handleInput で埋め切り、同じステップのエイリアン更新で撃破
    expect(alien.state).toBe('DEAD');
    expect(game.score).toBe(100);
  });

  it('捕獲中のエイリアンがいなければ、穴を埋めても点は入らない', () => {
    const game = playingGame();
    game.grid = openGrid();
    game.holes.dig(7, 12);
    game.step(FIXED_STEP_MS, input({ fill: true }));
    expect(game.score).toBe(0);
  });
});
