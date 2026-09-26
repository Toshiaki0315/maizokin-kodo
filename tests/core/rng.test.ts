import { describe, expect, it } from 'vitest';
import { createRng, randomInt, shuffle, type Rng } from '../../src/core/rng';

/** 決まった値を順に返す Rng（テスト用）。乱数の使われ方を固定して検証するため */
function sequenceRng(values: number[]): Rng {
  let i = 0;
  return { next: () => values[i++ % values.length] };
}

function take(rng: Rng, count: number): number[] {
  return Array.from({ length: count }, () => rng.next());
}

describe('createRng：シード指定できる乱数（仕様 13.2・15.5）', () => {
  it('同じシードなら同じ乱数列になる（仕様 15.3）', () => {
    expect(take(createRng(12345), 100)).toEqual(take(createRng(12345), 100));
  });

  it('違うシードなら違う乱数列になる', () => {
    expect(take(createRng(1), 10)).not.toEqual(take(createRng(2), 10));
  });

  it('値は 0 以上 1 未満（仕様 15.3）', () => {
    // シード 0 と 32ビットの最大値という端のシードも含めて確かめる
    for (const seed of [0, 1, 42, 0xffffffff]) {
      for (const value of take(createRng(seed), 1000)) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThan(1);
      }
    }
  });

  it('値が偏らず 0〜1 に散らばる（10区間すべてに値が入る）', () => {
    const buckets = new Array<number>(10).fill(0);
    for (const value of take(createRng(7), 1000)) {
      buckets[Math.floor(value * 10)]++;
    }
    for (const count of buckets) {
      expect(count).toBeGreaterThan(50);
    }
  });
});

describe('randomInt：0 以上 n 未満の整数', () => {
  it('next() の値を n 倍して切り捨てる', () => {
    expect(randomInt(sequenceRng([0]), 4)).toBe(0);
    expect(randomInt(sequenceRng([0.49]), 4)).toBe(1);
    expect(randomInt(sequenceRng([0.999999]), 4)).toBe(3);
  });

  it('シード付きの乱数でも常に範囲内', () => {
    const rng = createRng(99);
    for (let i = 0; i < 1000; i++) {
      const value = randomInt(rng, 3);
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(3);
    }
  });
});

describe('shuffle：Fisher–Yates シャッフル（仕様 13.1 #12）', () => {
  it('結果は元の配列の並べ替えになっている（仕様 15.3）', () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const result = shuffle(createRng(3), items);
    expect(result).toHaveLength(items.length);
    expect([...result].sort((a, b) => a - b)).toEqual(items);
  });

  it('元の配列は書き換えない', () => {
    const items = ['UP', 'DOWN', 'LEFT', 'RIGHT'];
    shuffle(createRng(3), items);
    expect(items).toEqual(['UP', 'DOWN', 'LEFT', 'RIGHT']);
  });

  it('同じシードなら同じ並びになる', () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8];
    expect(shuffle(createRng(5), items)).toEqual(shuffle(createRng(5), items));
  });

  it('後ろから順に、自分以前の位置と入れ替える（Fisher–Yates の手順）', () => {
    // i=3: randomInt(4)=floor(0.0*4)=0 → [d,b,c,a]
    // i=2: randomInt(3)=floor(0.5*3)=1 → [d,c,b,a]
    // i=1: randomInt(2)=floor(0.9*2)=1 → そのまま
    expect(shuffle(sequenceRng([0.0, 0.5, 0.9]), ['a', 'b', 'c', 'd'])).toEqual(['d', 'c', 'b', 'a']);
  });

  it('4方向の並びが24通りすべて現れる（偏りの大きい sort 方式ではない）', () => {
    const rng = createRng(11);
    const seen = new Set<string>();
    for (let i = 0; i < 2000; i++) {
      seen.add(shuffle(rng, ['UP', 'DOWN', 'LEFT', 'RIGHT']).join(','));
    }
    expect(seen.size).toBe(24);
  });

  it('空の配列と1要素の配列はそのまま返す', () => {
    expect(shuffle(createRng(1), [])).toEqual([]);
    expect(shuffle(createRng(1), ['only'])).toEqual(['only']);
  });
});
