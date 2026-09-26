// シード指定できる乱数とシャッフル（仕様 13.1 #12、13.2、15.5）。
// ロジック層は Math.random() を使わず、この Rng を引数で受け取る。
// シードを固定すればテストで結果を再現でき、本番でも不具合を再現できる。

/** 乱数の供給元。next() は 0 以上 1 未満の値を返す */
export interface Rng {
  next(): number;
}

/**
 * 32ビット整数のシードから乱数を作る（mulberry32）。
 * 本番のシードは crypto.getRandomValues() で作る 32ビット値のため（15.5）、それに合わせた方式を使う
 */
export function createRng(seed: number): Rng {
  let state = seed >>> 0;
  return {
    next(): number {
      state = (state + 0x6d2b79f5) >>> 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
  };
}

/** 0 以上 n 未満の整数 */
export function randomInt(rng: Rng, n: number): number {
  return Math.floor(rng.next() * n);
}

/**
 * Fisher–Yates で並べ替えた新しい配列を返す。元の配列は書き換えない。
 * 原作の sort(() => Math.random() - 0.5) は並びに偏りがあるため置き換える（13.1 #12）
 */
export function shuffle<T>(rng: Rng, items: readonly T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = randomInt(rng, i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
