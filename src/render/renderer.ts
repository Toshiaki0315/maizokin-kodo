// 描画のまとめ役（仕様 12章・16.4・16.5・16.15・16.16）。Game の状態を読むだけで、書き換えない。
// オブジェクトは作って使い回し、毎フレームは位置・表示・形の更新だけにする（14.3）
import { Container, Graphics, GraphicsContext, Rectangle } from 'pixi.js';
import { CRTFilter, GlowFilter, ShockwaveFilter } from 'pixi-filters';
import { isPortalShown } from '../core/alien';
import {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  DISPLAY_SCALE,
  MISS_BLINK_INTERVAL_MS,
  MISS_FLASH_ALPHA,
  MISS_FLASH_MS,
  PORTAL_POS,
  STATUS_BAR_HEIGHT,
  TILE_SIZE,
  WALK_ANIM_INTERVAL_MS,
} from '../core/config';
import type { Game, GameEvent, Gold } from '../core/game';
import type { Grid } from '../core/maze';
import { Particles, Shake } from './effects';
import {
  GOLD_ROTATION,
  drawHole,
  drawPortal,
  drawWalls,
  goldContext,
  pixelArtContext,
  stairsContext,
} from './shapes';
import { ALIEN_ART, MINER_ART, MINER_PALETTE, alienPalette, type AlienPose, type MinerPose } from './sprites';
import { Overlay, StatusBar } from './text';

export interface RendererOptions {
  /** 文字をくっきり出すための解像度（devicePixelRatio × 表示倍率） */
  textResolution: number;
  /** macOS の「視差効果を減らす」。オンなら画面の揺れとポータルの波紋を出さない（16.15） */
  reducedMotion: boolean;
  crtEnabled: boolean;
}

const HALF = TILE_SIZE / 2;
/** 坑道の怪の歩行の絵の切り替え（尻尾の揺れ、16.16） */
const ALIEN_ANIM_INTERVAL_MS = 200;
/** ポータルの波紋の間隔・最大半径・振幅（論理px、16.15） */
const WAVE_INTERVAL_MS = 800;
const WAVE_RADIUS = 60;
const WAVE_AMPLITUDE = 6;
const WAVE_LENGTH = 30;

export class GameRenderer {
  /** stage に置く。1.5倍で表示する（16.4） */
  readonly view = new Container();

  // 盤面レイヤー（波紋と揺れの対象）。描画順は 12.1 に、捕獲中の穴をエイリアンの上に重ねたもの
  private readonly board = new Container();
  private readonly portal = new Graphics();
  private readonly walls = new Graphics();
  private readonly stairs = new Graphics(stairsContext());
  private readonly holes = new Graphics();
  private readonly goldLayer = new Container();
  private readonly miner = new Graphics();
  private readonly alienLayer = new Container();
  /** 捕獲中のエイリアンがいるマスの穴。深さが見えるよう、エイリアンの上に重ねる */
  private readonly trappedHoles = new Graphics();

  private readonly particles = new Particles(new Graphics());
  private readonly shake = new Shake();
  private readonly statusBar: StatusBar;
  private readonly flash = new Graphics().rect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT).fill(0xff0000);
  private readonly overlay: Overlay;

  // グローは光る物のレイヤーごとにかける（16.15）
  private readonly portalGlow = new GlowFilter({ color: 0xff33ff, outerStrength: 2, innerStrength: 0 });
  private readonly stairsGlow = new GlowFilter({ color: 0xffffaa, outerStrength: 1.5, innerStrength: 0 });
  private readonly goldGlow = new GlowFilter({ color: 0xffcc00, outerStrength: 2, innerStrength: 0 });
  private readonly shockwave = new ShockwaveFilter({
    center: { x: 0, y: 0 },
    radius: WAVE_RADIUS * DISPLAY_SCALE,
    amplitude: WAVE_AMPLITUDE * DISPLAY_SCALE,
    wavelength: WAVE_LENGTH * DISPLAY_SCALE,
    // 800ms で最大半径に届く速さ
    speed: ((WAVE_RADIUS * DISPLAY_SCALE) / WAVE_INTERVAL_MS) * 1000,
    brightness: 1,
  });
  private readonly crt = new CRTFilter({
    lineContrast: 0.15,
    curvature: 0.5,
    // 四隅の減光。暗くなり始める位置は 0.3、暗さは最大 30% にとどめ、四隅の文字が読めるようにする
    vignetting: 0.3,
    vignettingAlpha: 0.3,
    noise: 0.05,
  });

  private readonly goldContext = goldContext();
  private readonly minerContexts: Record<MinerPose, GraphicsContext>;
  private readonly alienContexts = new Map<string, GraphicsContext>();

  private wallSource: Grid | null = null;
  private goldSource: Gold[] | null = null;
  private goldViews: Graphics[] = [];
  private alienViews: Graphics[] = [];

  /** パーティクル・揺れ・波紋の時間。PAUSED と QUIT_CONFIRM の間は止める（16.15） */
  private effectTimeMs = 0;
  private waveStartMs: number | null = null;
  private reducedMotion: boolean;

  constructor(options: RendererOptions) {
    this.reducedMotion = options.reducedMotion;
    this.minerContexts = Object.fromEntries(
      Object.entries(MINER_ART).map(([pose, art]) => [pose, pixelArtContext(art, MINER_PALETTE)]),
    ) as Record<MinerPose, GraphicsContext>;

    this.statusBar = new StatusBar(options.textResolution);
    this.overlay = new Overlay(options.textResolution);

    this.portal.position.set(PORTAL_POS.x * TILE_SIZE + HALF, PORTAL_POS.y * TILE_SIZE + HALF);
    this.portal.filters = [this.portalGlow];
    this.stairs.position.set(PORTAL_POS.x * TILE_SIZE + HALF, PORTAL_POS.y * TILE_SIZE + HALF);
    this.stairs.filters = [this.stairsGlow];
    this.goldLayer.filters = [this.goldGlow];

    this.board.y = STATUS_BAR_HEIGHT;
    this.board.addChild(
      this.portal,
      this.walls,
      this.stairs,
      this.holes,
      this.goldLayer,
      this.miner,
      this.alienLayer,
      this.trappedHoles,
    );
    // 波紋のフィルターの範囲を盤面（自身の座標で 600×600）に固定し、中心をこの範囲の左上から測れるようにする
    this.board.filterArea = new Rectangle(0, 0, BOARD_WIDTH, BOARD_HEIGHT);

    // 背景（通路の床色）→ 盤面 → パーティクル → ステータス帯 → 赤フラッシュ → オーバーレイ（12.1・16.15）
    const background = new Graphics().rect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT).fill(0x000022);
    this.view.addChild(
      background,
      this.board,
      this.particles.view,
      this.statusBar.view,
      this.flash,
      this.overlay.view,
    );
    this.view.scale.set(DISPLAY_SCALE);
    this.setCrtEnabled(options.crtEnabled);
  }

  /** CRT のオン・オフ。ステータス帯とオーバーレイを含む画面全体の最後にかける（16.15） */
  setCrtEnabled(enabled: boolean): void {
    this.view.filters = enabled ? [this.crt] : [];
  }

  /** 「視差効果を減らす」の設定が変わったとき（16.15） */
  setReducedMotion(reduced: boolean): void {
    this.reducedMotion = reduced;
  }

  /** ゲームの出来事をエフェクトにする（14.5・16.15） */
  handleEvent(event: GameEvent): void {
    this.particles.emit(event);
    if (event.type === 'miss' && !this.reducedMotion) this.shake.start();
  }

  /**
   * 1フレーム分描く。nowMs は描画用の時間（Ticker の実時間の累計、一時停止中も進む、14.5）、
   * frameMs はこのフレームの経過時間
   */
  render(game: Game, nowMs: number, frameMs: number): void {
    const effectsRunning = game.state !== 'PAUSED' && game.state !== 'QUIT_CONFIRM';
    const effectDt = effectsRunning ? frameMs : 0;
    this.effectTimeMs += effectDt;

    if (game.grid !== this.wallSource) {
      // 壁はレベル開始時に1回だけ描く（14.3）
      drawWalls(this.walls, game.grid);
      this.wallSource = game.grid;
    }
    this.renderPortal(game, nowMs);
    this.stairs.visible = game.stairs !== null;
    this.renderHoles(game);
    this.renderGold(game);
    this.renderMiner(game, nowMs);
    this.renderAliens(game, nowMs);

    this.particles.update(effectDt);
    const offset = this.reducedMotion ? { x: 0, y: 0 } : this.shake.update(effectDt);
    this.board.position.set(offset.x, STATUS_BAR_HEIGHT + offset.y);

    this.statusBar.update(game);
    this.renderFlash(game);
    this.overlay.update(game);

    this.crt.time = nowMs / 1000;
    this.crt.seed = Math.random();
  }

  /** ポータル（12.3・16.13）と、その波紋（16.15） */
  private renderPortal(game: Game, nowMs: number): void {
    const shown = isPortalShown(game.aliens, game.stairs !== null);
    this.portal.visible = shown;
    if (shown) {
      drawPortal(this.portal, nowMs);
      // グローの強さは sin(時間/150) で 2〜4 を脈動させる
      this.portalGlow.outerStrength = 3 + Math.sin(nowMs / 150);
    }

    if (!shown || this.reducedMotion) {
      this.board.filters = [];
      this.waveStartMs = null;
      return;
    }
    if (this.waveStartMs === null || this.effectTimeMs - this.waveStartMs >= WAVE_INTERVAL_MS) {
      this.waveStartMs = this.effectTimeMs;
    }
    this.shockwave.time = (this.effectTimeMs - this.waveStartMs) / 1000;
    // 中心は波紋の範囲（盤面）の左上から測った画面上の位置。盤面ごと揺れるので揺れの分は足さない
    this.shockwave.center = {
      x: (PORTAL_POS.x * TILE_SIZE + HALF) * DISPLAY_SCALE,
      y: (PORTAL_POS.y * TILE_SIZE + HALF) * DISPLAY_SCALE,
    };
    this.board.filters = [this.shockwave];
  }

  /**
   * 穴（12.5）。捕獲中のエイリアンがいるマスも、埋めるたびに小さくなるのが見えるように円を描く。
   * 深さ1の円はエイリアンの絵に隠れるため、そのマスの円はエイリアンの上の層に描く
   */
  private renderHoles(game: Game): void {
    const trapped = new Set(game.aliens.filter((a) => a.state === 'TRAPPED').map((a) => `${a.x},${a.y}`));
    this.holes.clear();
    this.trappedHoles.clear();
    for (const hole of game.holes.entries()) {
      const layer = trapped.has(`${hole.x},${hole.y}`) ? this.trappedHoles : this.holes;
      drawHole(layer, hole.x, hole.y, hole.stage);
    }
  }

  /** 金塊（12.6）。レベルが変わって配列が入れ替わったら作り直す */
  private renderGold(game: Game): void {
    if (game.gold !== this.goldSource) {
      this.goldLayer.removeChildren().forEach((child) => child.destroy());
      this.goldViews = game.gold.map((g) => {
        const view = new Graphics(this.goldContext);
        view.position.set(g.x * TILE_SIZE + HALF, g.y * TILE_SIZE + HALF);
        view.rotation = GOLD_ROTATION;
        this.goldLayer.addChild(view);
        return view;
      });
      this.goldSource = game.gold;
    }
    game.gold.forEach((g, i) => {
      this.goldViews[i].visible = !g.collected;
    });
  }

  /** 坑夫（16.16）。dir だけで絵を決め、左向きは右向きの絵を反転する */
  private renderMiner(game: Game, nowMs: number): void {
    const { player } = game;
    const walking = player.isMoving && Math.floor(nowMs / WALK_ANIM_INTERVAL_MS) % 2 === 1;
    let pose: MinerPose;
    let flip = false;
    if (game.missInProgress) {
      pose = 'miss';
    } else if (player.dir === 'DOWN') {
      pose = walking ? 'down_walk' : 'down_stand';
    } else if (player.dir === 'UP') {
      pose = walking ? 'up_walk' : 'up_stand';
    } else {
      // 掘る・埋めるの絵は左右向きのときだけ。上下向きは立ちの絵のまま
      pose = game.isActing ? 'side_dig' : walking ? 'side_walk' : 'side_stand';
      flip = player.dir === 'LEFT';
    }
    this.miner.context = this.minerContexts[pose];
    this.miner.scale.x = flip ? -1 : 1;
    this.miner.position.set(player.x * TILE_SIZE + (flip ? TILE_SIZE : 0), player.y * TILE_SIZE);
    // MISS 中は 100ms ごとに点滅する。最初の 100ms は表示（16.5）
    this.miner.visible = !game.missInProgress || Math.floor(game.missElapsedMs / MISS_BLINK_INTERVAL_MS) % 2 === 0;
  }

  /** 坑道の怪（16.16）。WALKING は2枚を交互、TRAPPED は穴に沈んだ絵、出現待ち・DEAD は描かない */
  private renderAliens(game: Game, nowMs: number): void {
    while (this.alienViews.length < game.aliens.length) {
      const view = new Graphics();
      this.alienLayer.addChild(view);
      this.alienViews.push(view);
    }
    this.alienViews.forEach((view, i) => {
      const alien = game.aliens[i];
      if (!alien || (alien.state !== 'WALKING' && alien.state !== 'TRAPPED')) {
        view.visible = false;
        return;
      }
      const pose: AlienPose =
        alien.state === 'TRAPPED'
          ? 'alien_trap'
          : Math.floor(nowMs / ALIEN_ANIM_INTERVAL_MS) % 2 === 0
            ? 'alien_a'
            : 'alien_b';
      view.context = this.alienContext(alien.color, pose);
      view.position.set(alien.x * TILE_SIZE, alien.y * TILE_SIZE);
      view.visible = true;
    });
  }

  private alienContext(color: string, pose: AlienPose): GraphicsContext {
    const key = `${color}:${pose}`;
    let ctx = this.alienContexts.get(key);
    if (!ctx) {
      ctx = pixelArtContext(ALIEN_ART[pose], alienPalette(Number.parseInt(color.slice(1), 16)));
      this.alienContexts.set(key, ctx);
    }
    return ctx;
  }

  /** MISS 開始時の赤フラッシュ。不透明度0.35 から 300ms かけて 0 にする（16.5） */
  private renderFlash(game: Game): void {
    const elapsed = game.missElapsedMs;
    this.flash.visible = game.missInProgress && elapsed < MISS_FLASH_MS;
    if (this.flash.visible) this.flash.alpha = MISS_FLASH_ALPHA * (1 - elapsed / MISS_FLASH_MS);
  }
}
