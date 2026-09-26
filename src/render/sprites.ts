// キャラクターのドット絵（仕様 16.16）。20×20 ドット、1ドット＝論理2px でマスの左上に合わせて描く。
// 絵のデータは仕様書 16.16 のコードブロックから機械的に写したもの。原作の 12.7・12.8 の絵は使わない。
// '.' は透明。記号と色の対応は下のパレット

/** ドット絵1枚。20行 × 20文字 */
export type PixelArt = readonly string[];

export const SPRITE_DOTS = 20;
/** 1ドットの大きさ（論理px） */
export const DOT_SIZE = 2;

/** 坑夫のパレット（16.16） */
export const MINER_PALETTE: Readonly<Record<string, number>> = {
  K: 0x1b1320, // 輪郭・目
  Y: 0xffc61a, // ヘルメット
  y: 0xd98e04, // ヘルメットの影
  L: 0xfff7c2, // ヘッドランプ
  F: 0xffd2a6, // 肌
  f: 0xe8a677, // 肌の影
  P: 0xf4c7c3, // 頬
  R: 0xd0452f, // シャツ
  r: 0x8e2a1c, // 口
  B: 0x2f6fdb, // オーバーオール
  b: 0x1d4a9c, // オーバーオールの影
  h: 0x5e3a20, // 髪
  H: 0x8a5a36, // ツルハシの柄
  W: 0xdde3ea, // ツルハシの刃
  w: 0x8c98a8, // ツルハシの刃の影
  O: 0x5a3a26, // 靴
};

/** 坑道の怪の固定色（16.16）。A・a・Q はエイリアンの色から alienPalette() で作る */
const ALIEN_FIXED_COLORS: Readonly<Record<string, number>> = {
  K: 0x1b1320, // 輪郭・目・手
  W: 0xf4f6fa, // 目の光・穴の縁
  N: 0x05050f, // 穴の中
};

/** color に target を ratio の割合で混ぜる */
export function mixColor(color: number, target: number, ratio: number): number {
  const channel = (shift: number): number => {
    const c = (color >> shift) & 0xff;
    const t = (target >> shift) & 0xff;
    return Math.round(c + (t - c) * ratio) << shift;
  };
  return channel(16) | channel(8) | channel(0);
}

/** 坑道の怪のパレット。体の影は黒を38%、光沢は白を55%混ぜる（16.16） */
export function alienPalette(color: number): Record<string, number> {
  return {
    A: color,
    a: mixColor(color, 0x000000, 0.38),
    Q: mixColor(color, 0xffffff, 0.55),
    ...ALIEN_FIXED_COLORS,
  };
}

export type MinerPose =
  | 'down_stand'
  | 'down_walk'
  | 'up_stand'
  | 'up_walk'
  | 'side_stand'
  | 'side_walk'
  | 'side_dig'
  | 'miss';

export type AlienPose = 'alien_a' | 'alien_b' | 'alien_trap';

/** 坑夫の絵。side_* は右向き（左向きは左右反転して使う） */
export const MINER_ART: Readonly<Record<MinerPose, PixelArt>> = {
  down_stand: [
    '....................',
    '.......KKKKKK.......',
    '.....KKYYYYYYKK.....',
    '....KYYYYKLLKYYK....',
    '....KYYYYKLLKYYK....',
    '...KKyyyyKKKKyyKK...',
    '...KKKKKKKKKKKKKK...',
    '....KFFFFFFFFFFK....',
    '....KFFKFFFFKFFK....',
    '....KFFKFFFFKFFK....',
    '....KfFPFFFFPFfK....',
    '....KKfFFrrFFfKK....',
    '...KRRKKffffKKRRK...',
    '..KFKRBBKKKKBBRKFK..',
    '..KFKbBBBBBBBBbKFK..',
    '...KKbBBBBBBBBbKK...',
    '....KbBBBKKBBBbK....',
    '....KbBBK..KBBbK....',
    '....KOOOK..KOOOK....',
    '....KKKKK..KKKKK....',
  ],
  down_walk: [
    '....................',
    '.......KKKKKK.......',
    '.....KKYYYYYYKK.....',
    '....KYYYYKLLKYYK....',
    '....KYYYYKLLKYYK....',
    '...KKyyyyKKKKyyKK...',
    '...KKKKKKKKKKKKKK...',
    '....KFFFFFFFFFFK....',
    '....KFFKFFFFKFFK....',
    '....KFFKFFFFKFFK....',
    '....KfFPFFFFPFfK....',
    '....KKfFFrrFFfKK....',
    '...KRRKKffffKKRRK...',
    '..KFKbBBKKKKBBRKK...',
    '..KFKbBBBBBBBBbKFK..',
    '...KKbBBBBBBBBbKFK..',
    '....KbBBBKKBBBbKK...',
    '....KbBBK..KOOOK....',
    '....KOOOK..KKKKK....',
    '....KKKKK...........',
  ],
  up_stand: [
    '....................',
    '.......KKKKKK.......',
    '.....KKYYYYYYKK.....',
    '....KYYYYYYYYYYK....',
    '....KYYYYYYYYYYK....',
    '...KKyyyyyyyyyyKK...',
    '...KKKKKKKKKKKKKK...',
    '....KhhhhhhhhhhK....',
    '....KhhhhhhhhhhK....',
    '....KhhhhhhhhhhK....',
    '....KfhhhhhhhhfK....',
    '....KKffffffffKK....',
    '...KRRKKRRRRKKRRK...',
    '..KFKRBKRRRRKBRKFK..',
    '..KFKbBBKKKKBBbKFK..',
    '...KKbBBBBBBBBbKK...',
    '....KbBBBKKBBBbK....',
    '....KbBBK..KBBbK....',
    '....KOOOK..KOOOK....',
    '....KKKKK..KKKKK....',
  ],
  up_walk: [
    '....................',
    '.......KKKKKK.......',
    '.....KKYYYYYYKK.....',
    '....KYYYYYYYYYYK....',
    '....KYYYYYYYYYYK....',
    '...KKyyyyyyyyyyKK...',
    '...KKKKKKKKKKKKKK...',
    '....KhhhhhhhhhhK....',
    '....KhhhhhhhhhhK....',
    '....KhhhhhhhhhhK....',
    '....KfhhhhhhhhfK....',
    '....KKffffffffKK....',
    '...KRRKKRRRRKKRRK...',
    '..KFKbBKRRRRKBRKK...',
    '..KFKbBBKKKKBBbKFK..',
    '...KKbBBBBBBBBbKFK..',
    '....KbBBBKKBBBbKK...',
    '....KbBBK..KOOOK....',
    '....KOOOK..KKKKK....',
    '....KKKKK...........',
  ],
  side_stand: [
    '....................',
    '......KKKKKK........',
    '....KKYYYYYYKK......',
    '...KYYYYYYYYKLK.....',
    '...KYYYYYYYYKLLK....',
    '..KKyyyyyyyyKKKK....',
    '..KKKKKKKKKKKKKKKK..',
    '....KhhFFFFFFFK.....',
    '....KhFFFFFKFFK.....',
    '....KhFFFFFKFFFK....',
    '....KfFFFPFFFFFK....',
    '.....KffFFFFrFK.....',
    '....KRRKffffKK......',
    '...KRRRBBBBBK.......',
    '...KRRBBBBBKFK......',
    '...KbBBBBBBBKK......',
    '....KbBBBBBBK.......',
    '....KbBBKbBBK.......',
    '....KOOOKOOOOK......',
    '....KKKKKKKKKK......',
  ],
  side_walk: [
    '....................',
    '......KKKKKK........',
    '....KKYYYYYYKK......',
    '...KYYYYYYYYKLK.....',
    '...KYYYYYYYYKLLK....',
    '..KKyyyyyyyyKKKK....',
    '..KKKKKKKKKKKKKKKK..',
    '....KhhFFFFFFFK.....',
    '....KhFFFFFKFFK.....',
    '....KhFFFFFKFFFK....',
    '....KfFFFPFFFFFK....',
    '.....KffFFFFrFK.....',
    '....KRRKffffKK......',
    '...KRRRBBBBBK.......',
    '...KRBBBBBBKFK......',
    '...KbBBBBBBBKK......',
    '....KbBBBBBBK.......',
    '...KbBBK.KbBBK......',
    '..KOOOK..KOOOOK.....',
    '..KKKKK..KKKKKK.....',
  ],
  side_dig: [
    '....................',
    '......KKKKKK........',
    '....KKYYYYYYKK......',
    '...KYYYYYYYYKLK.....',
    '...KYYYYYYYYKLLK....',
    '..KKyyyyyyyyKKKK....',
    '..KKKKKKKKKKKKKKKK..',
    '....KhhFFFFFFFK.....',
    '....KhFFFFFKFFK.....',
    '....KhFFFFFKFFFK....',
    '....KfFFFPFFFFFK....',
    '.....KffFFFFrFK.....',
    '....KRRKffffKKKK....',
    '...KRRRBBBBKFFHK....',
    '...KRRBBBBBBKKHK....',
    '...KbBBBBBBBK.KHK.K.',
    '....KbBBBBBBK.KHKWK.',
    '....KbBBKbBBKKWWWwK.',
    '....KOOOKOOOOKKKKK..',
    '....KKKKKKKKKK......',
  ],
  miss: [
    '....................',
    '........KKKKKK......',
    '......KKYYYYYYKK....',
    '.....KYYYYKLLKYYK...',
    '....KYYYYYKLLKYYK...',
    '...KKyyyyyyKKKKyKK..',
    '...KKKKKKKKKKKKKK...',
    '....KFFFFFFFFFFK....',
    '....KFKFKFFKFKFK....',
    '....KFFKFFFFKFFK....',
    '....KFKFKFFKFKFK....',
    '....KKfFFrrFFfKK....',
    '...KRRKKfrrfKKRRK...',
    '..KFKRBBKKKKBBRKFK..',
    '..KFKbBBBBBBBBbKFK..',
    '...KKbBBBBBBBBbKK...',
    '....KbBBBKKBBBbK....',
    '....KbBBK..KBBbK....',
    '....KOOOK..KOOOK....',
    '....KKKKK..KKKKK....',
  ],
};

/** 坑道の怪の絵。反転はしない */
export const ALIEN_ART: Readonly<Record<AlienPose, PixelArt>> = {
  alien_a: [
    '....................',
    '....................',
    '......KKKKKK........',
    '....KKAAAAAAKK......',
    '...KAQQAAAAAAAK.....',
    '..KAQQAAAAAAAAAK....',
    '..KAQAAAAAAAAAAK....',
    '.KAAAKWAAAKWAAAAK...',
    '.KAAAKKAAAKKAAAAK...',
    '.KAAAKKAAAKKAAAAK...',
    '.KAAAAAAAAAAAAAAK...',
    '.KAKAKAAAKAKAAAAK...',
    '.KAAKAAAAAKAAAAAAK..',
    '.KaAAAAAAAAAAAAAAK..',
    '..KaAAAAAAAAAAAAAK..',
    '..KaaAAAAAAAAAAAAAK.',
    '...KaaaaAAAAAAAAAAK.',
    '....KKaaaaaaaAAAAAK.',
    '......KKKKKKaaaAAK..',
    '............KKKKK...',
  ],
  alien_b: [
    '....................',
    '....................',
    '......KKKKKK........',
    '....KKAAAAAAKK......',
    '...KAQQAAAAAAAK.....',
    '..KAQQAAAAAAAAAK....',
    '..KAQAAAAAAAAAAK....',
    '.KAAAKWAAAKWAAAAK...',
    '.KAAAKKAAAKKAAAAK...',
    '.KAAAKKAAAKKAAAAK...',
    '.KAAAAAAAAAAAAAAK...',
    '.KAKAKAAAKAKAAAAK...',
    '.KAAKAAAAAKAAAAAAK..',
    '.KaAAAAAAAAAAAAAAK..',
    '..KaAAAAAAAAAAAAAAK.',
    '..KaaAAAAAAAAAAAAAAK',
    '...KaaaaAAAAAAAAAAK.',
    '....KKaaaaaaaaAAAK..',
    '......KKKKKKKaaaK...',
    '.............KKK....',
  ],
  alien_trap: [
    '....................',
    '....................',
    '....................',
    '....................',
    '....................',
    '......KKKKKK........',
    '....KKAAAAAAKK......',
    '...KAQQAAAAAAAK.....',
    '..KAQQAAAAAAAAAK....',
    'K.KAAKWAAAKWAAAAK.K.',
    'KAKAAKKAAAKKAAAAKAK.',
    'KAKAAKKAAAKKAAAAKAK.',
    '.KKAAAAAAKKAAAAAKK..',
    '..KAAAAAAKKAAAAAK...',
    '.WWWWWWWWWWWWWWWWWW.',
    'WNNNNNNNNNNNNNNNNNNW',
    'WNNNNNNNNNNNNNNNNNNW',
    '.WWWWWWWWWWWWWWWWWW.',
    '....................',
    '....................',
  ],
};
