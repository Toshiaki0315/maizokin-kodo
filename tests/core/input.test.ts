import { describe, expect, it } from 'vitest';
import { Input, toGameKey, type GameKey, type InputSnapshot } from '../../src/core/input';

const NOTHING: InputSnapshot = {
  dir: null,
  dig: false,
  fill: false,
  enter: false,
  pause: false,
  escape: false,
};

function press(input: Input, ...keys: GameKey[]): void {
  for (const key of keys) input.keyDown(key);
}

describe('toGameKey：キーとゲーム操作の対応（仕様 5.1）', () => {
  it.each([
    ['ArrowUp', 'UP'],
    ['ArrowDown', 'DOWN'],
    ['ArrowLeft', 'LEFT'],
    ['ArrowRight', 'RIGHT'],
    ['KeyZ', 'DIG'],
    ['KeyX', 'FILL'],
    ['Enter', 'ENTER'],
    ['NumpadEnter', 'ENTER'],
    ['KeyP', 'PAUSE'],
    ['Escape', 'ESCAPE'],
    ['KeyF', 'CRT'],
    ['KeyM', 'MUTE'],
  ])('%s は %s', (code, key) => {
    expect(toGameKey(code)).toBe(key);
  });

  it('割り当てのないキーは null', () => {
    expect(toGameKey('KeyA')).toBeNull();
    expect(toGameKey('Space')).toBeNull();
    expect(toGameKey('ShiftLeft')).toBeNull();
  });
});

describe('Input：押下中のキー（仕様 5.1・14.5）', () => {
  it('何も押していなければ何もない', () => {
    expect(new Input().snapshot()).toEqual(NOTHING);
  });

  it('押している方向がスナップショットに載り、離すと消える', () => {
    const input = new Input();
    input.keyDown('LEFT');
    expect(input.snapshot().dir).toBe('LEFT');
    expect(input.snapshot().dir).toBe('LEFT');
    input.keyUp('LEFT');
    expect(input.snapshot().dir).toBeNull();
  });

  it.each<[GameKey[], string]>([
    [['UP', 'DOWN', 'LEFT', 'RIGHT'], 'UP'],
    [['DOWN', 'LEFT', 'RIGHT'], 'DOWN'],
    [['LEFT', 'RIGHT'], 'LEFT'],
    [['RIGHT', 'UP'], 'UP'],
    [['RIGHT', 'DOWN'], 'DOWN'],
  ])('同時押しは 上 > 下 > 左 > 右 の優先順位：%j → %s（仕様 5.1）', (keys, expected) => {
    const input = new Input();
    press(input, ...keys);
    expect(input.snapshot().dir).toBe(expected);
  });

  it('優先の高い方向を離すと、押したままの次の方向になる', () => {
    const input = new Input();
    press(input, 'UP', 'RIGHT');
    expect(input.snapshot().dir).toBe('UP');
    input.keyUp('UP');
    expect(input.snapshot().dir).toBe('RIGHT');
  });

  it('Z で掘る、X で埋める（仕様 5.1）', () => {
    const input = new Input();
    input.keyDown('DIG');
    expect(input.snapshot()).toMatchObject({ dig: true, fill: false });
    input.keyUp('DIG');
    input.keyDown('FILL');
    expect(input.snapshot()).toMatchObject({ dig: false, fill: true });
  });

  it('Z と X の同時押しは Z が優先（仕様 5.1・15.3）', () => {
    const input = new Input();
    press(input, 'FILL', 'DIG');
    expect(input.snapshot()).toMatchObject({ dig: true, fill: false });
  });

  it('押していないキーを離しても問題ない', () => {
    const input = new Input();
    input.keyUp('UP');
    input.keyUp('ENTER');
    expect(input.snapshot()).toEqual(NOTHING);
  });
});

describe('Input：Enter・P・ESC の押下エッジ（仕様 13.1 #10・14.3・14.5）', () => {
  it.each<[GameKey, keyof InputSnapshot]>([
    ['ENTER', 'enter'],
    ['PAUSE', 'pause'],
    ['ESCAPE', 'escape'],
  ])('%s は押した直後のスナップショットに1回だけ載る', (key, field) => {
    const input = new Input();
    input.keyDown(key);
    expect(input.snapshot()[field]).toBe(true);
    // 押しっぱなしでも次のスナップショットには載らない
    expect(input.snapshot()[field]).toBe(false);
  });

  it('押しっぱなしのキーリピート（keydown の繰り返し）では載らない（仕様 13.1 #10・15.3）', () => {
    const input = new Input();
    input.keyDown('ENTER');
    expect(input.snapshot().enter).toBe(true);
    input.keyDown('ENTER');
    input.keyDown('ENTER');
    expect(input.snapshot().enter).toBe(false);
  });

  it('離して押し直せば、また載る', () => {
    const input = new Input();
    input.keyDown('PAUSE');
    expect(input.snapshot().pause).toBe(true);
    input.keyUp('PAUSE');
    input.keyDown('PAUSE');
    expect(input.snapshot().pause).toBe(true);
  });

  it('スナップショットを作る前に押して離しても、次のスナップショットに載る（ステップ0回のフレームの持ち越し、仕様 14.5）', () => {
    const input = new Input();
    input.keyDown('ESCAPE');
    input.keyUp('ESCAPE');
    expect(input.snapshot().escape).toBe(true);
    expect(input.snapshot().escape).toBe(false);
  });

  it('同じスナップショットの間に何度押しても1回として扱う', () => {
    const input = new Input();
    input.keyDown('ENTER');
    input.keyUp('ENTER');
    input.keyDown('ENTER');
    expect(input.snapshot().enter).toBe(true);
    expect(input.snapshot().enter).toBe(false);
  });
});

describe('Input：F キー（CRT の切り替え、仕様 14.5・16.15）', () => {
  it('押下エッジを1回だけ受け取れて、スナップショットには載らない', () => {
    const input = new Input();
    input.keyDown('CRT');
    expect(input.snapshot()).toEqual(NOTHING);
    expect(input.takeCrtToggle()).toBe(true);
    expect(input.takeCrtToggle()).toBe(false);
  });

  it('キーリピートでは切り替わらない', () => {
    const input = new Input();
    input.keyDown('CRT');
    input.takeCrtToggle();
    input.keyDown('CRT');
    expect(input.takeCrtToggle()).toBe(false);
  });

  it('入力リセットでは消えない（16.7 のリセット対象外。どの状態でも切り替えられる）', () => {
    const input = new Input();
    input.keyDown('CRT');
    input.reset();
    expect(input.takeCrtToggle()).toBe(true);
  });
});

describe('Input：入力リセット（仕様 16.7）', () => {
  it('押しっぱなしの方向・Z・X はリセット後に無効になる', () => {
    const input = new Input();
    press(input, 'LEFT', 'DIG');
    input.reset();
    expect(input.snapshot()).toEqual(NOTHING);
  });

  it('リセット後はキーリピートでは復帰しない（仕様 16.7・15.3）', () => {
    const input = new Input();
    press(input, 'LEFT', 'FILL');
    input.reset();
    press(input, 'LEFT', 'FILL');
    expect(input.snapshot()).toEqual(NOTHING);
  });

  it('一度離して押し直すと有効に戻る（仕様 16.7）', () => {
    const input = new Input();
    press(input, 'LEFT', 'DIG');
    input.reset();
    input.keyUp('LEFT');
    input.keyDown('LEFT');
    expect(input.snapshot()).toMatchObject({ dir: 'LEFT', dig: false });
    input.keyUp('DIG');
    input.keyDown('DIG');
    expect(input.snapshot()).toMatchObject({ dir: 'LEFT', dig: true });
  });

  it('無効になったキーは方向の優先順位に加わらない', () => {
    const input = new Input();
    input.keyDown('UP');
    input.reset();
    input.keyDown('RIGHT');
    // UP は押しっぱなしだが無効なので、あとから押した RIGHT が有効
    expect(input.snapshot().dir).toBe('RIGHT');
  });

  it('未処理の Enter・P・ESC を捨てる（仕様 16.7）', () => {
    const input = new Input();
    input.keyDown('ENTER');
    input.keyUp('ENTER');
    press(input, 'PAUSE', 'ESCAPE');
    input.reset();
    expect(input.snapshot()).toEqual(NOTHING);
  });

  it('押しっぱなしの Enter はキーリピートでも載らず、押し直すと載る', () => {
    const input = new Input();
    input.keyDown('ENTER');
    input.reset();
    input.keyDown('ENTER');
    expect(input.snapshot().enter).toBe(false);
    input.keyUp('ENTER');
    input.keyDown('ENTER');
    expect(input.snapshot().enter).toBe(true);
  });

  it('リセット後に初めて押したキーはすぐ有効', () => {
    const input = new Input();
    input.reset();
    press(input, 'DOWN', 'ENTER');
    expect(input.snapshot()).toMatchObject({ dir: 'DOWN', enter: true });
  });
});

describe('Input：releaseAll（ウィンドウのフォーカス喪失時）', () => {
  // フォーカスが外れている間に離したキーは keyup が届かないため、すべて離したものとして扱う
  it('押下中・無効のキーをすべて離した扱いにし、次の押下は新しい押下になる', () => {
    const input = new Input();
    press(input, 'LEFT', 'ENTER');
    input.reset();
    input.releaseAll();
    expect(input.snapshot()).toEqual(NOTHING);
    press(input, 'LEFT', 'ENTER');
    expect(input.snapshot()).toMatchObject({ dir: 'LEFT', enter: true });
  });
});

describe('Input：M キー（音のオン・オフ、仕様 16.18）', () => {
  it('押下エッジを1回だけ受け取れて、スナップショットには載らない', () => {
    const input = new Input();
    input.keyDown('MUTE');
    expect(input.snapshot()).toEqual(NOTHING);
    expect(input.takeMuteToggle()).toBe(true);
    expect(input.takeMuteToggle()).toBe(false);
  });

  it('キーリピートでは切り替わらない', () => {
    const input = new Input();
    input.keyDown('MUTE');
    input.takeMuteToggle();
    input.keyDown('MUTE');
    expect(input.takeMuteToggle()).toBe(false);
  });

  it('入力リセットでは消えない（どの状態でも切り替えられる）', () => {
    const input = new Input();
    input.keyDown('MUTE');
    input.reset();
    expect(input.takeMuteToggle()).toBe(true);
  });

  it('F キーとは別に受け取る', () => {
    const input = new Input();
    input.keyDown('MUTE');
    expect(input.takeCrtToggle()).toBe(false);
    expect(input.takeMuteToggle()).toBe(true);
  });
});
