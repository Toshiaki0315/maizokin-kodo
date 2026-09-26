// 穴の深さの管理（仕様 7章）。
// 通路かどうかの判定やクールダウンはプレイヤー操作の側（game.ts）で扱い、ここは深さだけを持つ。
import { HOLE_MAX_STAGE } from './config';

export type HoleStage = 1 | 2 | 3;

export interface HoleEntry {
  readonly x: number;
  readonly y: number;
  readonly stage: HoleStage;
}

export class Holes {
  // 原作と同じく "x,y" をキーにする。値に座標も持たせ、entries() でキーを分解しなくて済むようにする。
  // stage 0 の穴は持たない（0 になった時点で削除、7章）
  private readonly holes = new Map<string, HoleEntry>();

  /** 穴の深さ。穴がなければ 0 */
  stageAt(x: number, y: number): 0 | HoleStage {
    return this.holes.get(key(x, y))?.stage ?? 0;
  }

  has(x: number, y: number): boolean {
    return this.holes.has(key(x, y));
  }

  /** 1段深く掘り、掘った後の深さを返す。穴がなければ stage 1 を作り、stage 3 ならそのまま（5.3） */
  dig(x: number, y: number): HoleStage {
    const stage = Math.min(this.stageAt(x, y) + 1, HOLE_MAX_STAGE) as HoleStage;
    this.holes.set(key(x, y), { x, y, stage });
    return stage;
  }

  /**
   * 1段埋め、0 になったら穴を消す。穴があったかどうかを返す。
   * 穴がなければ何もしない。原作ではこのときクールダウンを付けないため、呼び出し側が判断できるようにする（5.3）
   */
  fill(x: number, y: number): boolean {
    const stage = this.stageAt(x, y);
    if (stage === 0) return false;
    if (stage === 1) {
      this.holes.delete(key(x, y));
    } else {
      this.holes.set(key(x, y), { x, y, stage: (stage - 1) as HoleStage });
    }
    return true;
  }

  /** 深さに関係なく穴を消す。捕獲中のエイリアンの脱出・撃破で使う（7章） */
  remove(x: number, y: number): void {
    this.holes.delete(key(x, y));
  }

  /** すべての穴を消す。レベル開始（initLevel）で使う（7章） */
  clear(): void {
    this.holes.clear();
  }

  /** 描画用に、すべての穴の位置と深さを返す（12.5） */
  entries(): HoleEntry[] {
    return [...this.holes.values()];
  }
}

function key(x: number, y: number): string {
  return `${x},${y}`;
}
