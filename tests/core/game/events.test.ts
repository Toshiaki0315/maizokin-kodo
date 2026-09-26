import { describe, expect, it } from 'vitest';
import { Alien } from '../../../src/core/alien';
import { FIXED_STEP_MS } from '../../../src/core/config';
import type { GameEvent } from '../../../src/core/game';
import { openGrid, sequenceRng } from '../helpers';
import { NO_INPUT, PAUSE, input, playingGame, stepN } from './gameHelpers';

const ofType = (events: GameEvent[], type: GameEvent['type']) => events.filter((e) => e.type === type);

const DIG = input({ dig: true });
const FILL = input({ fill: true });

describe('エフェクト用イベント（仕様 14.5・16.15）', () => {
  it('金塊を取ったら、その位置で goldCollected を1回返す', () => {
    const game = playingGame();
    game.gold.push({ x: 7, y: 12, collected: false });
    const events = stepN(game, 30, input({ dir: 'UP' }));
    expect(ofType(events, 'goldCollected')).toEqual([{ type: 'goldCollected', x: 7, y: 12 }]);
  });

  it('穴を掘ったら、掘ったマスで holeDug を返す。押しっぱなしでも深くなった3回だけ', () => {
    const game = playingGame();
    const events = stepN(game, 120, DIG);
    expect(ofType(events, 'holeDug')).toEqual([
      { type: 'holeDug', x: 7, y: 12 },
      { type: 'holeDug', x: 7, y: 12 },
      { type: 'holeDug', x: 7, y: 12 },
    ]);
  });

  it('前方が壁なら holeDug を返さない', () => {
    const game = playingGame();
    game.grid = openGrid([{ x: 7, y: 12 }]);
    expect(ofType(stepN(game, 30, DIG), 'holeDug')).toEqual([]);
  });

  it('穴を埋めたら、埋めたマスで holeFilled を返す。穴が消えるまでの回数だけ', () => {
    const game = playingGame();
    game.holes.dig(7, 12);
    game.holes.dig(7, 12);
    const events = stepN(game, 120, FILL);
    expect(ofType(events, 'holeFilled')).toEqual([
      { type: 'holeFilled', x: 7, y: 12 },
      { type: 'holeFilled', x: 7, y: 12 },
    ]);
  });

  it('穴のないマスを埋めようとしても holeFilled を返さない', () => {
    const game = playingGame();
    expect(ofType(stepN(game, 30, FILL), 'holeFilled')).toEqual([]);
  });

  it('エイリアンを倒したら、その位置と色で alienKilled を1回返す', () => {
    const game = playingGame();
    const alien = new Alien(sequenceRng(0), 0, '#3388FF', 450);
    alien.x = 7;
    alien.y = 12;
    alien.state = 'TRAPPED';
    alien.trapTimer = 5000;
    game.holes.dig(7, 12);
    game.aliens = [alien];
    const events = stepN(game, 10, FILL);
    expect(ofType(events, 'alienKilled')).toEqual([{ type: 'alienKilled', x: 7, y: 12, color: '#3388FF' }]);
  });

  it('階段が出たら stairsAppeared を1回返す。金塊の取得と同じステップなら、金塊 → 階段 の順', () => {
    const game = playingGame();
    game.gold = [{ x: 7, y: 12, collected: false }];
    const first = game.step(FIXED_STEP_MS, input({ dir: 'UP' }));
    expect(first).toEqual([
      { type: 'goldCollected', x: 7, y: 12 },
      { type: 'stairsAppeared' },
    ]);
    expect(ofType(stepN(game, 30), 'stairsAppeared')).toEqual([]);
  });

  it('ミスしたら miss を1回返し、MISS の間は繰り返さない', () => {
    const game = playingGame();
    const alien = new Alien(sequenceRng(0), 0, '#FF3333', 450);
    alien.x = 7;
    alien.y = 13;
    game.aliens = [alien];
    const events = stepN(game, 60);
    expect(ofType(events, 'miss')).toEqual([{ type: 'miss' }]);
  });

  it('一時停止中は、操作してもイベントを返さない', () => {
    const game = playingGame();
    game.step(FIXED_STEP_MS, PAUSE);
    expect(stepN(game, 30, DIG)).toEqual([]);
    expect(stepN(game, 30, NO_INPUT)).toEqual([]);
  });
});
