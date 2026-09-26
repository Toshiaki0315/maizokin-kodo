// 効果音と BGM（仕様 16.18）。音声ファイルは使わず、Web Audio でその場で合成する。
// BGM はこのゲームのために作ったオリジナル曲（イ短調、16小節のループ）
import type { GameEvent, GameState } from './core/game';

// ---- 曲（16.18） ----

/** テンポ（1分あたりの4分音符の数）。1ステップ＝8分音符 */
const TEMPO_BPM = 150;
const STEP_SECONDS = 60 / TEMPO_BPM / 2;

/**
 * メロディ。1小節＝8分音符8つ。音名は「音＋オクターブ」、"-" は前の音を伸ばす、"." は休み。
 * Am・F・G・E の進行を2周し、2周目は高い音域で盛り上げる
 */
const MELODY: readonly string[] = [
  'A4 . C5 . E5 - D5 C5',
  'B4 . A4 . E4 - - .',
  'F4 . A4 . C5 - B4 A4',
  'G4 . F4 . C4 - - .',
  'G4 . B4 . D5 - C5 B4',
  'A4 . G4 . D4 - - .',
  'E4 . G#4 . B4 - A4 G#4',
  'B4 - - - . . . .',
  'A4 C5 E5 A5 G5 - E5 .',
  'F5 E5 D5 C5 E5 - - .',
  'F5 . E5 . D5 . C5 .',
  'A4 - C5 - F5 - - .',
  'D5 . F5 . A5 - G5 F5',
  'E5 . D5 . A4 - - .',
  'G#4 . B4 . E5 - D5 B4',
  'E5 - - - . . . .',
];

/** 小節ごとのベースの根音。8分音符で根音とオクターブ上を交互に鳴らす */
const BASS_ROOTS: readonly string[] = [
  'A2', 'A2', 'F2', 'F2', 'G2', 'G2', 'E2', 'E2',
  'A2', 'A2', 'F2', 'F2', 'D2', 'D2', 'E2', 'E2',
];

const NOTE_OFFSETS: Readonly<Record<string, number>> = {
  C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11,
};

/** 音名（例 "G#4"）を周波数（Hz）にする。A4 = 440Hz */
function frequency(note: string): number {
  const match = /^([A-G]#?)(\d)$/.exec(note);
  if (!match) throw new Error(`音名が読めません: ${note}`);
  const midi = (Number(match[2]) + 1) * 12 + NOTE_OFFSETS[match[1]];
  return 440 * 2 ** ((midi - 69) / 12);
}

interface ScheduledNote {
  step: number;
  /** 伸ばす長さ（ステップ数） */
  length: number;
  hz: number;
}

/** メロディを「どのステップで、何ステップ伸ばして、何の音か」の列にする */
function parseMelody(): ScheduledNote[] {
  const tokens = MELODY.flatMap((bar) => bar.split(' '));
  const notes: ScheduledNote[] = [];
  tokens.forEach((token, step) => {
    if (token === '-' || token === '.') return;
    let length = 1;
    while (tokens[step + length] === '-') length++;
    notes.push({ step, length, hz: frequency(token) });
  });
  return notes;
}

const LOOP_STEPS = MELODY.length * 8;

// ---- 音量 ----

const MASTER_VOLUME = 0.6;
const MUSIC_VOLUME = 0.18;
const EFFECT_VOLUME = 0.7;
/** 先読みして予約しておく時間（秒）と、予約を確かめる間隔（ミリ秒） */
const SCHEDULE_AHEAD = 0.12;
const SCHEDULER_INTERVAL_MS = 25;

export class Sound {
  private readonly ctx: AudioContext;
  private readonly master: GainNode;
  private readonly music: GainNode;
  private readonly effects: GainNode;
  private readonly melody = parseMelody();
  private readonly noise: AudioBuffer;

  private musicPlaying = false;
  /** 次に予約するステップと、その時刻。止めて再開したら続きから鳴らす */
  private nextStep = 0;
  private nextTime = 0;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(enabled: boolean) {
    this.ctx = new AudioContext();
    this.master = this.ctx.createGain();
    this.master.gain.value = enabled ? MASTER_VOLUME : 0;
    this.master.connect(this.ctx.destination);
    this.music = this.ctx.createGain();
    this.music.gain.value = 0;
    this.music.connect(this.master);
    this.effects = this.ctx.createGain();
    this.effects.gain.value = EFFECT_VOLUME;
    this.effects.connect(this.master);

    // 掘る音とハイハットに使うホワイトノイズ（0.5秒分）
    this.noise = this.ctx.createBuffer(1, this.ctx.sampleRate / 2, this.ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }

  /**
   * ブラウザ（WebView）は、ユーザーが操作するまで音を出させない。
   * main.ts が最初のキー入力のときに呼ぶ
   */
  unlock(): void {
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  /** 音のオン・オフ（M キー）。BGM と効果音をまとめて切り替える */
  setEnabled(enabled: boolean): void {
    this.master.gain.setTargetAtTime(enabled ? MASTER_VOLUME : 0, this.ctx.currentTime, 0.02);
  }

  /** ゲームの出来事に合わせて効果音を鳴らす（16.18 の表） */
  handleEvent(event: GameEvent): void {
    switch (event.type) {
      case 'holeDug':
        this.playDig();
        break;
      case 'holeFilled':
        this.playFill();
        break;
      case 'goldCollected':
        this.playArpeggio(['E6', 'B6'], 0.07, 0.35);
        break;
      case 'alienKilled':
        this.playArpeggio(['C5', 'E5', 'G5', 'C6'], 0.06, 0.4);
        break;
      case 'stairsAppeared':
        this.playArpeggio(['A4', 'C#5', 'E5', 'A5'], 0.11, 0.4, 0.35);
        break;
      case 'levelCleared':
        // 階段のファンファーレより長く華やかに（ド・ミ・ソ・ド・ミ〜）
        this.playArpeggio(['C5', 'E5', 'G5', 'C6', 'E6'], 0.12, 0.4, 0.7);
        break;
      case 'miss':
        this.playMiss();
        break;
      default:
        break;
    }
  }

  /** BGM はプレイ中だけ鳴らす。それ以外では止め、再開したら続きから鳴らす */
  updateMusic(state: GameState): void {
    const shouldPlay = state === 'PLAYING';
    if (shouldPlay === this.musicPlaying) return;
    this.musicPlaying = shouldPlay;
    const now = this.ctx.currentTime;
    if (shouldPlay) {
      this.nextTime = now + 0.05;
      this.music.gain.cancelScheduledValues(now);
      this.music.gain.setValueAtTime(MUSIC_VOLUME, now);
      this.timer = setInterval(() => this.scheduleMusic(), SCHEDULER_INTERVAL_MS);
      this.scheduleMusic();
    } else {
      if (this.timer !== null) clearInterval(this.timer);
      this.timer = null;
      // 先読みで予約済みの音が鳴らないよう、すぐに音量を下げる
      this.music.gain.cancelScheduledValues(now);
      this.music.gain.setTargetAtTime(0, now, 0.01);
    }
  }

  /** 少し先までの音を予約する */
  private scheduleMusic(): void {
    while (this.nextTime < this.ctx.currentTime + SCHEDULE_AHEAD) {
      this.scheduleStep(this.nextStep, this.nextTime);
      this.nextStep = (this.nextStep + 1) % LOOP_STEPS;
      this.nextTime += STEP_SECONDS;
    }
  }

  private scheduleStep(step: number, time: number): void {
    for (const note of this.melody) {
      if (note.step === step) this.tone('square', note.hz, time, note.length * STEP_SECONDS * 0.9, 0.5, this.music);
    }
    const bar = Math.floor(step / 8);
    const bassHz = frequency(BASS_ROOTS[bar]) * (step % 2 === 0 ? 1 : 2);
    this.tone('triangle', bassHz, time, STEP_SECONDS * 0.8, 0.9, this.music);
    // 裏拍に軽いハイハット
    if (step % 2 === 1) this.noiseBurst(time, 0.03, 8000, 'highpass', 0.15, this.music);
  }

  /** 掘る音：低めのノイズの「ザッ」 */
  private playDig(): void {
    const t = this.ctx.currentTime;
    this.noiseBurst(t, 0.12, 900, 'lowpass', 0.9, this.effects);
    this.tone('square', 110, t, 0.06, 0.25, this.effects);
  }

  /** 埋める音：音程が少し下がる「トン」 */
  private playFill(): void {
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(330, t);
    osc.frequency.exponentialRampToValueAtTime(160, t + 0.1);
    gain.gain.setValueAtTime(0.9, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    osc.connect(gain).connect(this.effects);
    osc.start(t);
    osc.stop(t + 0.13);
  }

  /**
   * 音を順に短く鳴らす（金塊・撃破・階段）。
   * lastHold を指定すると、最後の音だけその長さ（秒）伸ばす
   */
  private playArpeggio(notes: readonly string[], stepSeconds: number, volume: number, lastHold = 0): void {
    const t = this.ctx.currentTime;
    notes.forEach((note, i) => {
      const isLast = i === notes.length - 1;
      const duration = isLast && lastHold > 0 ? lastHold : stepSeconds * 0.9;
      this.tone('square', frequency(note), t + i * stepSeconds, duration, volume, this.effects);
    });
  }

  /** ミスの音：音程が 700Hz から 90Hz へ、揺れながら下がっていく（約0.6秒） */
  private playMiss(): void {
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    // 下がりながら震えるよう、低い周波数の揺れを音程に足す
    const wobble = this.ctx.createOscillator();
    const wobbleDepth = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(700, t);
    osc.frequency.exponentialRampToValueAtTime(90, t + 0.6);
    wobble.frequency.value = 18;
    wobbleDepth.gain.value = 30;
    wobble.connect(wobbleDepth).connect(osc.frequency);
    gain.gain.setValueAtTime(0.35, t);
    gain.gain.linearRampToValueAtTime(0.3, t + 0.5);
    gain.gain.linearRampToValueAtTime(0, t + 0.65);
    osc.connect(gain).connect(this.effects);
    osc.start(t);
    wobble.start(t);
    osc.stop(t + 0.66);
    wobble.stop(t + 0.66);
  }

  private tone(type: OscillatorType, hz: number, time: number, duration: number, volume: number, out: AudioNode): void {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(hz, time);
    // プツッという音が出ないよう、立ち上がりと終わりを少しなだらかにする
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(volume, time + 0.005);
    gain.gain.setValueAtTime(volume, time + Math.max(duration - 0.02, 0.005));
    gain.gain.linearRampToValueAtTime(0, time + duration);
    osc.connect(gain).connect(out);
    osc.start(time);
    osc.stop(time + duration + 0.01);
  }

  private noiseBurst(
    time: number,
    duration: number,
    cutoffHz: number,
    filterType: BiquadFilterType,
    volume: number,
    out: AudioNode,
  ): void {
    const source = this.ctx.createBufferSource();
    source.buffer = this.noise;
    const filter = this.ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = cutoffHz;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(volume, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + duration);
    source.connect(filter).connect(gain).connect(out);
    source.start(time);
    source.stop(time + duration + 0.01);
  }
}
