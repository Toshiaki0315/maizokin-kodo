// 固定タイムステップの計算（仕様 14.3）。
// 原作は requestAnimationFrame の dt をそのまま使うため、ウィンドウが非アクティブだった後などに巨大な dt が入る（13.1 #2）。
// デスクトップ版は 1/60 秒単位でロジックを進め、1フレームで進めるステップ数に上限を設ける。
import { FIXED_STEP_MS, MAX_STEPS_PER_FRAME } from './config';

// 浮動小数の足し算の誤差で、ちょうど1ステップ分の時間が「わずかに足りない」と判定されないための許容幅
const EPSILON_MS = 1e-6;

export class FixedStepLoop {
  /** まだステップに変換していない経過時間 */
  private accumulated = 0;

  constructor(
    private readonly stepMs: number = FIXED_STEP_MS,
    private readonly maxSteps: number = MAX_STEPS_PER_FRAME,
  ) {}

  /** フレームの経過時間を受け取り、このフレームで進めるステップ数を返す */
  advance(elapsedMs: number): number {
    // 負の値や NaN（時計の巻き戻りなど）は経過なしとして扱う
    if (elapsedMs > 0) this.accumulated += elapsedMs;

    const steps = Math.floor((this.accumulated + EPSILON_MS) / this.stepMs);
    if (steps > this.maxSteps) {
      // 上限を超えた経過時間は切り捨てる（14.3）。捕獲中のエイリアンが一瞬で脱出するのを防ぐ
      this.accumulated = 0;
      return this.maxSteps;
    }
    this.accumulated = Math.max(0, this.accumulated - steps * this.stepMs);
    return steps;
  }
}
