import { describe, expect, it } from 'vitest';
import { Alien } from '../../../src/core/alien';
import { FIXED_STEP_MS, PLAYER_START } from '../../../src/core/config';
import type { Game } from '../../../src/core/game';
import { openGrid, sequenceRng } from '../helpers';
import { ENTER, ESCAPE, NO_INPUT, PAUSE, input, newGame, playingGame, position, stepN } from './gameHelpers';

/** 出現待ちのエイリアンを1体置き、ロジックが止まっているかをその残り時間で確かめる */
function withWaitingAlien(game: Game): Alien {
  const alien = new Alien(sequenceRng(0), 5000, '#FF3333', 450);
  game.aliens = [alien];
  return alien;
}

/** 歩いているエイリアンとぶつけて MISS にする */
function missGame(): Game {
  const game = playingGame();
  const alien = new Alien(sequenceRng(0), 0, '#FF3333', 450);
  alien.x = game.player.x;
  alien.y = game.player.y;
  game.aliens = [alien];
  game.step(FIXED_STEP_MS, NO_INPUT);
  expect(game.state).toBe('MISS');
  return game;
}

/** レベルクリアの状態にする */
function levelClearGame(): Game {
  const game = playingGame();
  for (const g of game.gold) g.collected = true;
  game.step(FIXED_STEP_MS, NO_INPUT);
  game.player.y = 8;
  game.step(FIXED_STEP_MS, input({ dir: 'UP' }));
  expect(game.state).toBe('LEVEL_CLEAR');
  return game;
}

/** ゲームオーバーの状態にする */
function gameOverGame(): Game {
  const game = missGame();
  game.lives = 0;
  game.step(1500, NO_INPUT);
  expect(game.state).toBe('GAMEOVER');
  return game;
}

describe('一時停止：P キー（仕様 16.2）', () => {
  it('PLAYING 中に P で PAUSED になり、ロジックを止める', () => {
    const game = playingGame();
    const alien = withWaitingAlien(game);
    game.step(FIXED_STEP_MS, PAUSE);
    expect(game.state).toBe('PAUSED');
    const timer = alien.respawnTimer;
    stepN(game, 60, input({ dir: 'LEFT' }));
    expect(alien.respawnTimer).toBe(timer);
    expect(position(game.player)).toEqual(PLAYER_START);
  });

  it('PAUSED 中に P で PLAYING に戻り、入力リセットを依頼する（仕様 16.7）', () => {
    const game = playingGame();
    game.step(FIXED_STEP_MS, PAUSE);
    const events = game.step(FIXED_STEP_MS, PAUSE);
    expect(game.state).toBe('PLAYING');
    expect(events).toContainEqual({ type: 'inputReset' });
  });

  it('再開時に移動のクールダウンを戻す（仕様 16.7）', () => {
    const game = playingGame();
    game.step(FIXED_STEP_MS, input({ dir: 'UP' })); // 移動してクールダウンが付く
    game.step(FIXED_STEP_MS, PAUSE);
    game.step(FIXED_STEP_MS, PAUSE);
    game.step(FIXED_STEP_MS, input({ dir: 'UP' }));
    expect(position(game.player)).toEqual({ x: 7, y: 11 });
  });

  it('PAUSED 中の Enter は無視する', () => {
    const game = playingGame();
    game.step(FIXED_STEP_MS, PAUSE);
    game.step(FIXED_STEP_MS, ENTER);
    expect(game.state).toBe('PAUSED');
  });

  it('MISS 中の P は無視し、ミスの演出は続く（手動では止められない）', () => {
    const game = missGame();
    game.step(500, PAUSE);
    expect(game.state).toBe('MISS');
    expect(game.missElapsedMs).toBe(500);
  });

  it('MISS 中の Enter は無視する（仕様 16.5）', () => {
    const game = missGame();
    game.step(FIXED_STEP_MS, ENTER);
    expect(game.state).toBe('MISS');
  });

  it.each([
    ['START', () => newGame()],
    ['LEVEL_CLEAR', levelClearGame],
    ['GAMEOVER', gameOverGame],
  ])('%s では P を無視する', (state, make) => {
    const game = make();
    game.step(FIXED_STEP_MS, PAUSE);
    expect(game.state).toBe(state);
  });
});

describe('一時停止：フォーカス喪失（仕様 16.2）', () => {
  it('PLAYING 中にフォーカスが外れると PAUSED になり、戻っても自動では再開しない', () => {
    const game = playingGame();
    game.focusLost();
    expect(game.state).toBe('PAUSED');
    stepN(game, 60);
    expect(game.state).toBe('PAUSED');
    game.step(FIXED_STEP_MS, PAUSE);
    expect(game.state).toBe('PLAYING');
  });

  it('MISS 中にフォーカスが外れると、残り時間を保ったまま PAUSED になり、P で MISS に戻る', () => {
    const game = missGame();
    game.step(600, NO_INPUT);
    game.focusLost();
    expect(game.state).toBe('PAUSED');
    stepN(game, 200);
    expect(game.missElapsedMs).toBe(600);
    const events = game.step(FIXED_STEP_MS, PAUSE);
    expect(game.state).toBe('MISS');
    expect(events).toContainEqual({ type: 'inputReset' });
    game.step(899, NO_INPUT);
    expect(game.state).toBe('MISS');
    game.step(1, NO_INPUT);
    expect(game.state).toBe('PLAYING');
  });

  it.each([
    ['START', () => newGame()],
    ['LEVEL_CLEAR', levelClearGame],
    ['GAMEOVER', gameOverGame],
  ])('%s ではフォーカスが外れても何もしない', (state, make) => {
    const game = make();
    game.focusLost();
    expect(game.state).toBe(state);
  });

  it('PAUSED 中にもう一度フォーカスが外れても、戻り先は変わらない', () => {
    const game = missGame();
    game.focusLost();
    game.focusLost();
    game.step(FIXED_STEP_MS, PAUSE);
    expect(game.state).toBe('MISS');
  });
});

describe('終了確認：ESC・×ボタン・⌘Q（仕様 16.3）', () => {
  it('PLAYING 中に ESC で QUIT_CONFIRM になり、ロジックを止める', () => {
    const game = playingGame();
    const alien = withWaitingAlien(game);
    game.step(FIXED_STEP_MS, ESCAPE);
    expect(game.state).toBe('QUIT_CONFIRM');
    const timer = alien.respawnTimer;
    stepN(game, 60, input({ dir: 'LEFT' }));
    expect(alien.respawnTimer).toBe(timer);
    expect(position(game.player)).toEqual(PLAYER_START);
  });

  it('×ボタンと⌘Q（closeRequested）でも QUIT_CONFIRM になる', () => {
    const game = playingGame();
    game.closeRequested();
    expect(game.state).toBe('QUIT_CONFIRM');
  });

  it('Enter で終了を依頼する（1回だけ）', () => {
    const game = playingGame();
    game.step(FIXED_STEP_MS, ESCAPE);
    expect(game.step(FIXED_STEP_MS, ENTER)).toContainEqual({ type: 'quit' });
    expect(game.step(FIXED_STEP_MS, ENTER)).toEqual([]);
  });

  it('終了を確定した後は ESC で取り消せない', () => {
    const game = playingGame();
    game.step(FIXED_STEP_MS, ESCAPE);
    game.step(FIXED_STEP_MS, ENTER);
    game.step(FIXED_STEP_MS, ESCAPE);
    expect(game.state).toBe('QUIT_CONFIRM');
  });

  it('QUIT_CONFIRM 中の P は無視する', () => {
    const game = playingGame();
    game.step(FIXED_STEP_MS, ESCAPE);
    game.step(FIXED_STEP_MS, PAUSE);
    expect(game.state).toBe('QUIT_CONFIRM');
  });

  it('QUIT_CONFIRM 中にもう一度×ボタンや⌘Q が来ても、確認画面のまま。取り消し先も変わらない', () => {
    const game = playingGame();
    game.step(FIXED_STEP_MS, ESCAPE);
    game.closeRequested();
    game.closeRequested();
    expect(game.state).toBe('QUIT_CONFIRM');
    game.step(FIXED_STEP_MS, ESCAPE);
    expect(game.state).toBe('PAUSED');
  });

  it('QUIT_CONFIRM 中にフォーカスが外れても何もしない', () => {
    const game = playingGame();
    game.step(FIXED_STEP_MS, ESCAPE);
    game.focusLost();
    expect(game.state).toBe('QUIT_CONFIRM');
  });
});

describe('終了確認の取り消し：戻り先（仕様 16.1 の表）', () => {
  it('PLAYING から → 取り消すと PAUSED、その後 P で PLAYING', () => {
    const game = playingGame();
    game.step(FIXED_STEP_MS, ESCAPE);
    game.step(FIXED_STEP_MS, ESCAPE);
    expect(game.state).toBe('PAUSED');
    game.step(FIXED_STEP_MS, PAUSE);
    expect(game.state).toBe('PLAYING');
  });

  it('MISS から → 取り消すと MISS に戻り、残り時間から続ける', () => {
    const game = missGame();
    game.step(700, NO_INPUT);
    game.step(FIXED_STEP_MS, ESCAPE);
    stepN(game, 200);
    expect(game.missElapsedMs).toBe(700);
    game.step(FIXED_STEP_MS, ESCAPE);
    expect(game.state).toBe('MISS');
    game.step(799, NO_INPUT);
    expect(game.state).toBe('MISS');
    game.step(1, NO_INPUT);
    expect(game.state).toBe('PLAYING');
  });

  it('PAUSED（PLAYING から来た）から → 取り消すと PAUSED、P で PLAYING', () => {
    const game = playingGame();
    game.step(FIXED_STEP_MS, PAUSE);
    game.step(FIXED_STEP_MS, ESCAPE);
    expect(game.state).toBe('QUIT_CONFIRM');
    game.step(FIXED_STEP_MS, ESCAPE);
    expect(game.state).toBe('PAUSED');
    game.step(FIXED_STEP_MS, PAUSE);
    expect(game.state).toBe('PLAYING');
  });

  it('PAUSED（MISS から来た）から → 取り消すと PAUSED、P で MISS（元の戻り先のまま）', () => {
    const game = missGame();
    game.focusLost();
    game.closeRequested();
    game.step(FIXED_STEP_MS, ESCAPE);
    expect(game.state).toBe('PAUSED');
    game.step(FIXED_STEP_MS, PAUSE);
    expect(game.state).toBe('MISS');
  });

  it.each([
    ['START', () => newGame()],
    ['LEVEL_CLEAR', levelClearGame],
    ['GAMEOVER', gameOverGame],
  ])('%s から → 取り消すと元の状態に戻る', (state, make) => {
    const game = make();
    game.step(FIXED_STEP_MS, ESCAPE);
    expect(game.state).toBe('QUIT_CONFIRM');
    game.step(FIXED_STEP_MS, ESCAPE);
    expect(game.state).toBe(state);
  });

  it('START から ×ボタンで終了確認に入っても、取り消せば Enter でゲームを始められる', () => {
    const game = newGame();
    game.closeRequested();
    game.step(FIXED_STEP_MS, ESCAPE);
    game.step(FIXED_STEP_MS, ENTER);
    expect(game.state).toBe('PLAYING');
  });

  it('取り消しでは入力リセットを依頼しない（再開するのは PAUSED から P で戻ったとき）', () => {
    const game = playingGame();
    game.grid = openGrid();
    game.step(FIXED_STEP_MS, ESCAPE);
    expect(game.step(FIXED_STEP_MS, ESCAPE)).toEqual([]);
  });
});
