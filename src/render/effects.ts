// パーティクルと画面の揺れ（仕様 16.15）。描画だけの効果で、ロジックのタイミングには影響させない。
// 位置と速度は論理座標（600×640）で扱う。時間はエフェクト用の時間（PAUSED・QUIT_CONFIRM の間は止まる）
import { Graphics } from 'pixi.js';
import { PORTAL_POS, STATUS_BAR_HEIGHT, TILE_SIZE } from '../core/config';
import type { GameEvent } from '../core/game';

const MAX_PARTICLES = 300;
const PARTICLE_SIZE = 3;

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** 下向きの加速度（px/秒²） */
  gravity: number;
  ageMs: number;
  lifeMs: number;
  color: number;
  /** 縮小しながら消えるか（金塊） */
  shrink: boolean;
  /** 指定があれば、寿命の間に始点からこの点へまっすぐ集まる（階段） */
  target: { fromX: number; fromY: number; toX: number; toY: number } | null;
}

/** 範囲 [min, max) の乱数。描画だけの効果なので Math.random() を使う（ロジック層ではないため 15.5 の対象外） */
function between(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

/** マスの中心の論理座標（ステータス帯の分だけ下にずらす） */
function cellCenter(x: number, y: number): { x: number; y: number } {
  return { x: x * TILE_SIZE + TILE_SIZE / 2, y: y * TILE_SIZE + TILE_SIZE / 2 + STATUS_BAR_HEIGHT };
}

export class Particles {
  private readonly particles: Particle[] = [];

  constructor(readonly view: Graphics) {}

  /** ゲームの出来事に合わせて粒を出す（16.15 の表） */
  emit(event: GameEvent): void {
    switch (event.type) {
      case 'goldCollected': {
        const c = cellCenter(event.x, event.y);
        for (let i = 0; i < 16; i++) {
          this.radial(c.x, c.y, between(60, 120), between(400, 600), i % 2 === 0 ? 0xffdf00 : 0xffffff, true);
        }
        break;
      }
      case 'holeDug':
        this.dirt(event.x, event.y, 6);
        break;
      case 'holeFilled':
        this.dirt(event.x, event.y, 4);
        break;
      case 'alienKilled': {
        const c = cellCenter(event.x, event.y);
        const color = Number.parseInt(event.color.slice(1), 16);
        for (let i = 0; i < 20; i++) this.radial(c.x, c.y, between(80, 160), 600, color, false);
        break;
      }
      case 'stairsAppeared': {
        // (7,7) を中心に半径60px の円周から中心へ集まる
        const c = cellCenter(PORTAL_POS.x, PORTAL_POS.y);
        for (let i = 0; i < 24; i++) {
          const angle = (i / 24) * Math.PI * 2;
          const fromX = c.x + Math.cos(angle) * 60;
          const fromY = c.y + Math.sin(angle) * 60;
          this.add({
            x: fromX,
            y: fromY,
            vx: 0,
            vy: 0,
            gravity: 0,
            ageMs: 0,
            lifeMs: 800,
            color: i % 2 === 0 ? 0xffffff : 0xffdf00,
            shrink: false,
            target: { fromX, fromY, toX: c.x, toY: c.y },
          });
        }
        break;
      }
      default:
        break;
    }
  }

  /** 経過時間だけ進めて描き直す */
  update(dtMs: number): void {
    const dt = dtMs / 1000;
    for (const p of this.particles) {
      p.ageMs += dtMs;
      if (p.target) {
        const t = Math.min(p.ageMs / p.lifeMs, 1);
        p.x = p.target.fromX + (p.target.toX - p.target.fromX) * t;
        p.y = p.target.fromY + (p.target.toY - p.target.fromY) * t;
      } else {
        p.vy += p.gravity * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      }
    }
    for (let i = this.particles.length - 1; i >= 0; i--) {
      if (this.particles[i].ageMs >= this.particles[i].lifeMs) this.particles.splice(i, 1);
    }

    const g = this.view;
    g.clear();
    for (const p of this.particles) {
      const rest = 1 - p.ageMs / p.lifeMs;
      const size = p.shrink ? PARTICLE_SIZE * rest : PARTICLE_SIZE;
      g.rect(p.x - size / 2, p.y - size / 2, size, size).fill({ color: p.color, alpha: p.shrink ? 1 : rest });
    }
  }

  /** マス中心から放射状に広がる粒 */
  private radial(x: number, y: number, speed: number, lifeMs: number, color: number, shrink: boolean): void {
    const angle = Math.random() * Math.PI * 2;
    this.add({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      gravity: 0,
      ageMs: 0,
      lifeMs,
      color,
      shrink,
      target: null,
    });
  }

  /** 対象マスから上向きに飛んで落ちる土（掘る・埋める） */
  private dirt(cellX: number, cellY: number, count: number): void {
    const c = cellCenter(cellX, cellY);
    for (let i = 0; i < count; i++) {
      this.add({
        x: c.x + between(-TILE_SIZE / 4, TILE_SIZE / 4),
        y: c.y + between(-TILE_SIZE / 4, TILE_SIZE / 4),
        vx: 0,
        vy: -between(30, 60),
        gravity: 200,
        ageMs: 0,
        lifeMs: 300,
        color: i % 2 === 0 ? 0x8a5a36 : 0x663c21,
        shrink: false,
        target: null,
      });
    }
  }

  /** 最大300。超えたら古い粒から消す */
  private add(p: Particle): void {
    this.particles.push(p);
    if (this.particles.length > MAX_PARTICLES) this.particles.splice(0, this.particles.length - MAX_PARTICLES);
  }
}

const SHAKE_AMPLITUDE = 8;
const SHAKE_DURATION_MS = 400;

/** MISS の開始時の画面の揺れ。振幅8px から 400ms かけて 0 まで弱める（16.15） */
export class Shake {
  private elapsedMs = SHAKE_DURATION_MS;

  start(): void {
    this.elapsedMs = 0;
  }

  /** 経過時間だけ進め、このフレームのずれを返す */
  update(dtMs: number): { x: number; y: number } {
    this.elapsedMs = Math.min(this.elapsedMs + dtMs, SHAKE_DURATION_MS);
    const amplitude = SHAKE_AMPLITUDE * (1 - this.elapsedMs / SHAKE_DURATION_MS);
    if (amplitude <= 0) return { x: 0, y: 0 };
    return { x: between(-amplitude, amplitude), y: between(-amplitude, amplitude) };
  }
}
