import { describe, expect, it } from 'vitest';
import { HOLE_MAX_STAGE } from '../../src/core/config';
import { Holes } from '../../src/core/holes';

describe('Holes：穴の深さの管理（仕様 7章）', () => {
  it('初めは穴がない（深さ 0）', () => {
    const holes = new Holes();
    expect(holes.stageAt(3, 5)).toBe(0);
    expect(holes.has(3, 5)).toBe(false);
    expect(holes.entries()).toEqual([]);
  });

  it('掘ると stage 1 の穴ができる（仕様 5.3 手順5-2・7章）', () => {
    const holes = new Holes();
    expect(holes.dig(3, 5)).toBe(1);
    expect(holes.stageAt(3, 5)).toBe(1);
    expect(holes.has(3, 5)).toBe(true);
  });

  it('掘るたびに1段深くなり、stage 3 で上限（仕様 7章・15.3）', () => {
    const holes = new Holes();
    expect(holes.dig(3, 5)).toBe(1);
    expect(holes.dig(3, 5)).toBe(2);
    expect(holes.dig(3, 5)).toBe(3);
    // 仕様 5.3：stage 3 なら変化なし
    expect(holes.dig(3, 5)).toBe(HOLE_MAX_STAGE);
    expect(holes.stageAt(3, 5)).toBe(3);
  });

  it('埋めると1段浅くなり、0 になったら穴が消える（仕様 7章・15.3）', () => {
    const holes = new Holes();
    holes.dig(3, 5);
    holes.dig(3, 5);
    holes.dig(3, 5);
    expect(holes.fill(3, 5)).toBe(true);
    expect(holes.stageAt(3, 5)).toBe(2);
    expect(holes.fill(3, 5)).toBe(true);
    expect(holes.stageAt(3, 5)).toBe(1);
    expect(holes.fill(3, 5)).toBe(true);
    expect(holes.stageAt(3, 5)).toBe(0);
    expect(holes.has(3, 5)).toBe(false);
    expect(holes.entries()).toEqual([]);
  });

  it('穴のないマスを埋めても何も変わらず、穴がなかったことを返す（仕様 5.3・15.3）', () => {
    const holes = new Holes();
    holes.dig(1, 1);
    // 仕様 5.3：穴がなければ何もせず、クールダウンも設定しない。その判断のため false を返す
    expect(holes.fill(3, 5)).toBe(false);
    expect(holes.stageAt(3, 5)).toBe(0);
    expect(holes.entries()).toEqual([{ x: 1, y: 1, stage: 1 }]);
  });

  it('マスごとに別々の穴を持つ（通路マスに1つだけ、仕様 7章）', () => {
    const holes = new Holes();
    holes.dig(1, 1);
    holes.dig(1, 1);
    holes.dig(11, 1);
    // x と y を取り違えないこと
    holes.dig(1, 11);
    holes.dig(1, 11);
    holes.dig(1, 11);
    expect(holes.stageAt(1, 1)).toBe(2);
    expect(holes.stageAt(11, 1)).toBe(1);
    expect(holes.stageAt(1, 11)).toBe(3);
    expect(holes.entries()).toHaveLength(3);
  });

  it('remove で深さに関係なく穴を消す（エイリアンの脱出・撃破、仕様 7章）', () => {
    const holes = new Holes();
    holes.dig(3, 5);
    holes.dig(3, 5);
    holes.dig(3, 5);
    holes.remove(3, 5);
    expect(holes.has(3, 5)).toBe(false);
    // 穴のないマスを remove しても問題ない
    holes.remove(9, 9);
    expect(holes.entries()).toEqual([]);
  });

  it('clear ですべての穴を消す（レベル開始、仕様 7章）', () => {
    const holes = new Holes();
    holes.dig(1, 1);
    holes.dig(3, 5);
    holes.clear();
    expect(holes.entries()).toEqual([]);
    expect(holes.has(1, 1)).toBe(false);
  });

  it('entries で描画用に全部の穴の位置と深さを返す（仕様 12.5）', () => {
    const holes = new Holes();
    holes.dig(5, 3);
    holes.dig(5, 3);
    holes.dig(7, 9);
    expect(holes.entries()).toEqual(
      expect.arrayContaining([
        { x: 5, y: 3, stage: 2 },
        { x: 7, y: 9, stage: 1 },
      ]),
    );
    expect(holes.entries()).toHaveLength(2);
  });
});
