import { describe, expect, it } from 'vitest';
import { Alien } from '../../../src/core/alien';
import { FIXED_STEP_MS } from '../../../src/core/config';
import type { Game, GameEvent } from '../../../src/core/game';
import { sequenceRng } from '../helpers';
import { ENTER, ESCAPE, NO_INPUT, input, newGame, playingGame } from './gameHelpers';

const saves = (events: GameEvent[]) => events.filter((e) => e.type === 'saveHiScore');

/** プレイヤーの真上 (7,12) に金塊を置いて取る（+200 点） */
function collectGold(game: Game): GameEvent[] {
  game.gold.push({ x: 7, y: 12, collected: false });
  game.player.x = 7;
  game.player.y = 13;
  game.player.dir = 'UP';
  const events = game.step(FIXED_STEP_MS, input({ dir: 'UP' }));
  game.step(FIXED_STEP_MS, NO_INPUT);
  return events;
}

/** ミスしてゲームオーバーにする（残機1から）。ゲームオーバーに入ったステップのイベントを返す */
function gameOver(game: Game): GameEvent[] {
  game.lives = 1;
  const alien = new Alien(sequenceRng(0), 0, '#FF3333', 450);
  alien.x = game.player.x;
  alien.y = game.player.y;
  game.aliens = [alien];
  game.step(FIXED_STEP_MS, NO_INPUT);
  return game.step(1500, NO_INPUT);
}

/** 階段に乗ってレベルクリアにする。クリアしたステップのイベントを返す */
function clearLevel(game: Game): GameEvent[] {
  for (const g of game.gold) g.collected = true;
  game.step(FIXED_STEP_MS, NO_INPUT);
  game.player.x = 7;
  game.player.y = 8;
  game.player.dir = 'UP';
  return game.step(FIXED_STEP_MS, input({ dir: 'UP' }));
}

describe('ハイスコアの更新（仕様 16.10）', () => {
  it('スコアがハイスコアを上回ったステップで、ハイスコアをスコアと同じ値にする', () => {
    const game = playingGame(); // ハイスコア 5000
    game.score = 4900;
    collectGold(game);
    expect(game.score).toBe(5100);
    expect(game.hiScore).toBe(5100);
  });

  it('スコアがハイスコア以下なら変えない', () => {
    const game = playingGame();
    collectGold(game);
    expect(game.hiScore).toBe(5000);
  });

  it('保存データがない場合の初期値 5000 は、main.ts から受け取った値として扱う', () => {
    expect(newGame(1, 5000).hiScore).toBe(5000);
    expect(newGame(1, 0).hiScore).toBe(0);
  });

  it('リトライでスコアは 0 に戻るが、ハイスコアは戻さない', () => {
    const game = playingGame();
    game.score = 6000;
    gameOver(game);
    game.step(FIXED_STEP_MS, ENTER);
    expect(game.score).toBe(0);
    expect(game.hiScore).toBe(6000);
  });
});

describe('ハイスコアの保存イベント（仕様 16.10・14.5）', () => {
  it('GAMEOVER に入ったとき、増えていれば保存を依頼する', () => {
    const game = playingGame();
    game.score = 6000;
    expect(saves(gameOver(game))).toEqual([{ type: 'saveHiScore', value: 6000 }]);
  });

  it('GAMEOVER に入ったとき、増えていなければ保存しない', () => {
    const game = playingGame();
    game.score = 100;
    expect(saves(gameOver(game))).toEqual([]);
  });

  it('LEVEL_CLEAR に入ったとき、クリアの +1000 点を含めて保存を依頼する', () => {
    const game = playingGame();
    game.score = 4500;
    expect(saves(clearLevel(game))).toEqual([{ type: 'saveHiScore', value: 6000 }]);
  });

  it('終了確認で Enter を押したとき、保存 → 終了 の順で依頼する', () => {
    const game = playingGame();
    game.score = 5500;
    game.step(FIXED_STEP_MS, NO_INPUT);
    game.step(FIXED_STEP_MS, ESCAPE);
    expect(game.step(FIXED_STEP_MS, ENTER)).toEqual([{ type: 'saveHiScore', value: 5500 }, { type: 'quit' }]);
  });

  it('終了のとき、増えていなければ終了だけ依頼する', () => {
    const game = playingGame();
    game.step(FIXED_STEP_MS, ESCAPE);
    expect(game.step(FIXED_STEP_MS, ENTER)).toEqual([{ type: 'quit' }]);
  });

  it('前回保存した値から増えた場合だけ保存する（同じ値を二度保存しない）', () => {
    const game = playingGame();
    game.score = 5800;
    expect(saves(clearLevel(game))).toHaveLength(1); // 階段 +500 とクリア +1000 で 7300 を保存
    game.step(FIXED_STEP_MS, ENTER); // 次の坑道。スコア 7300 のまま
    expect(saves(gameOver(game))).toEqual([]);
    game.step(FIXED_STEP_MS, ENTER); // リトライ
    game.step(FIXED_STEP_MS, ESCAPE);
    expect(saves(game.step(FIXED_STEP_MS, ENTER))).toEqual([]);
  });

  it('保存の後にまた増えれば、次の機会に保存する', () => {
    const game = playingGame();
    game.score = 5800;
    clearLevel(game); // 7300 を保存
    game.step(FIXED_STEP_MS, ENTER);
    game.score = 8000;
    expect(saves(gameOver(game))).toEqual([{ type: 'saveHiScore', value: 8000 }]);
  });
});

describe('ハイスコア更新の表示（仕様 16.10）', () => {
  it('そのゲームの開始時点のハイスコアを上回っていれば、newRecord が真', () => {
    const game = playingGame();
    game.score = 5001;
    gameOver(game);
    expect(game.newRecord).toBe(true);
  });

  it('上回っていなければ偽', () => {
    const game = playingGame();
    game.score = 5000;
    gameOver(game);
    expect(game.newRecord).toBe(false);
  });

  it('リトライしたら、その時点のハイスコアが新しい基準になる', () => {
    const game = playingGame();
    game.score = 6000;
    gameOver(game);
    game.step(FIXED_STEP_MS, ENTER);
    game.score = 5500;
    gameOver(game);
    expect(game.newRecord).toBe(false);
  });
});
