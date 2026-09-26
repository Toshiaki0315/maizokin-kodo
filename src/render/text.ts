// ステータス帯とオーバーレイの文字（仕様 3章・4章・16.3・16.6・16.10）。
// 仕様書の y 座標はベースラインなので、フォントの ascent を測って Text の上端を合わせる
import { CanvasTextMetrics, Container, Graphics, Text, TextStyle } from 'pixi.js';
import { CANVAS_HEIGHT, CANVAS_WIDTH } from '../core/config';
import type { Game, GameState } from '../core/game';

/** 英数字は Courier New、日本語はヒラギノ（どちらも macOS 標準、16.6） */
const FONT_FAMILY = ['Courier New', 'Hiragino Sans', 'Hiragino Kaku Gothic ProN', 'sans-serif'];

type Align = 'left' | 'center' | 'right';

function makeStyle(size: number, color: number, bold: boolean): TextStyle {
  return new TextStyle({ fontFamily: FONT_FAMILY, fontSize: size, fontWeight: bold ? 'bold' : 'normal', fill: color });
}

/** x と揃え方を決めておき、文字列とベースラインを受け取って置く文字 */
class PlacedText {
  readonly text: Text;
  private key = '';

  constructor(x: number, align: Align, resolution: number) {
    this.text = new Text({ text: '', resolution });
    this.text.anchor.x = align === 'left' ? 0 : align === 'center' ? 0.5 : 1;
    this.text.x = x;
  }

  /** value が空なら隠す。変わっていなければ何もしない */
  place(value: string, baseline: number, style: TextStyle): void {
    const key = `${value}\n${baseline}\n${style.uid}`;
    if (key === this.key) return;
    this.key = key;
    this.text.visible = value !== '';
    if (value === '') return;
    this.text.style = style;
    this.text.text = value;
    this.text.y = baseline - CanvasTextMetrics.measureText(value, style).fontProperties.ascent;
  }
}

const STATUS_BASELINE = 28;

/** ステータス帯（16.10）。y=28 がベースライン、太字20px、#FFFF00 */
export class StatusBar {
  readonly view = new Container();
  private readonly style = makeStyle(20, 0xffff00, true);
  private readonly score: PlacedText;
  private readonly hiScore: PlacedText;
  private readonly level: PlacedText;
  private readonly lives: PlacedText;

  constructor(resolution: number) {
    this.score = new PlacedText(20, 'left', resolution);
    this.hiScore = new PlacedText(200, 'left', resolution);
    this.level = new PlacedText(450, 'center', resolution);
    this.lives = new PlacedText(580, 'right', resolution);
    this.view.addChild(this.score.text, this.hiScore.text, this.level.text, this.lives.text);
  }

  update(game: Game): void {
    this.score.place(`スコア: ${game.score}`, STATUS_BASELINE, this.style);
    this.hiScore.place(`ハイスコア: ${game.hiScore}`, STATUS_BASELINE, this.style);
    this.level.place(`坑道: ${game.level}`, STATUS_BASELINE, this.style);
    this.lives.place(`残機: ${game.lives}`, STATUS_BASELINE, this.style);
  }
}

interface OverlayLines {
  /** 1行目（太字40px）の文字・色・ベースライン */
  title: readonly [string, number, number];
  /** 2行目（24px、#FFFF00） */
  message: readonly [string, number];
  /** 3行目（16px、#FFFFFF）。ない場合は空文字 */
  note: readonly [string, number];
}

/** 状態ごとのオーバーレイの文言（4章・16.3・16.10）。y はキャンバス全体基準のベースライン */
function overlayLines(state: GameState, newRecord: boolean): OverlayLines | null {
  switch (state) {
    case 'START':
      return {
        title: ['埋蔵金坑道', 0x00ff00, 290],
        message: ['ENTERキーを押してスタート', 340],
        note: ['Z: 掘る  X: 埋める  矢印: 移動', 380],
      };
    case 'GAMEOVER':
      return {
        title: ['ゲームオーバー', 0xff0000, 310],
        message: ['ENTERキーを押してリトライ', 360],
        note: [newRecord ? 'ハイスコア更新！' : '', 400],
      };
    case 'LEVEL_CLEAR':
      return {
        title: ['次の坑道へ下降中...', 0x00ff00, 310],
        message: ['ENTERキーで次の坑道へ', 360],
        note: ['', 400],
      };
    case 'PAUSED':
      return {
        title: ['一時停止中', 0x00ff00, 310],
        message: ['Pキーで再開', 360],
        note: ['ESCキーで終了', 400],
      };
    case 'QUIT_CONFIRM':
      return {
        title: ['ゲームを終了しますか？', 0xffff00, 310],
        message: ['ENTERキーで終了', 360],
        note: ['ESCキーで戻る', 400],
      };
    case 'PLAYING':
    case 'MISS':
      return null;
  }
}

/** 状態オーバーレイ。全画面に rgba(0,0,0,0.7) を重ね、3行を中央揃えで出す（4章） */
export class Overlay {
  readonly view = new Container();
  private readonly titleStyles = new Map<number, TextStyle>();
  private readonly messageStyle = makeStyle(24, 0xffff00, false);
  private readonly noteStyle = makeStyle(16, 0xffffff, false);
  private readonly title: PlacedText;
  private readonly message: PlacedText;
  private readonly note: PlacedText;

  constructor(resolution: number) {
    const dim = new Graphics().rect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT).fill({ color: 0x000000, alpha: 0.7 });
    const center = CANVAS_WIDTH / 2;
    this.title = new PlacedText(center, 'center', resolution);
    this.message = new PlacedText(center, 'center', resolution);
    this.note = new PlacedText(center, 'center', resolution);
    this.view.addChild(dim, this.title.text, this.message.text, this.note.text);
  }

  update(game: Game): void {
    const lines = overlayLines(game.state, game.newRecord);
    this.view.visible = lines !== null;
    if (lines === null) return;
    const [title, color, titleY] = lines.title;
    this.title.place(title, titleY, this.titleStyle(color));
    this.message.place(lines.message[0], lines.message[1], this.messageStyle);
    this.note.place(lines.note[0], lines.note[1], this.noteStyle);
  }

  private titleStyle(color: number): TextStyle {
    let style = this.titleStyles.get(color);
    if (!style) {
      style = makeStyle(40, color, true);
      this.titleStyles.set(color, style);
    }
    return style;
  }
}
