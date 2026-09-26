import { describe, expect, it } from 'vitest';
import { FIXED_STEP_MS, MAX_STEPS_PER_FRAME } from '../../src/core/config';
import { FixedStepLoop } from '../../src/core/loop';

// 読みやすさのため、1ステップ 10ms・上限 3 ステップのループでも確かめる
const STEP = 10;
const MAX = 3;

describe('FixedStepLoop：固定タイムステップの計算（仕様 14.3）', () => {
  it('1ステップ分の経過時間で 1 ステップ進む', () => {
    const loop = new FixedStepLoop(STEP, MAX);
    expect(loop.advance(10)).toBe(1);
  });

  it('経過時間に応じたステップ数になる（仕様 15.3）', () => {
    const loop = new FixedStepLoop(STEP, MAX);
    expect(loop.advance(0)).toBe(0);
    expect(loop.advance(20)).toBe(2);
    expect(loop.advance(30)).toBe(3);
  });

  it('1ステップに満たない端数は次のフレームに繰り越す（仕様 15.3）', () => {
    const loop = new FixedStepLoop(STEP, MAX);
    expect(loop.advance(4)).toBe(0);
    expect(loop.advance(4)).toBe(0);
    expect(loop.advance(4)).toBe(1); // 12ms → 1ステップ、2ms 繰り越し
    expect(loop.advance(8)).toBe(1); // 10ms → 1ステップ
    expect(loop.advance(25)).toBe(2); // 25ms → 2ステップ、5ms 繰り越し
    expect(loop.advance(5)).toBe(1);
  });

  it('1フレームの上限を超えたら上限で打ち切り、超えた経過時間は捨てる（仕様 14.3・13.1 #2・15.3）', () => {
    const loop = new FixedStepLoop(STEP, MAX);
    expect(loop.advance(1000)).toBe(MAX);
    // 捨てた経過時間は次のフレームに持ち越さない
    expect(loop.advance(0)).toBe(0);
    expect(loop.advance(5)).toBe(0);
    expect(loop.advance(5)).toBe(1);
  });

  it('上限ちょうどまでは端数を捨てずに繰り越す', () => {
    const loop = new FixedStepLoop(STEP, MAX);
    expect(loop.advance(35)).toBe(3); // 3ステップ＋5ms は上限内
    expect(loop.advance(5)).toBe(1);
  });

  it('上限を超えたときは端数も含めて捨てる', () => {
    const loop = new FixedStepLoop(STEP, MAX);
    expect(loop.advance(47)).toBe(3); // 4.7ステップ分 → 3ステップ、残りは捨てる
    expect(loop.advance(9)).toBe(0);
  });

  it('負の値や数でない値は 0 として扱い、繰り越し分を壊さない', () => {
    const loop = new FixedStepLoop(STEP, MAX);
    expect(loop.advance(6)).toBe(0);
    expect(loop.advance(-100)).toBe(0);
    expect(loop.advance(Number.NaN)).toBe(0);
    expect(loop.advance(4)).toBe(1);
  });

  it('既定値は仕様 2章の固定ステップ（1000/60ms）と上限（5ステップ）', () => {
    const loop = new FixedStepLoop();
    expect(loop.advance(FIXED_STEP_MS)).toBe(1);
    expect(loop.advance(1000)).toBe(MAX_STEPS_PER_FRAME);
  });

  it('60fps のフレームを1秒分与えると 60 ステップ進む', () => {
    const loop = new FixedStepLoop();
    let steps = 0;
    for (let i = 0; i < 60; i++) steps += loop.advance(1000 / 60);
    expect(steps).toBe(60);
  });

  it('1ステップを3等分して与えても、小数の誤差で1ステップ遅れない', () => {
    const loop = new FixedStepLoop();
    const third = FIXED_STEP_MS / 3;
    expect(loop.advance(third)).toBe(0);
    expect(loop.advance(third)).toBe(0);
    expect(loop.advance(third)).toBe(1);
  });

  it('ばらつきのあるフレーム時間でも、合計時間ぶんのステップが進む', () => {
    const loop = new FixedStepLoop();
    let steps = 0;
    // 16.6ms と 16.8ms を交互に 600 フレーム（合計 10 秒）
    for (let i = 0; i < 600; i++) steps += loop.advance(i % 2 === 0 ? 16.6 : 16.8);
    expect(steps).toBe(600);
  });
});
