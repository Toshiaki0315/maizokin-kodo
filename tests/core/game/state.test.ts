import { describe, expect, it } from 'vitest';
import {
  COLS,
  FIXED_STEP_MS,
  INITIAL_LIVES,
  PLAYER_START,
  PORTAL_POS,
  ROWS,
  goldCount,
} from '../../../src/core/config';
import { placeGold } from '../../../src/core/game';
import { generateMaze, PATH } from '../../../src/core/maze';
import { createRng } from '../../../src/core/rng';
import { closedGrid } from '../helpers';
import { ENTER, NO_INPUT, input, newGame, position, stepN } from './gameHelpers';

describe('Game：起動時の状態（仕様 4章・9.1）', () => {
  it('START で、レベル 1・残機 3・スコア 0・ハイスコアは受け取った値', () => {
    const game = newGame(1, 12345);
    expect(game.state).toBe('START');
    expect(game.level).toBe(1);
    expect(game.lives).toBe(INITIAL_LIVES);
    expect(game.score).toBe(0);
    expect(game.hiScore).toBe(12345);
  });

  it('起動時にレベル 1 を初期化する。迷路は最初に生成する（仕様 9.1 手順1）', () => {
    // 同じシードの乱数で最初に迷路を作れば、同じ迷路になるはず
    expect(newGame(7).grid).toEqual(generateMaze(createRng(7)));
  });

  it('プレイヤーは (7,13) で上向き、見た目は右向き（仕様 5.2・10.1）', () => {
    const { player } = newGame();
    expect(position(player)).toEqual(PLAYER_START);
    expect(player.dir).toBe('UP');
    expect(player.faceDir).toBe('RIGHT');
    expect(player.isMoving).toBe(false);
  });

  it('エイリアンを 2 + level 体作り、金塊を 5 + level×2 個置く。穴と階段はない（仕様 9.1）', () => {
    const game = newGame();
    expect(game.aliens).toHaveLength(3);
    expect(game.aliens.every((a) => a.state === 'WAITING_SPAWN')).toBe(true);
    expect(game.gold).toHaveLength(goldCount(1));
    expect(game.gold.every((g) => !g.collected)).toBe(true);
    expect(game.holes.entries()).toEqual([]);
    expect(game.stairs).toBeNull();
  });
});

describe('Game：START（仕様 4章・16.1）', () => {
  it('START の間はロジックを進めない（エイリアンのタイマーもプレイヤーも止まる）', () => {
    const game = newGame();
    const before = game.aliens.map((a) => a.respawnTimer);
    stepN(game, 120, input({ dir: 'LEFT' }));
    expect(game.state).toBe('START');
    expect(game.aliens.map((a) => a.respawnTimer)).toEqual(before);
    expect(position(game.player)).toEqual(PLAYER_START);
  });

  it('Enter で PLAYING になる（仕様 4章）', () => {
    const game = newGame();
    game.step(FIXED_STEP_MS, ENTER);
    expect(game.state).toBe('PLAYING');
  });

  it('Enter を押していなければ START のまま（押下エッジだけで遷移、仕様 14.3）', () => {
    const game = newGame();
    stepN(game, 10);
    expect(game.state).toBe('START');
  });

  it('START から PLAYING にしても盤面は作り直さない（起動時の盤面のまま遊ぶ）', () => {
    const game = newGame();
    const grid = game.grid;
    const gold = game.gold;
    game.step(FIXED_STEP_MS, ENTER);
    expect(game.grid).toBe(grid);
    expect(game.gold).toBe(gold);
  });
});

describe('Game：PLAYING（仕様 4章・11章）', () => {
  it('ロジックを進める（エイリアンの出現までの時間が減る）', () => {
    const game = newGame();
    game.step(FIXED_STEP_MS, ENTER);
    const before = game.aliens[0].respawnTimer;
    stepN(game, 10);
    expect(game.aliens[0].respawnTimer).toBeLessThan(before);
  });

  it('Enter は無視する（仕様 5.1）', () => {
    const game = newGame();
    game.step(FIXED_STEP_MS, ENTER);
    const grid = game.grid;
    stepN(game, 3, ENTER);
    expect(game.state).toBe('PLAYING');
    expect(game.level).toBe(1);
    expect(game.grid).toBe(grid);
  });

  it('何も起きないステップはイベントを返さない', () => {
    const game = newGame();
    expect(game.step(FIXED_STEP_MS, NO_INPUT)).toEqual([]);
    expect(game.step(FIXED_STEP_MS, ENTER)).toEqual([]);
  });
});

describe('placeGold：金塊の配置（仕様 9.1 手順4・13.1 #3）', () => {
  const grid = generateMaze(createRng(3));

  it('指定の数だけ、通路に重ならずに置く', () => {
    const gold = placeGold(grid, 9, createRng(1));
    expect(gold).toHaveLength(9);
    expect(new Set(gold.map((g) => `${g.x},${g.y}`)).size).toBe(9);
    for (const g of gold) {
      expect(grid[g.y][g.x]).toBe(PATH);
      expect(g.collected).toBe(false);
    }
  });

  it('プレイヤー初期位置 (7,13) と中央 (7,7) には置かない（仕様 9.1 手順4）', () => {
    for (let seed = 0; seed < 50; seed++) {
      for (const g of placeGold(grid, 60, createRng(seed))) {
        expect(position(g)).not.toEqual(PLAYER_START);
        expect(position(g)).not.toEqual(PORTAL_POS);
      }
    }
  });

  it('置ける通路マスより多く求められたら、置けるだけ置く（無限ループしない、仕様 13.1 #3）', () => {
    // 通路は (1,1)〜(4,1) と (7,7)・(7,13) の6マス。金塊を置けるのは4マス
    const small = closedGrid([
      { x: 1, y: 1 },
      { x: 2, y: 1 },
      { x: 3, y: 1 },
      { x: 4, y: 1 },
      PORTAL_POS,
      PLAYER_START,
    ]);
    const gold = placeGold(small, 10, createRng(1));
    expect(gold).toHaveLength(4);
  });

  it('高いレベルの金塊数でも、迷路の通路マス数で頭打ちになる', () => {
    let paths = 0;
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if (grid[y][x] === PATH) paths++;
    expect(placeGold(grid, goldCount(200), createRng(1))).toHaveLength(paths - 2);
  });

  it('同じシードなら同じ配置になる', () => {
    expect(placeGold(grid, 11, createRng(5))).toEqual(placeGold(grid, 11, createRng(5)));
  });
});
