// 起動・ループ・キーイベントの受け渡し（仕様 14.2・14.3・14.5）
import { Application } from 'pixi.js';
import { CANVAS_HEIGHT, CANVAS_WIDTH, DISPLAY_SCALE, FIXED_STEP_MS } from './core/config';
import { Game, parseHiScore, type GameEvent } from './core/game';
import { Input, toGameKey } from './core/input';
import { FixedStepLoop } from './core/loop';
import { createRng } from './core/rng';
import * as platform from './platform';
import { GameRenderer } from './render/renderer';

async function main(): Promise<void> {
  // 乱数のシードは起動時に1回だけ作る。開発ビルドでは不具合を再現できるように出力する（15.5）
  const seed = crypto.getRandomValues(new Uint32Array(1))[0];
  if (import.meta.env.DEV) console.info(`乱数のシード: ${seed}`);

  // ハイスコアは START 画面を出す前に読み込む（16.10）
  const [storedHiScore, storedCrt] = await Promise.all([platform.loadHiScore(), platform.loadCrtEnabled()]);
  const game = new Game(createRng(seed), parseHiScore(storedHiScore));
  const input = new Input();
  const loop = new FixedStepLoop();

  // 論理解像度 600×640 を 1.5倍の 900×960 で描く。Retina に備えて解像度は devicePixelRatio に合わせる（16.4）
  const resolution = window.devicePixelRatio || 1;
  const app = new Application();
  await app.init({
    width: CANVAS_WIDTH * DISPLAY_SCALE,
    height: CANVAS_HEIGHT * DISPLAY_SCALE,
    background: 0x000022,
    // ドット絵の輪郭をにじませない
    antialias: false,
    resolution,
    // 表示サイズは CSS で決める。OS がウィンドウを縮めたときも縦横比を保って縮小するため（16.4）
    autoDensity: false,
  });
  document.getElementById('app')?.appendChild(app.canvas);

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let crtEnabled = storedCrt;
  const renderer = new GameRenderer({
    textResolution: resolution * DISPLAY_SCALE,
    reducedMotion: reducedMotion.matches,
    crtEnabled,
  });
  reducedMotion.addEventListener('change', (e) => renderer.setReducedMotion(e.matches));
  app.stage.addChild(renderer.view);

  window.addEventListener('keydown', (e) => {
    const key = toGameKey(e.code);
    if (key === null) return;
    e.preventDefault();
    input.keyDown(key);
  });
  window.addEventListener('keyup', (e) => {
    const key = toGameKey(e.code);
    if (key === null) return;
    e.preventDefault();
    input.keyUp(key);
  });

  await platform.listenPlatformEvents({
    onFocusLost: () => {
      // フォーカスがない間に離したキーは keyup が届かないため、すべて離した扱いにする
      input.releaseAll();
      game.focusLost();
    },
    onCloseRequested: () => game.closeRequested(),
  });

  const pendingSaves: Array<Promise<void>> = [];
  const handleEvent = (event: GameEvent): void => {
    switch (event.type) {
      case 'inputReset':
        input.reset();
        break;
      case 'saveHiScore':
        pendingSaves.push(platform.saveHiScore(event.value));
        break;
      case 'quit':
        // 保存の完了を待ってからウィンドウを破棄する（14.5）
        void Promise.all(pendingSaves).then(() => platform.destroyWindow());
        break;
      default:
        renderer.handleEvent(event);
        break;
    }
  };

  // 描画用の時間は Ticker の実時間の累計。一時停止中も進める（14.5）
  let nowMs = 0;
  app.ticker.add((ticker) => {
    const frameMs = ticker.deltaMS;
    nowMs += frameMs;
    const steps = loop.advance(frameMs);
    for (let i = 0; i < steps; i++) {
      for (const event of game.step(FIXED_STEP_MS, input.snapshot())) handleEvent(event);
    }
    // F キー（CRT の切り替え）はゲームの状態に関係なく、フレームごとに受け取る（14.5・16.15）
    if (input.takeCrtToggle()) {
      crtEnabled = !crtEnabled;
      renderer.setCrtEnabled(crtEnabled);
      void platform.saveCrtEnabled(crtEnabled);
    }
    renderer.render(game, nowMs, frameMs);
  });
}

void main();
