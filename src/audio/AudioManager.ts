import type { AudioManager as AudioManagerContract } from '../game/GameState';

const MASTER_GAIN = 0.5;
const AMBIENT_GAIN = 0.02;
const MUSIC_GAIN = 0.02;

export class AudioManager implements AudioManagerContract {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private white: AudioBuffer | null = null;
  private brown: AudioBuffer | null = null;
  private ambient: AudioBufferSourceNode | null = null;
  private ambientWanted = false;
  private _enabled = true;
  private airflow: { src: AudioBufferSourceNode; gain: GainNode } | null = null;

  private musicWanted = false;
  private musicNodes: { osc: OscillatorNode[]; gain: GainNode; filter: BiquadFilterNode } | null = null;

  get enabled(): boolean {
    return this._enabled;
  }

  unlock(): void {
    try {
      if (this.ctx) {
        if (this.ctx.state === 'suspended') void this.ctx.resume();
        return;
      }
      const ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!ctor) return;
      const ctx = new ctor();
      const master = ctx.createGain();
      master.gain.value = this._enabled ? MASTER_GAIN : 0;
      master.connect(ctx.destination);
      this.ctx = ctx;
      this.master = master;
      this.white = this.buffer(ctx, 1.5, () => Math.random() * 2 - 1);
      let last = 0;
      this.brown = this.buffer(ctx, 2.5, () => {
        const white = Math.random() * 2 - 1;
        last = (last + 0.02 * white) / 1.02;
        return last * 3.5;
      });
      if (this.ambientWanted) this.startAmbient(ctx, master);
      if (this.musicWanted) this.startMusic(ctx, master);
    } catch {
      this.ctx = null;
      this.master = null;
    }
  }

  setEnabled(on: boolean): void {
    this._enabled = on;
    try {
      if (!this.ctx || !this.master) return;
      const t = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(t);
      this.master.gain.setValueAtTime(this.master.gain.value, t);
      this.master.gain.linearRampToValueAtTime(on ? MASTER_GAIN : 0, t + 0.18);
    } catch {
      /* ignore audio errors */
    }
  }

  click(): void {
    this.play((ctx, master) => {
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(1900, t);
      osc.frequency.exponentialRampToValueAtTime(880, t + 0.035);
      g.gain.setValueAtTime(0.1, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
      osc.connect(g);
      g.connect(master);
      osc.start(t);
      osc.stop(t + 0.07);
    });
  }

  place(): void {
    this.play((ctx, master) => {
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(130, t);
      osc.frequency.exponentialRampToValueAtTime(55, t + 0.16);
      g.gain.setValueAtTime(0.32, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);
      osc.connect(g);
      g.connect(master);
      osc.start(t);
      osc.stop(t + 0.26);
    });
  }

  paper(): void {
    this.play((ctx, master) => {
      const buf = this.white;
      if (!buf) return;
      const t = ctx.currentTime;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = 1.6;
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 1400;
      filter.Q.value = 0.7;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.14, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
      src.connect(filter);
      filter.connect(g);
      g.connect(master);
      src.start(t);
      src.stop(t + 0.18);
    });
  }

  pop(): void {
    this.play((ctx, master) => {
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(320, t);
      osc.frequency.exponentialRampToValueAtTime(940, t + 0.12);
      g.gain.setValueAtTime(0.2, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
      osc.connect(g);
      g.connect(master);
      osc.start(t);
      osc.stop(t + 0.2);
    });
  }

  chime(): void {
    this.play((ctx, master) => {
      const t = ctx.currentTime;
      [660, 990].forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        osc.detune.value = idx === 1 ? 4 : -3;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.14, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5 + idx * 0.06);
        osc.connect(g);
        g.connect(master);
        osc.start(t);
        osc.stop(t + 0.7 + idx * 0.06);
      });
    });
  }

  ignite(): void {
    this.play((ctx, master) => {
      const buf = this.white;
      if (!buf) return;
      const t = ctx.currentTime;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(2600, t);
      filter.frequency.exponentialRampToValueAtTime(320, t + 0.45);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.3, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
      src.connect(filter);
      filter.connect(g);
      g.connect(master);
      src.start(t);
      src.stop(t + 0.6);

      const osc = ctx.createOscillator();
      const og = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(120, t);
      osc.frequency.exponentialRampToValueAtTime(38, t + 0.5);
      og.gain.setValueAtTime(0.22, t);
      og.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
      osc.connect(og);
      og.connect(master);
      osc.start(t);
      osc.stop(t + 0.6);
    });
  }

  whoosh(): void {
    this.play((ctx, master) => {
      const buf = this.white;
      if (!buf) return;
      const t = ctx.currentTime;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = 0.6;
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.Q.value = 1.2;
      filter.frequency.setValueAtTime(500, t);
      filter.frequency.exponentialRampToValueAtTime(2400, t + 0.22);
      filter.frequency.exponentialRampToValueAtTime(450, t + 0.6);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.16, t + 0.14);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.62);
      src.connect(filter);
      filter.connect(g);
      g.connect(master);
      src.start(t);
      src.stop(t + 0.66);
    });
  }

  blow(amount: number): void {
    const level = Math.max(0, Math.min(1, amount));
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;
    try {
      if (!this.airflow) {
        const buf = this.white;
        if (!buf) return;
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.loop = true;
        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.Q.value = 0.8;
        filter.frequency.value = 900;
        const g = ctx.createGain();
        g.gain.value = 0;
        src.connect(filter);
        filter.connect(g);
        g.connect(master);
        src.start();
        this.airflow = { src, gain: g };
      }
      const a = this.airflow;
      const t = ctx.currentTime;
      const target = this._enabled ? 0.1 * level : 0;
      a.gain.gain.cancelScheduledValues(t);
      a.gain.gain.setValueAtTime(a.gain.gain.value, t);
      a.gain.gain.linearRampToValueAtTime(target, t + 0.14);
    } catch {
      /* ignore audio errors */
    }
  }

  setAmbient(on: boolean): void {
    this.ambientWanted = on;
    try {
      const ctx = this.ctx;
      const master = this.master;
      if (!ctx || !master) return;
      if (on) {
        if (this.ambient || !this.brown) return;
        this.startAmbient(ctx, master);
      } else {
        const a = this.ambient;
        this.ambient = null;
        if (a) {
          try {
            a.stop();
          } catch {
            /* ignore */
          }
          a.disconnect();
        }
      }
    } catch {
      /* ignore audio errors */
    }
  }

  /** Layered ambient pad. Safe to call before the AudioContext exists. */
  setMusic(on: boolean): void {
    this.musicWanted = on;
    try {
      const ctx = this.ctx;
      if (!ctx || !this.master) return;
      if (on) {
        if (!this.musicNodes) this.startMusic(ctx, this.master);
      } else {
        this.stopMusic();
      }
    } catch {
      /* ignore audio errors */
    }
  }

  dispose(): void {
    this.ambientWanted = false;
    this.musicWanted = false;
    this.stopMusic();
    try {
      const a = this.ambient;
      this.ambient = null;
      if (a) {
        a.stop();
        a.disconnect();
      }
      const air = this.airflow;
      this.airflow = null;
      if (air) {
        air.src.stop();
        air.src.disconnect();
        air.gain.disconnect();
      }
      const c = this.ctx;
      this.ctx = null;
      this.master = null;
      this.white = null;
      this.brown = null;
      if (c) void c.close();
    } catch {
      /* ignore audio errors */
    }
  }

  private startAmbient(ctx: AudioContext, master: GainNode): void {
    if (this.ambient || !this.brown) return;
    const src = ctx.createBufferSource();
    src.buffer = this.brown;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    const g = ctx.createGain();
    g.gain.value = AMBIENT_GAIN;
    src.connect(filter);
    filter.connect(g);
    g.connect(master);
    src.start();
    this.ambient = src;
  }

  private startMusic(ctx: AudioContext, master: GainNode): void {
    if (this.musicNodes) return;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 640;
    filter.Q.value = 0.4;
    gain.connect(filter);
    filter.connect(master);

    const osc: OscillatorNode[] = [];
    const freqs = [110, 164.8, 220];
    for (let i = 0; i < freqs.length; i++) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = freqs[i];
      o.detune.value = (i - 1) * 5 + (Math.random() - 0.5) * 3;
      const og = ctx.createGain();
      og.gain.value = i === 0 ? 0.42 : i === 1 ? 0.26 : 0.18;
      o.connect(og);
      og.connect(gain);
      o.start();
      osc.push(o);
    }

    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 0.06;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.006;
    lfo.connect(lfoGain);
    lfoGain.connect(gain.gain);
    lfo.start();
    osc.push(lfo);

    const filterLfo = ctx.createOscillator();
    filterLfo.type = 'sine';
    filterLfo.frequency.value = 0.11;
    const fGain = ctx.createGain();
    fGain.gain.value = 170;
    filterLfo.connect(fGain);
    fGain.connect(filter.frequency);
    filterLfo.start();
    osc.push(filterLfo);

    const t = ctx.currentTime;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(MUSIC_GAIN, t + 1.4);

    this.musicNodes = { osc, gain, filter };
  }

  private stopMusic(): void {
    const m = this.musicNodes;
    if (!m) return;
    this.musicNodes = null;
    try {
      const t = this.ctx?.currentTime ?? 0;
      m.gain.gain.cancelScheduledValues(t);
      m.gain.gain.setValueAtTime(m.gain.gain.value, t);
      m.gain.gain.linearRampToValueAtTime(0, t + 0.35);
      const osc = m.osc;
      const filter = m.filter;
      const gain = m.gain;
      window.setTimeout(() => {
        for (const o of osc) {
          try {
            o.stop();
          } catch {
            /* ignore */
          }
          o.disconnect();
        }
        filter.disconnect();
        gain.disconnect();
      }, 450);
    } catch {
      /* ignore audio errors */
    }
  }

  private play(run: (ctx: AudioContext, master: GainNode) => void): void {
    if (!this._enabled) return;
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;
    try {
      run(ctx, master);
    } catch {
      /* ignore audio errors */
    }
  }

  private buffer(
    ctx: AudioContext,
    seconds: number,
    fill: (i: number) => number,
  ): AudioBuffer {
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      data[i] = fill(i);
    }
    return buf;
  }
}