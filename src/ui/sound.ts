// Sound: small procedural effects and a slow generative music pad, all made with
// WebAudio (no sound files, so it works offline and costs nothing to download).
// Effects follow game events; battle sounds fade with distance from the camera.

import type { Command } from '../sim/commands.ts';
import type { GameEvent } from '../sim/types.ts';

type Listener = { x: number; y: number; zoom: number };

const STORE = 'ascension.sound';

interface Settings {
  sfx: boolean;
  music: boolean;
  volume: number;
}

function loadSettings(): Settings {
  try {
    const s = JSON.parse(localStorage.getItem(STORE) ?? 'null') as Partial<Settings> | null;
    return { sfx: s?.sfx ?? true, music: s?.music ?? true, volume: s?.volume ?? 0.7 };
  } catch {
    return { sfx: true, music: true, volume: 0.7 };
  }
}

// Chords for the music pad (MIDI notes), a calm progression in D major / B minor.
const CHORDS = [
  [50, 57, 62, 66],
  [47, 54, 59, 62],
  [43, 50, 55, 59],
  [45, 52, 57, 61],
  [50, 57, 62, 69],
  [42, 49, 54, 57],
  [43, 50, 55, 62],
  [45, 52, 57, 64],
];
const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

export class Sound {
  readonly settings: Settings = loadSettings();
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxBus!: GainNode;
  private musicBus!: GainNode;
  private noiseBuf!: AudioBuffer;
  private nextChord = 0;
  private chordIndex = 0;
  /** Throttle: last time (audio clock) each sound played. */
  private last = new Map<string, number>();
  listener: Listener = { x: 0, y: 0, zoom: 30 };

  constructor() {
    // Browsers only allow audio after a user gesture.
    const unlock = () => {
      this.unlock();
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
  }

  private unlock(): void {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.connect(ctx.destination);
    this.sfxBus = ctx.createGain();
    this.sfxBus.connect(this.master);
    this.musicBus = ctx.createGain();
    this.musicBus.connect(this.master);
    const len = ctx.sampleRate;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    let seed = 12345;
    for (let i = 0; i < len; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      d[i] = (seed / 0x7fffffff) * 2 - 1;
    }
    this.apply();
    this.nextChord = ctx.currentTime + 1;
  }

  /** Apply the settings (volume, on/off) and remember them. */
  apply(): void {
    try {
      localStorage.setItem(STORE, JSON.stringify(this.settings));
    } catch {
      // No storage: settings last for this session.
    }
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.settings.volume, t, 0.05);
    this.sfxBus.gain.setTargetAtTime(this.settings.sfx ? 1 : 0, t, 0.05);
    this.musicBus.gain.setTargetAtTime(this.settings.music ? 0.55 : 0, t, 0.3);
  }

  toggle(what: 'sfx' | 'music'): void {
    this.settings[what] = !this.settings[what];
    this.apply();
  }

  // -------------------------------------------------------------------------
  // Building blocks

  private ready(key: string, gap: number): boolean {
    if (!this.ctx || !this.settings.sfx) return false;
    const now = this.ctx.currentTime;
    if (now - (this.last.get(key) ?? -1) < gap) return false;
    this.last.set(key, now);
    return true;
  }

  private tone(freq: number, dur: number, vol: number, type: OscillatorType = 'sine', opts: { at?: number; to?: number; attack?: number; bus?: GainNode; pan?: number; filter?: number } = {}): void {
    const ctx = this.ctx!;
    const t = opts.at ?? ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (opts.to) o.frequency.exponentialRampToValueAtTime(opts.to, t + dur);
    const g = ctx.createGain();
    const a = opts.attack ?? 0.005;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node: AudioNode = o;
    if (opts.filter) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = opts.filter;
      node.connect(f);
      node = f;
    }
    node.connect(g);
    this.out(g, opts.bus ?? this.sfxBus, opts.pan ?? 0);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private noise(dur: number, vol: number, filter: BiquadFilterType, freq: number, opts: { at?: number; to?: number; pan?: number; q?: number } = {}): void {
    const ctx = this.ctx!;
    const t = opts.at ?? ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = filter;
    f.frequency.setValueAtTime(freq, t);
    if (opts.to) f.frequency.exponentialRampToValueAtTime(opts.to, t + dur);
    f.Q.value = opts.q ?? 0.7;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g);
    this.out(g, this.sfxBus, opts.pan ?? 0);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  }

  private out(node: AudioNode, bus: GainNode, pan: number): void {
    if (pan) {
      const p = this.ctx!.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      node.connect(p).connect(bus);
    } else node.connect(bus);
  }

  // -------------------------------------------------------------------------
  // Named sounds

  click(): void {
    if (this.ready('click', 0.04)) this.tone(1800, 0.04, 0.05, 'triangle');
  }

  private play(name: string, vol = 1, pan = 0): void {
    switch (name) {
      case 'place':
        if (!this.ready('place', 0.08)) return;
        this.noise(0.18, 0.35 * vol, 'lowpass', 500);
        this.tone(110, 0.15, 0.25 * vol, 'sine', { to: 60 });
        return;
      case 'road':
        if (!this.ready('road', 0.1)) return;
        this.noise(0.25, 0.18 * vol, 'bandpass', 900, { to: 400 });
        return;
      case 'demolish':
        if (!this.ready('demolish', 0.2)) return;
        this.noise(0.6, 0.4 * vol, 'lowpass', 800, { to: 120 });
        return;
      case 'complete': {
        if (!this.ready('complete', 0.4)) return;
        const t = this.ctx!.currentTime;
        this.tone(784, 0.5, 0.12 * vol, 'triangle', { at: t });
        this.tone(1175, 0.7, 0.1 * vol, 'triangle', { at: t + 0.09 });
        return;
      }
      case 'notify':
        if (!this.ready('notify', 0.5)) return;
        this.tone(660, 0.18, 0.07 * vol, 'sine');
        this.tone(990, 0.22, 0.05 * vol, 'sine', { at: this.ctx!.currentTime + 0.06 });
        return;
      case 'alert': {
        if (!this.ready('alert', 6)) return;
        const t = this.ctx!.currentTime;
        for (let k = 0; k < 2; k++) {
          this.tone(330, 0.32, 0.12, 'sawtooth', { at: t + k * 0.42, filter: 1200 });
          this.tone(262, 0.32, 0.12, 'sawtooth', { at: t + k * 0.42 + 0.2, filter: 1200 });
        }
        return;
      }
      case 'trained':
        if (!this.ready('trained', 0.3)) return;
        this.tone(440, 0.12, 0.08, 'square', { filter: 1500 });
        this.tone(660, 0.16, 0.07, 'square', { at: this.ctx!.currentTime + 0.1, filter: 1500 });
        return;
      case 'fanfare': {
        const t = this.ctx!.currentTime;
        [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.6 + i * 0.15, 0.12, 'triangle', { at: t + i * 0.14 }));
        this.tone(262, 1.4, 0.1, 'sawtooth', { at: t, filter: 900, attack: 0.05 });
        return;
      }
      case 'gloom': {
        const t = this.ctx!.currentTime;
        [392, 330, 262, 196].forEach((f, i) => this.tone(f, 0.7, 0.1, 'triangle', { at: t + i * 0.25 }));
        return;
      }
      case 'war': {
        const t = this.ctx!.currentTime;
        for (let k = 0; k < 3; k++) this.tone(80, 0.3, 0.3, 'sine', { at: t + k * 0.22, to: 45 });
        return;
      }
      // Battle
      case 'bullet':
        if (!this.ready('bullet', 0.05)) return;
        this.noise(0.07, 0.22 * vol, 'highpass', 1800, { pan });
        return;
      case 'cannon':
        if (!this.ready('cannon', 0.08)) return;
        this.noise(0.25, 0.4 * vol, 'lowpass', 900, { to: 200, pan });
        this.tone(90, 0.2, 0.25 * vol, 'sine', { to: 45, pan });
        return;
      case 'missile':
        if (!this.ready('missile', 0.1)) return;
        this.noise(0.5, 0.2 * vol, 'bandpass', 2500, { to: 600, pan, q: 2 });
        return;
      case 'laser':
        if (!this.ready('laser', 0.08)) return;
        this.tone(1400, 0.22, 0.09 * vol, 'sawtooth', { to: 240, pan, filter: 3000 });
        return;
      case 'boom':
        if (!this.ready('boom', 0.07)) return;
        this.noise(0.7, 0.55 * vol, 'lowpass', 600, { to: 80, pan });
        this.tone(60, 0.5, 0.35 * vol, 'sine', { to: 30, pan });
        return;
      case 'collapse':
        if (!this.ready('collapse', 0.25)) return;
        this.noise(1.4, 0.6 * vol, 'lowpass', 900, { to: 60, pan });
        this.tone(45, 1.0, 0.4 * vol, 'sine', { to: 25, pan });
        return;
    }
  }

  /** Volume and pan for something happening at (x, y), from where the camera looks. */
  private spatial(x: number, y: number): { vol: number; pan: number } | null {
    const l = this.listener;
    const dx = x - l.x;
    const dy = y - l.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    const reach = 20 + l.zoom * 1.2;
    if (d > reach) return null;
    const vol = Math.max(0, 1 - d / reach) * Math.max(0.35, Math.min(1, 40 / Math.max(20, l.zoom)));
    return { vol, pan: dx / reach };
  }

  // -------------------------------------------------------------------------

  /** Sounds for what just happened in the game. */
  handleEvents(events: readonly GameEvent[], me: number): void {
    if (!this.ctx) return;
    for (const e of events) {
      switch (e.kind) {
        case 'shot': {
          const s = this.spatial(e.x, e.y);
          if (!s) break;
          const w = e.weapon;
          const name = w.type === 'laser' || w.type === 'emp' ? 'laser' : w.projectile === 'missile' || w.type === 'aa' ? 'missile' : w.type === 'bullet' ? 'bullet' : w.projectile === 'torpedo' ? 'missile' : 'cannon';
          this.play(name, s.vol, s.pan);
          break;
        }
        case 'impact': {
          if (!e.weapon.splash && e.weapon.projectile !== 'shell') break;
          const s = this.spatial(e.x, e.y);
          if (s) this.play('boom', s.vol * Math.min(1, 0.5 + (e.weapon.splash ?? 0) * 0.3), s.pan);
          break;
        }
        case 'died': {
          const s = this.spatial(e.x, e.y);
          if (s) this.play(e.entity === 'building' ? 'collapse' : 'boom', s.vol, s.pan);
          break;
        }
        case 'buildingComplete':
          if (e.player === me) this.play('complete', 0.8);
          break;
        case 'unitTrained':
          if (e.player === me) this.play('trained');
          break;
        case 'underAttack':
          if (e.player === me) this.play('alert');
          break;
        case 'notify':
          if (e.player === me) this.play('notify');
          break;
        case 'victory':
          this.play(e.player === me ? 'fanfare' : 'gloom');
          break;
        case 'defeated':
          if (e.player === me) this.play('gloom');
          break;
      }
    }
  }

  /** Sounds for the player's own orders. */
  command(c: Command): void {
    if (!this.ctx) return;
    switch (c.kind) {
      case 'place':
      case 'placeMany':
      case 'build':
        this.play('place');
        break;
      case 'road':
      case 'buildLine':
        this.play('road');
        break;
      case 'unroad':
      case 'demolish':
        this.play('demolish');
        break;
      case 'advanceAge':
        this.play('fanfare');
        break;
      case 'declareWar':
        this.play('war');
        break;
    }
  }

  /** Every frame: the music pad moves on to its next chord now and then. */
  update(): void {
    const ctx = this.ctx;
    if (!ctx || !this.settings.music) return;
    const t = ctx.currentTime;
    if (t < this.nextChord - 0.1) return;
    const chord = CHORDS[this.chordIndex++ % CHORDS.length]!;
    const len = 7.5;
    for (const n of chord) this.tone(midi(n), len + 2.5, 0.035, 'triangle', { at: this.nextChord, attack: 2.2, bus: this.musicBus, filter: 1400 });
    this.tone(midi(chord[0]! - 12), len + 2, 0.05, 'sine', { at: this.nextChord, attack: 1.5, bus: this.musicBus });
    // A few soft bell notes on top.
    for (let k = 0; k < 3; k++) {
      if (Math.random() < 0.55) {
        const n = chord[1 + Math.floor(Math.random() * 3)]! + 12;
        this.tone(midi(n), 2.2, 0.025, 'sine', { at: this.nextChord + 1.5 + k * 2 + Math.random() * 0.6, attack: 0.01, bus: this.musicBus });
      }
    }
    this.nextChord += len;
  }
}
