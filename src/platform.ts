// Tauri との連携（仕様 14.2・14.5・16.3・16.10・16.15）。
// フォーカス変化・×ボタン・⌘Q を受け取り、ハイスコアと CRT の設定を store プラグインで保存し、終了時にウィンドウを破棄する。
// Tauri の外（ブラウザで vite を開いたとき）でも画面を確認できるよう、そのときは保存をせずに動く。
import { isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { load, type Store } from '@tauri-apps/plugin-store';

/** ⌘Q のメニュー項目が押されたときに Rust 側が送るイベント名（src-tauri/src/lib.rs） */
const MENU_QUIT_EVENT = 'menu-quit';

// 保存先はアプリのデータフォルダ（~/Library/Application Support/<識別子>/）の下（16.10・16.15）
const HISCORE_FILE = 'hiscore.json';
const HISCORE_KEY = 'hiScore';
const SETTINGS_FILE = 'settings.json';
const CRT_KEY = 'crtEnabled';

/** 開発ビルドだけで警告を出す（16.10：保存の失敗） */
function warnInDev(message: string, error: unknown): void {
  if (import.meta.env.DEV) console.warn(message, error);
}

async function openStore(file: string): Promise<Store | null> {
  if (!isTauri()) return null;
  try {
    return await load(file, { autoSave: false });
  } catch (error) {
    warnInDev(`${file} を開けませんでした`, error);
    return null;
  }
}

/** 保存されているハイスコアを読む。検証は Game 側の parseHiScore() で行うため、読めた値をそのまま返す */
export async function loadHiScore(): Promise<unknown> {
  const store = await openStore(HISCORE_FILE);
  try {
    return (await store?.get<unknown>(HISCORE_KEY)) ?? undefined;
  } catch (error) {
    warnInDev('ハイスコアを読み込めませんでした', error);
    return undefined;
  }
}

/** ハイスコアを保存する。失敗してもゲームは続ける（16.10） */
export async function saveHiScore(value: number): Promise<void> {
  const store = await openStore(HISCORE_FILE);
  try {
    await store?.set(HISCORE_KEY, value);
    await store?.save();
  } catch (error) {
    warnInDev('ハイスコアを保存できませんでした', error);
  }
}

/** CRT の設定を読む。読み込めない場合はオン（16.15） */
export async function loadCrtEnabled(): Promise<boolean> {
  const store = await openStore(SETTINGS_FILE);
  try {
    const value = await store?.get<unknown>(CRT_KEY);
    return typeof value === 'boolean' ? value : true;
  } catch (error) {
    warnInDev('CRT の設定を読み込めませんでした', error);
    return true;
  }
}

export async function saveCrtEnabled(enabled: boolean): Promise<void> {
  const store = await openStore(SETTINGS_FILE);
  try {
    await store?.set(CRT_KEY, enabled);
    await store?.save();
  } catch (error) {
    warnInDev('CRT の設定を保存できませんでした', error);
  }
}

export interface PlatformHandlers {
  /** ウィンドウのフォーカスが外れた（16.2） */
  onFocusLost(): void;
  /** ×ボタンまたは ⌘Q（16.3） */
  onCloseRequested(): void;
}

/** Tauri のイベントを受け取り始める */
export async function listenPlatformEvents(handlers: PlatformHandlers): Promise<void> {
  if (!isTauri()) {
    // ブラウザで確認するときは、タブのフォーカスで代用する
    window.addEventListener('blur', () => handlers.onFocusLost());
    return;
  }
  const appWindow = getCurrentWindow();
  await appWindow.onFocusChanged(({ payload: focused }) => {
    if (!focused) handlers.onFocusLost();
  });
  // ×ボタン：閉じるのを止めて終了確認を出す。確定したら destroy() で破棄する（close() だと再び確認が走るため、16.3）
  await appWindow.onCloseRequested((event) => {
    event.preventDefault();
    handlers.onCloseRequested();
  });
  await listen(MENU_QUIT_EVENT, () => handlers.onCloseRequested());
}

/** ウィンドウを破棄する。最後のウィンドウなのでアプリも終了する（16.3） */
export async function destroyWindow(): Promise<void> {
  if (!isTauri()) return;
  await getCurrentWindow().destroy();
}
