import { describe, expect, it } from 'vitest';
import { Alien } from '../../../src/core/alien';
import { FIXED_STEP_MS } from '../../../src/core/config';
import { closedGrid, sequenceRng } from '../helpers';
import { playingGame, position } from './gameHelpers';

describe('Game：お化け同士を重ならせない（仕様 8.4）', () => {
  it('ゲームの更新でも、ほかのお化けがいるマスへは進まない', () => {
    const game = playingGame();
    // (2,5)〜(4,5) の一本道。左のお化けは右へ、右のお化けは左へしか行けない
    game.grid = closedGrid([
      { x: 2, y: 5 },
      { x: 3, y: 5 },
      { x: 4, y: 5 },
      { x: 7, y: 13 },
    ]);
    const walker = (x: number, dir: 'LEFT' | 'RIGHT') => {
      const alien = new Alien(sequenceRng(0), 0, '#FF3333', 450);
      Object.assign(alien, { x, y: 5, dir, moveTimer: 450 - FIXED_STEP_MS });
      return alien;
    };
    const a = walker(2, 'RIGHT');
    const b = walker(4, 'LEFT');
    game.aliens = [a, b];
    game.step(FIXED_STEP_MS, { dir: null, dig: false, fill: false, enter: false, pause: false, escape: false });
    expect(position(a)).toEqual({ x: 3, y: 5 });
    expect(position(b)).toEqual({ x: 4, y: 5 });
  });
});
