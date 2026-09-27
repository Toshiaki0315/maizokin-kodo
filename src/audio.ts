// 効果音と BGM（仕様 16.18）。音声ファイルは使わず、Web Audio でその場で合成する。
// 曲はこのゲームのために作ったオリジナル曲。プレイ中の BGM（イ短調、16小節）と、ゲームオーバーの曲（4小節）の2つ
import type { GameEvent, GameState } from './core/game';

// ---- 曲（16.18） ----

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

/**
 * メロディを「どのステップで、何ステップ伸ばして、何の音か」の列にする。
 * 1小節＝8分音符8つ（1ステップ＝8分音符）。音名は「音＋オクターブ」、"-" は前の音を伸ばす、"." は休み
 */
function parseMelody(bars: readonly string[]): ScheduledNote[] {
  const tokens = bars.flatMap((bar) => bar.split(' '));
  const notes: ScheduledNote[] = [];
  tokens.forEach((token, step) => {
    if (token === '-' || token === '.') return;
    let length = 1;
    while (tokens[step + length] === '-') length++;
    notes.push({ step, length, hz: frequency(token) });
  });
  return notes;
}

interface TrackDefinition {
  /** テンポ（1分あたりの4分音符の数） */
  tempoBpm: number;
  melody: readonly string[];
  /** メロディの音色と音量 */
  lead: OscillatorType;
  leadVolume: number;
  /** 小節ごとのベースの根音 */
  bassRoots: readonly string[];
  /** ベースを何ステップごとに鳴らすか（1＝8分音符、4＝2分音符） */
  bassEvery: number;
  /** ベースを根音とオクターブ上で交互に鳴らすか */
  bassOctaves: boolean;
  /** 裏拍に軽いハイハットを入れるか */
  hiHat: boolean;
}

/** プレイ中の BGM。Am・F・G・E の進行を2周し、2周目は高い音域で盛り上げる */
const MAIN_THEME: TrackDefinition = {
  tempoBpm: 150,
  melody: [
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
  ],
  lead: 'square',
  leadVolume: 0.5,
  bassRoots: ['A2', 'A2', 'F2', 'F2', 'G2', 'G2', 'E2', 'E2', 'A2', 'A2', 'F2', 'F2', 'D2', 'D2', 'E2', 'E2'],
  bassEvery: 1,
  bassOctaves: true,
  hiHat: true,
};

/** ゲームオーバーの曲。ゆっくりした4小節（Am・F・Dm・E）で、少しさみしげに下りていく */
const GAME_OVER_THEME: TrackDefinition = {
  tempoBpm: 84,
  melody: ['E5 - D5 - C5 - B4 -', 'A4 - - - C5 - B4 A4', 'F4 - A4 - G4 - F4 -', 'E4 - - - G#4 - - -'],
  lead: 'triangle',
  leadVolume: 0.9,
  bassRoots: ['A2', 'F2', 'D2', 'E2'],
  bassEvery: 4,
  bassOctaves: false,
  hiHat: false,
};

interface Track extends TrackDefinition {
  stepSeconds: number;
  notes: ScheduledNote[];
  loopSteps: number;
}

function buildTrack(definition: TrackDefinition): Track {
  return {
    ...definition,
    stepSeconds: 60 / definition.tempoBpm / 2,
    notes: parseMelody(definition.melody),
    loopSteps: definition.melody.length * 8,
  };
}

type TrackName = 'main' | 'gameOver';

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
  private readonly tracks: Readonly<Record<TrackName, Track>> = {
    main: buildTrack(MAIN_THEME),
    gameOver: buildTrack(GAME_OVER_THEME),
  };
  private readonly noise: AudioBuffer;

  /** 鳴らしている曲。止めているときは null */
  private current: TrackName | null = null;
  /** プレイ中の BGM を止めた位置。再開したら続きから鳴らす */
  private mainResumeStep = 0;
  /** 次に予約するステップと、その時刻 */
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

  /**
   * 状態に合わせて曲を切り替える。プレイ中は BGM（止めた位置の続きから）、
   * ゲームオーバーの間はゲームオーバーの曲（毎回頭から）を繰り返し鳴らし、それ以外では止める
   */
  updateMusic(state: GameState): void {
    const wanted: TrackName | null = state === 'PLAYING' ? 'main' : state === 'GAMEOVER' ? 'gameOver' : null;
    if (wanted === this.current) return;
    this.stopMusic();
    if (wanted !== null) this.startMusic(wanted);
  }

  private startMusic(name: TrackName): void {
    const now = this.ctx.currentTime;
    this.current = name;
    this.nextStep = name === 'main' ? this.mainResumeStep : 0;
    // 止めた直後の曲の予約（先読み分）と重ならないよう、少し間を空けて始める
    this.nextTime = now + SCHEDULE_AHEAD + 0.03;
    this.music.gain.cancelScheduledValues(now);
    this.music.gain.setValueAtTime(0, now);
    this.music.gain.setValueAtTime(MUSIC_VOLUME, this.nextTime - 0.01);
    this.timer = setInterval(() => this.scheduleMusic(), SCHEDULER_INTERVAL_MS);
    this.scheduleMusic();
  }

  private stopMusic(): void {
    if (this.current === null) return;
    if (this.current === 'main') this.mainResumeStep = this.nextStep;
    this.current = null;
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    // 先読みで予約済みの音が鳴らないよう、すぐに音量を下げる
    const now = this.ctx.currentTime;
    this.music.gain.cancelScheduledValues(now);
    this.music.gain.setTargetAtTime(0, now, 0.01);
  }

  /** 少し先までの音を予約する */
  private scheduleMusic(): void {
    if (this.current === null) return;
    const track = this.tracks[this.current];
    while (this.nextTime < this.ctx.currentTime + SCHEDULE_AHEAD) {
      this.scheduleStep(track, this.nextStep, this.nextTime);
      this.nextStep = (this.nextStep + 1) % track.loopSteps;
      this.nextTime += track.stepSeconds;
    }
  }

  private scheduleStep(track: Track, step: number, time: number): void {
    for (const note of track.notes) {
      if (note.step === step) {
        this.tone(track.lead, note.hz, time, note.length * track.stepSeconds * 0.9, track.leadVolume, this.music);
      }
    }
    if (step % track.bassEvery === 0) {
      const bar = Math.floor(step / 8);
      const octave = track.bassOctaves && step % 2 === 1 ? 2 : 1;
      const length = track.stepSeconds * track.bassEvery * 0.8;
      this.tone('triangle', frequency(track.bassRoots[bar]) * octave, time, length, 0.9, this.music);
    }
    // 裏拍に軽いハイハット
    if (track.hiHat && step % 2 === 1) this.noiseBurst(time, 0.03, 8000, 'highpass', 0.15, this.music);
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
