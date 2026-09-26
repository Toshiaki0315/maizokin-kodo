// キーの押下状態・押下エッジ・入力リセット（仕様 5.1、13.1 #10、14.5、16.7）。
// DOM には触れず、main.ts が KeyboardEvent.code を toGameKey() で変換して渡す。

import { DIRS, type Dir } from './config';

export type { Dir };

/** 固定ステップごとに game.step() へ渡す入力（14.5） */
export interface InputSnapshot {
  /** 押下中の方向（優先順位適用済み） */
  dir: Dir | null;
  /** Z 押下中 */
  dig: boolean;
  /** X 押下中（Z と同時押しなら false） */
  fill: boolean;
  /** このステップで Enter が押された（押下エッジ） */
  enter: boolean;
  /** 同上（P） */
  pause: boolean;
  /** 同上（ESC） */
  escape: boolean;
}

/** ゲームで使うキー */
export type GameKey = Dir | 'DIG' | 'FILL' | 'ENTER' | 'PAUSE' | 'ESCAPE' | 'CRT';

// 文字ではなく物理キー（KeyboardEvent.code）で判定する。
// Shift や Caps Lock に左右されず「大文字小文字不問」（5.1）を満たし、日本語入力がオンでも反応するため
const KEY_BY_CODE: Readonly<Record<string, GameKey>> = {
  ArrowUp: 'UP',
  ArrowDown: 'DOWN',
  ArrowLeft: 'LEFT',
  ArrowRight: 'RIGHT',
  KeyZ: 'DIG',
  KeyX: 'FILL',
  Enter: 'ENTER',
  NumpadEnter: 'ENTER',
  KeyP: 'PAUSE',
  Escape: 'ESCAPE',
  KeyF: 'CRT',
};

/** KeyboardEvent.code をゲームのキーに変換する。割り当てのないキーは null */
export function toGameKey(code: string): GameKey | null {
  return KEY_BY_CODE[code] ?? null;
}

/** 同時押し時の優先順位 上 > 下 > 左 > 右（5.1）。DIRS と同じ順 */
const DIR_PRIORITY = DIRS;

/** 押下エッジで扱うキー。スナップショットに載るもの（14.5） */
type EdgeKey = 'ENTER' | 'PAUSE' | 'ESCAPE';

function isEdgeKey(key: GameKey): key is EdgeKey {
  return key === 'ENTER' || key === 'PAUSE' || key === 'ESCAPE';
}

export class Input {
  /** 物理的に押されているキー */
  private readonly down = new Set<GameKey>();
  /** 入力リセット時に押されていて、離すまで無効なキー（16.7） */
  private readonly blocked = new Set<GameKey>();
  /** まだスナップショットに載せていない押下エッジ（14.5：ステップが0回なら持ち越す） */
  private readonly pendingEdges = new Set<EdgeKey>();
  private pendingCrtToggle = false;

  keyDown(key: GameKey): void {
    // 押したままの keydown（キーリピート）はエッジにしない（13.1 #10）
    if (this.down.has(key)) return;
    this.down.add(key);
    if (isEdgeKey(key)) {
      this.pendingEdges.add(key);
    } else if (key === 'CRT') {
      this.pendingCrtToggle = true;
    }
  }

  keyUp(key: GameKey): void {
    this.down.delete(key);
    this.blocked.delete(key);
  }

  /** 固定ステップ1回分の入力を作る。押下エッジはここで消費する（14.5） */
  snapshot(): InputSnapshot {
    const dig = this.isActive('DIG');
    const snapshot: InputSnapshot = {
      dir: DIR_PRIORITY.find((dir) => this.isActive(dir)) ?? null,
      dig,
      // Z と X の同時押しは Z が優先（5.1）
      fill: !dig && this.isActive('FILL'),
      enter: this.pendingEdges.has('ENTER'),
      pause: this.pendingEdges.has('PAUSE'),
      escape: this.pendingEdges.has('ESCAPE'),
    };
    this.pendingEdges.clear();
    return snapshot;
  }

  /** F キーの押下エッジを受け取る。main.ts がフレームごとに呼ぶ（14.5） */
  takeCrtToggle(): boolean {
    const toggled = this.pendingCrtToggle;
    this.pendingCrtToggle = false;
    return toggled;
  }

  /**
   * 入力リセット（16.7）。押しっぱなしのキーは離して押し直すまで無効にし、未処理の Enter・P・ESC を捨てる。
   * F（CRT の切り替え）はリセット対象に含まれず、どの状態でも切り替えられるため残す（16.15）
   */
  reset(): void {
    for (const key of this.down) this.blocked.add(key);
    this.pendingEdges.clear();
  }

  /**
   * すべてのキーを離した扱いにする。ウィンドウのフォーカスが外れたときに main.ts が呼ぶ。
   * フォーカスがない間に離したキーは keyup が届かず、押しっぱなしのまま残ってしまうため
   */
  releaseAll(): void {
    this.down.clear();
    this.blocked.clear();
  }

  private isActive(key: GameKey): boolean {
    return this.down.has(key) && !this.blocked.has(key);
  }
}
