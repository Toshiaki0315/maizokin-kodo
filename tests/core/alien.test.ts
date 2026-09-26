import { describe, expect, it } from 'vitest';
import { Alien, createAliens, isPortalShown, type AlienContext } from '../../src/core/alien';
import { ALIEN_COLORS, FIXED_STEP_MS, PORTAL_POS, type Dir, type Point } from '../../src/core/config';
import { Holes } from '../../src/core/holes';
import { createRng, type Rng } from '../../src/core/rng';
import { closedGrid, openGrid, sequenceRng } from './helpers';

// ---- テスト用の道具 ----

// プレイヤーを置く、どのテストのエイリアンとも同じ行・列にならない場所
const FAR_AWAY: Point = { x: 13, y: 13 };

function context(overrides: Partial<AlienContext> = {}): AlienContext {
  return {
    grid: openGrid(),
    holes: new Holes(),
    player: FAR_AWAY,
    stairsVisible: false,
    ...overrides,
  };
}

/** (x, y) に dir を向いて歩いているエイリアン（移動間隔 450ms） */
function walkingAlien(x: number, y: number, dir: Dir = 'UP', rng: Rng = sequenceRng(0)): Alien {
  const alien = new Alien(rng, 0, ALIEN_COLORS[0], 450);
  alien.x = x;
  alien.y = y;
  alien.dir = dir;
  return alien;
}

/** 移動間隔ちょうどの時間を与えて1マス動かす */
function moveOnce(alien: Alien, ctx: AlienContext): void {
  alien.update(alien.moveInterval, ctx);
}

function stepsUntil(alien: Alien, ctx: AlienContext, done: () => boolean, limit = 10000): number {
  for (let step = 1; step <= limit; step++) {
    alien.update(FIXED_STEP_MS, ctx);
    if (done()) return step;
  }
  throw new Error('条件を満たさなかった');
}

// ---- 生成（仕様 8.1・8.2） ----

describe('createAliens：エイリアンの生成（仕様 8.1）', () => {
  it.each([
    [1, 3],
    [2, 4],
    [3, 5],
    [4, 5],
    [10, 5],
  ])('レベル %i では %i 体（2 + level、最大5体。仕様 8.1・13.1 #4）', (level, count) => {
    expect(createAliens(level, createRng(1))).toHaveLength(count);
  });

  it('全員 (7,7) で WAITING_SPAWN。i 番目の出現遅延は (i+1)×1000ms（仕様 8.1・8.2）', () => {
    const aliens = createAliens(3, createRng(1));
    aliens.forEach((alien, i) => {
      expect(alien.state).toBe('WAITING_SPAWN');
      expect({ x: alien.x, y: alien.y }).toEqual(PORTAL_POS);
      expect(alien.respawnTimer).toBe((i + 1) * 1000);
      expect(alien.portalTimer).toBe(1000);
      expect(alien.trapTimer).toBe(0);
      expect(alien.moveTimer).toBe(0);
    });
  });

  it('色は 赤・青・黄・緑・紫 の順（仕様 8.1）', () => {
    expect(createAliens(3, createRng(1)).map((a) => a.color)).toEqual(ALIEN_COLORS);
  });

  it.each([
    [1, 450],
    [2, 430],
    [11, 250],
    [20, 250],
  ])('レベル %i の移動間隔は %ims で全員共通（仕様 16.17）', (level, interval) => {
    for (const alien of createAliens(level, createRng(1))) {
      expect(alien.moveInterval).toBe(interval);
    }
  });

  it('初めの向きは乱数で4方向から選ぶ（仕様 8.2）', () => {
    expect(new Alien(sequenceRng(0), 1000, '#FF3333', 450).dir).toBe('UP');
    expect(new Alien(sequenceRng(0.3), 1000, '#FF3333', 450).dir).toBe('DOWN');
    expect(new Alien(sequenceRng(0.6), 1000, '#FF3333', 450).dir).toBe('LEFT');
    expect(new Alien(sequenceRng(0.9), 1000, '#FF3333', 450).dir).toBe('RIGHT');
  });

  it('出現遅延が 0 なら最初から WALKING（仕様 8.2）', () => {
    const alien = new Alien(sequenceRng(0), 0, '#FF3333', 450);
    expect(alien.state).toBe('WALKING');
    expect(alien.respawnTimer).toBe(0);
  });
});

// ---- 出現（仕様 8.3 手順1・16.13） ----

describe('出現：WAITING_SPAWN（仕様 8.3 手順1）', () => {
  it('出現遅延が過ぎたら (7,7) に WALKING で現れ、そのステップは動かない', () => {
    const alien = new Alien(sequenceRng(0), 1000, '#FF3333', 450);
    const ctx = context();
    alien.update(600, ctx);
    expect(alien.state).toBe('WAITING_SPAWN');
    expect(alien.respawnTimer).toBe(400);
    alien.update(400, ctx);
    expect(alien.state).toBe('WALKING');
    expect({ x: alien.x, y: alien.y }).toEqual(PORTAL_POS);
    expect(alien.portalTimer).toBe(1000);
    expect(alien.trapTimer).toBe(0);
  });

  it('出現時に向きを乱数で選び直す（仕様 8.3 手順1）', () => {
    // 生成時に 0（UP）、出現時に 0.9（RIGHT）を引く
    const alien = new Alien(sequenceRng(0, 0.9), 1000, '#FF3333', 450);
    expect(alien.dir).toBe('UP');
    alien.update(1000, context());
    expect(alien.dir).toBe('RIGHT');
  });

  it('固定ステップでは 1000ms の出現遅延が 60〜61 ステップで出現する（最大1ステップの遅れを許容、仕様 14.3）', () => {
    const alien = new Alien(sequenceRng(0), 1000, '#FF3333', 450);
    const steps = stepsUntil(alien, context(), () => alien.state === 'WALKING');
    expect(steps).toBeGreaterThanOrEqual(60);
    expect(steps).toBeLessThanOrEqual(61);
  });

  it('階段が出ている間は出現せず、出現までの時間も進まない（仕様 16.13）', () => {
    const alien = new Alien(sequenceRng(0), 1000, '#FF3333', 450);
    const ctx = context({ stairsVisible: true });
    alien.update(600, ctx);
    alien.update(100000, ctx);
    expect(alien.state).toBe('WAITING_SPAWN');
    expect(alien.respawnTimer).toBe(1000);
  });

  it('階段が出ていても、歩いているエイリアンはそのまま動く（仕様 16.13）', () => {
    const alien = walkingAlien(3, 3, 'RIGHT', sequenceRng(0));
    moveOnce(alien, context({ grid: closedGrid([{ x: 3, y: 3 }, { x: 4, y: 3 }]), stairsVisible: true }));
    expect({ x: alien.x, y: alien.y }).toEqual({ x: 4, y: 3 });
  });
});

// ---- 移動（仕様 8.3 手順5・8.4） ----

describe('移動の周期（仕様 8.3 手順5・16.17）', () => {
  it('移動間隔に達したステップで1マス進む', () => {
    const alien = walkingAlien(3, 3, 'RIGHT');
    const ctx = context({ grid: closedGrid([3, 4, 5, 6].map((x) => ({ x, y: 3 }))) });
    alien.update(449, ctx);
    expect(alien.x).toBe(3);
    alien.update(1, ctx);
    expect(alien.x).toBe(4);
  });

  it('移動したら移動タイマーを 0 に戻し、余った時間は捨てる（仕様 8.3 手順5）', () => {
    const alien = walkingAlien(3, 3, 'RIGHT');
    const ctx = context({ grid: closedGrid([3, 4, 5, 6].map((x) => ({ x, y: 3 }))) });
    alien.update(300, ctx);
    alien.update(300, ctx); // 600ms → 移動。余った 150ms は捨てる
    expect(alien.x).toBe(4);
    expect(alien.moveTimer).toBe(0);
    alien.update(300, ctx); // 余りを持ち越していればここで動いてしまう
    expect(alien.x).toBe(4);
    alien.update(300, ctx);
    expect(alien.x).toBe(5);
  });

  it.each([
    [450, 27],
    [430, 26],
    [250, 16],
  ])('固定ステップでは移動間隔 %ims が %i ステップごとになる（仕様 14.3・16.17）', (interval, expectedSteps) => {
    const alien = new Alien(sequenceRng(0), 0, '#FF3333', interval);
    alien.x = 3;
    alien.y = 3;
    alien.dir = 'RIGHT';
    const ctx = context({ grid: closedGrid([3, 4, 5].map((x) => ({ x, y: 3 }))) });
    expect(stepsUntil(alien, ctx, () => alien.x === 4)).toBe(expectedSteps);
  });
});

describe('移動AI：追跡（仕様 8.4 手順1）', () => {
  it.each<[string, Point, Dir]>([
    ['上', { x: 7, y: 2 }, 'UP'],
    ['下', { x: 7, y: 12 }, 'DOWN'],
    ['左', { x: 2, y: 7 }, 'LEFT'],
    ['右', { x: 12, y: 7 }, 'RIGHT'],
  ])('同じ列・行で間に壁がなければ、プレイヤーのいる%sへ進む', (_, player, dir) => {
    // 逆走防止に掛からないよう、向きは追跡方向と同じにしておく。乱数は使わない
    const alien = walkingAlien(7, 7, dir, sequenceRng(0.99));
    moveOnce(alien, context({ player }));
    expect(alien.dir).toBe(dir);
    expect({ x: alien.x, y: alien.y }).toEqual({
      x: 7 + (dir === 'RIGHT' ? 1 : dir === 'LEFT' ? -1 : 0),
      y: 7 + (dir === 'DOWN' ? 1 : dir === 'UP' ? -1 : 0),
    });
  });

  it('プレイヤーの方向が逆方向でも追跡する（追跡は逆走防止より優先、仕様 8.4 手順3）', () => {
    const alien = walkingAlien(7, 7, 'UP', sequenceRng(0));
    moveOnce(alien, context({ player: { x: 7, y: 12 } }));
    expect(alien.dir).toBe('DOWN');
  });

  it('間に壁があれば追跡しない（仕様 8.4 手順1）', () => {
    // (7,5) の壁で上の視線が切れる。向きは DOWN なので逆走防止で UP も候補から外れ、左右から選ぶ
    const alien = walkingAlien(7, 7, 'DOWN', sequenceRng(0));
    moveOnce(alien, context({ grid: openGrid([{ x: 7, y: 5 }]), player: { x: 7, y: 2 } }));
    expect(alien.dir).not.toBe('UP');
  });

  it('同じ行でも、間に壁があれば追跡しない（仕様 8.4 手順1）', () => {
    // (5,7) の壁で左の視線が切れる。向きは RIGHT なので逆走防止で LEFT も候補から外れ、上下右から選ぶ
    const alien = walkingAlien(7, 7, 'RIGHT', sequenceRng(0));
    moveOnce(alien, context({ grid: openGrid([{ x: 5, y: 7 }]), player: { x: 2, y: 7 } }));
    expect(alien.dir).not.toBe('LEFT');
  });

  it('穴は視線を遮らない（仕様 8.4 手順1）', () => {
    const holes = new Holes();
    holes.dig(7, 5);
    holes.dig(7, 5);
    holes.dig(7, 5);
    const alien = walkingAlien(7, 7, 'DOWN', sequenceRng(0.99));
    moveOnce(alien, context({ holes, player: { x: 7, y: 2 } }));
    expect(alien.dir).toBe('UP');
  });

  it('隣のマスにいるプレイヤーも追跡する（間のマスがないので視線は通る）', () => {
    const alien = walkingAlien(7, 7, 'UP', sequenceRng(0.99));
    moveOnce(alien, context({ player: { x: 8, y: 7 } }));
    expect({ x: alien.x, y: alien.y }).toEqual({ x: 8, y: 7 });
  });

  it('同じマスにいるときは上を追跡方向とする（仕様 8.4 手順1）', () => {
    const alien = walkingAlien(7, 7, 'LEFT', sequenceRng(0.99));
    moveOnce(alien, context({ player: { x: 7, y: 7 } }));
    expect(alien.dir).toBe('UP');
  });

  it('追跡方向が壁なら、ランダムな方向に進む（仕様 8.4 手順3）', () => {
    // 同じマスにいて追跡方向は UP だが、上は壁。候補は 下・左・右 から逆走の右を除いた 下・左 で、乱数 0 → 下
    const alien = walkingAlien(7, 7, 'LEFT', sequenceRng(0));
    moveOnce(alien, context({ grid: openGrid([{ x: 7, y: 6 }]), player: { x: 7, y: 7 } }));
    expect({ x: alien.x, y: alien.y, dir: alien.dir }).toEqual({ x: 7, y: 8, dir: 'DOWN' });
  });
});

describe('移動AI：ランダム歩行（仕様 8.4 手順2〜4）', () => {
  // 十字路の中心 (7,7)。4方向とも通路
  const crossroads = context();

  it.each<[number, Dir]>([
    [0, 'UP'],
    [0.5, 'DOWN'],
    [0.99, 'LEFT'],
  ])('逆走を除いた候補から一様に選ぶ：向き LEFT なら RIGHT を除いた 上・下・左 から、乱数 %d → %s', (value, expected) => {
    // dir は前回の移動方向。候補は DIRS の順（上・下・左・右）から逆方向を除いたもの
    const alien = walkingAlien(7, 7, 'LEFT', sequenceRng(value));
    moveOnce(alien, crossroads);
    expect(alien.dir).toBe(expected);
  });

  it('シードを固定した乱数で、逆走を選ばず、ほかの3方向はどれも選ばれる（仕様 8.4 手順3）', () => {
    const chosen = new Set<Dir>();
    for (let seed = 0; seed < 200; seed++) {
      const alien = walkingAlien(7, 7, 'RIGHT', createRng(seed));
      moveOnce(alien, crossroads);
      chosen.add(alien.dir);
    }
    expect(chosen).toEqual(new Set<Dir>(['UP', 'DOWN', 'RIGHT']));
  });

  it('同じシードなら同じ方向を選ぶ', () => {
    const a = walkingAlien(7, 7, 'RIGHT', createRng(123));
    const b = walkingAlien(7, 7, 'RIGHT', createRng(123));
    for (let i = 0; i < 20; i++) {
      moveOnce(a, crossroads);
      moveOnce(b, crossroads);
    }
    expect({ x: a.x, y: a.y, dir: a.dir }).toEqual({ x: b.x, y: b.y, dir: b.dir });
  });

  it('壁の方向には進まない（候補は隣が通路の方向だけ、仕様 8.4 手順2）', () => {
    // 右に進む一本道。上下は壁
    const grid = closedGrid([2, 3, 4].map((x) => ({ x, y: 5 })));
    const alien = walkingAlien(3, 5, 'RIGHT', sequenceRng(0));
    moveOnce(alien, context({ grid }));
    expect({ x: alien.x, y: alien.y, dir: alien.dir }).toEqual({ x: 4, y: 5, dir: 'RIGHT' });
  });

  it('行き止まりでは逆方向に戻る（逆走を除くと候補がないときの例外、仕様 8.4 手順3）', () => {
    const grid = closedGrid([2, 3].map((x) => ({ x, y: 5 })));
    const alien = walkingAlien(3, 5, 'RIGHT', sequenceRng(0));
    moveOnce(alien, context({ grid }));
    expect({ x: alien.x, y: alien.y, dir: alien.dir }).toEqual({ x: 2, y: 5, dir: 'LEFT' });
  });

  it('穴の有無は進む方向の候補に影響しない（仕様 8.4 手順2）', () => {
    const grid = closedGrid([2, 3, 4].map((x) => ({ x, y: 5 })));
    const holes = new Holes();
    holes.dig(4, 5);
    const alien = walkingAlien(3, 5, 'RIGHT', sequenceRng(0));
    moveOnce(alien, context({ grid, holes }));
    expect(alien.x).toBe(4);
  });

  it('四方を壁に囲まれていれば動かない', () => {
    const alien = walkingAlien(3, 5, 'RIGHT', sequenceRng(0));
    moveOnce(alien, context({ grid: closedGrid([{ x: 3, y: 5 }]) }));
    expect({ x: alien.x, y: alien.y, dir: alien.dir }).toEqual({ x: 3, y: 5, dir: 'RIGHT' });
  });
});

// ---- 捕獲・撃破・脱出（仕様 7章・8.3 手順3〜4・8.4 手順5） ----

/** (x, y) に深さ stage の穴を掘った Holes */
function holesWith(x: number, y: number, stage: number): Holes {
  const holes = new Holes();
  for (let i = 0; i < stage; i++) holes.dig(x, y);
  return holes;
}

/** (4,5) の stage 3 の穴に捕まったエイリアン */
function trappedAlien(): { alien: Alien; ctx: AlienContext } {
  const grid = closedGrid([3, 4, 5].map((x) => ({ x, y: 5 })));
  const ctx = context({ grid, holes: holesWith(4, 5, 3) });
  const alien = walkingAlien(3, 5, 'RIGHT', sequenceRng(0));
  moveOnce(alien, ctx);
  return { alien, ctx };
}

describe('捕獲（仕様 7章・8.4 手順5）', () => {
  it('stage 3 の穴に入ると TRAPPED になり、捕獲時間は 5000ms（仕様 15.3）', () => {
    const { alien } = trappedAlien();
    expect(alien.state).toBe('TRAPPED');
    expect({ x: alien.x, y: alien.y }).toEqual({ x: 4, y: 5 });
    expect(alien.trapTimer).toBe(5000);
  });

  it.each([1, 2])('stage %i の穴は素通りし、穴は残る（仕様 7章・15.3）', (stage) => {
    const grid = closedGrid([3, 4, 5].map((x) => ({ x, y: 5 })));
    const holes = holesWith(4, 5, stage);
    const alien = walkingAlien(3, 5, 'RIGHT', sequenceRng(0));
    moveOnce(alien, context({ grid, holes }));
    expect(alien.state).toBe('WALKING');
    expect(holes.stageAt(4, 5)).toBe(stage);
  });

  it('立っているマスを後から stage 3 にしても捕獲されない（入った瞬間だけ判定、仕様 7章）', () => {
    const grid = closedGrid([3, 4].map((x) => ({ x, y: 5 })));
    const holes = holesWith(3, 5, 3);
    const alien = walkingAlien(3, 5, 'RIGHT', sequenceRng(0));
    alien.update(100, context({ grid, holes }));
    expect(alien.state).toBe('WALKING');
  });

  it('捕獲中は動かない（仕様 8.3 手順4）', () => {
    const { alien, ctx } = trappedAlien();
    alien.update(1000, ctx);
    alien.update(1000, ctx);
    expect({ x: alien.x, y: alien.y, state: alien.state }).toEqual({ x: 4, y: 5, state: 'TRAPPED' });
  });
});

describe('脱出（仕様 7章・8.3 手順4）', () => {
  it('5000ms 埋め切られなければ WALKING に戻り、穴が消える（仕様 15.3）', () => {
    const { alien, ctx } = trappedAlien();
    alien.update(4999, ctx);
    expect(alien.state).toBe('TRAPPED');
    alien.update(1, ctx);
    expect(alien.state).toBe('WALKING');
    expect(ctx.holes.has(4, 5)).toBe(false);
  });

  it('固定ステップでは 300 ステップで脱出する（仕様 14.3）', () => {
    const { alien, ctx } = trappedAlien();
    expect(stepsUntil(alien, ctx, () => alien.state === 'WALKING')).toBe(300);
  });

  it('途中まで埋めても（stage 1〜2）脱出までの時間は変わらない', () => {
    const { alien, ctx } = trappedAlien();
    ctx.holes.fill(4, 5);
    ctx.holes.fill(4, 5);
    alien.update(4999, ctx);
    expect(alien.state).toBe('TRAPPED');
    alien.update(1, ctx);
    expect(alien.state).toBe('WALKING');
    expect(ctx.holes.has(4, 5)).toBe(false);
  });
});

describe('撃破と再出現（仕様 7章・8.3 手順3〜4）', () => {
  it('捕獲中に穴を埋め切ると次の更新で DEAD になり、撃破を知らせる（+100 点は game.ts、仕様 15.3）', () => {
    const { alien, ctx } = trappedAlien();
    ctx.holes.fill(4, 5);
    ctx.holes.fill(4, 5);
    ctx.holes.fill(4, 5);
    expect(alien.update(FIXED_STEP_MS, ctx)).toBe('killed');
    expect(alien.state).toBe('DEAD');
  });

  it('撃破以外の更新では何も知らせない', () => {
    const { alien, ctx } = trappedAlien();
    expect(alien.update(FIXED_STEP_MS, ctx)).toBeNull();
    const walker = walkingAlien(7, 7);
    expect(walker.update(450, context())).toBeNull();
  });

  it('脱出の時間切れと同じステップで埋め切られたら、撃破が優先（仕様 8.3 手順4）', () => {
    const { alien, ctx } = trappedAlien();
    alien.update(4990, ctx);
    ctx.holes.remove(4, 5);
    expect(alien.update(100, ctx)).toBe('killed');
    expect(alien.state).toBe('DEAD');
  });

  it('DEAD は1ステップだけで、次の更新で WAITING_SPAWN になり 15000ms 後に再出現を待つ（仕様 8.3 手順3）', () => {
    const { alien, ctx } = trappedAlien();
    ctx.holes.remove(4, 5);
    alien.update(FIXED_STEP_MS, ctx);
    alien.update(FIXED_STEP_MS, ctx);
    expect(alien.state).toBe('WAITING_SPAWN');
    expect(alien.respawnTimer).toBe(15000);
    expect(alien.portalTimer).toBe(1000);
  });

  it('撃破から 15000ms 後に (7,7) に再出現する（仕様 15.3）', () => {
    const { alien, ctx } = trappedAlien();
    ctx.holes.remove(4, 5);
    alien.update(FIXED_STEP_MS, ctx); // DEAD
    alien.update(FIXED_STEP_MS, ctx); // WAITING_SPAWN、残り 15000ms
    alien.update(14999, ctx);
    expect(alien.state).toBe('WAITING_SPAWN');
    alien.update(1, ctx);
    expect(alien.state).toBe('WALKING');
    expect({ x: alien.x, y: alien.y }).toEqual(PORTAL_POS);
  });
});

// ---- ポータル（仕様 8.3 手順2・12.3・16.13） ----

describe('ポータルの表示時間（仕様 8.2・8.3 手順2）', () => {
  it('出現後は歩いている間 portalTimer が減っていく', () => {
    const alien = new Alien(sequenceRng(0), 1000, '#FF3333', 450);
    const ctx = context();
    alien.update(1000, ctx);
    alien.update(300, ctx);
    expect(alien.portalTimer).toBe(700);
  });

  it('WAITING_SPAWN の間は portalTimer は減らない', () => {
    const alien = new Alien(sequenceRng(0), 3000, '#FF3333', 450);
    alien.update(1500, context());
    expect(alien.portalTimer).toBe(1000);
  });
});

describe('isPortalShown：ポータルを表示するか（仕様 12.3・16.13）', () => {
  it('エイリアンがいなければ出さない', () => {
    expect(isPortalShown([], false)).toBe(false);
  });

  it('出現まで 1000ms 以下の WAITING_SPAWN がいれば出す（出現前の予告）', () => {
    const alien = new Alien(sequenceRng(0), 2000, '#FF3333', 450);
    const ctx = context();
    alien.update(999, ctx);
    expect(isPortalShown([alien], false)).toBe(false);
    alien.update(1, ctx);
    expect(isPortalShown([alien], false)).toBe(true);
  });

  it('出現後 1000ms の間は出し、その後は出さない（出現前 1000 ＋ 出現後 1000、仕様 2章）', () => {
    const alien = new Alien(sequenceRng(0), 1000, '#FF3333', 450);
    const ctx = context();
    alien.update(1000, ctx);
    expect(isPortalShown([alien], false)).toBe(true);
    alien.update(999, ctx);
    expect(isPortalShown([alien], false)).toBe(true);
    alien.update(1, ctx);
    expect(isPortalShown([alien], false)).toBe(false);
  });

  it('捕獲中のエイリアンは portalTimer が残っていても出さない（条件は WALKING のみ、仕様 12.3）', () => {
    const { alien } = trappedAlien();
    alien.portalTimer = 500;
    expect(isPortalShown([alien], false)).toBe(false);
  });

  it('ひとりでも条件を満たせば出す', () => {
    const far = new Alien(sequenceRng(0), 5000, '#FF3333', 450);
    const soon = new Alien(sequenceRng(0), 800, '#3388FF', 450);
    expect(isPortalShown([far, soon], false)).toBe(true);
  });

  it('階段が出ている間は、条件を満たしていても出さない（出現直後の表示も打ち切る、仕様 16.13・15.3）', () => {
    const waiting = new Alien(sequenceRng(0), 500, '#FF3333', 450);
    const justSpawned = new Alien(sequenceRng(0), 1000, '#3388FF', 450);
    justSpawned.update(1000, context());
    expect(isPortalShown([waiting, justSpawned], false)).toBe(true);
    expect(isPortalShown([waiting, justSpawned], true)).toBe(false);
  });
});
