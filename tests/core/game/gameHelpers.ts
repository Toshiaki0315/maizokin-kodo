// game のテストで使う道具
import { FIXED_STEP_MS, type Point } from '../../../src/core/config';
import { Game, type GameEvent } from '../../../src/core/game';
import type { InputSnapshot } from '../../../src/core/input';
import { createRng } from '../../../src/core/rng';
import { openGrid } from '../helpers';

export const NO_INPUT: InputSnapshot = {
  dir: null,
  dig: false,
  fill: false,
  enter: false,
  pause: false,
  escape: false,
};

export function input(partial: Partial<InputSnapshot>): InputSnapshot {
  return { ...NO_INPUT, ...partial };
}

export const ENTER = input({ enter: true });
export const PAUSE = input({ pause: true });
export const ESCAPE = input({ escape: true });

/** 起動直後（START）のゲーム */
export function newGame(seed = 1, initialHiScore = 5000): Game {
  return new Game(createRng(seed), initialHiScore);
}

/**
 * Enter で PLAYING にしたうえで、テストしやすい盤面に置き換えたゲーム。
 * 内側がすべて通路の盤面、エイリアンなし、左上 (1,1) に未取得の金塊が1つ（階段が出ないように）
 */
export function playingGame(): Game {
  const game = newGame();
  game.step(FIXED_STEP_MS, ENTER);
  game.grid = openGrid();
  game.aliens = [];
  game.gold = [{ x: 1, y: 1, collected: false }];
  return game;
}

/** 同じ入力で n ステップ進め、返ったイベントをまとめて返す */
export function stepN(game: Game, n: number, snapshot: InputSnapshot = NO_INPUT, dt = FIXED_STEP_MS): GameEvent[] {
  const events: GameEvent[] = [];
  for (let i = 0; i < n; i++) events.push(...game.step(dt, snapshot));
  return events;
}

export function position(p: Point): Point {
  return { x: p.x, y: p.y };
}
