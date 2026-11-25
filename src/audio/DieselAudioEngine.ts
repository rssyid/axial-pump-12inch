/**
 * Procedural Web Audio synthesizer for the Dongfeng ZH1130 single-cylinder
 * 4-stroke diesel engine and 12-inch axial flow water discharge.
 * Lazily initializes on user interaction (muted by default).
 */
export class DieselAudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private dieselOsc: OscillatorNode | null = null;
  private dieselSubOsc: OscillatorNode | null = null;
  private dieselFilter: BiquadFilterNode | null = null;
  private dieselGain: GainNode | null = null;
  private pulseLfo: OscillatorNode | null = null;
  private pulseDepth: GainNode | null = null;
  private mechOsc: OscillatorNode | null = null;
  private mechGain: GainNode | null = null;
  private waterFilter: BiquadFilterNode | null = null;
  private waterGain: GainNode | null = null;
  private muted = true;
  private initialized = false;

  private initContext() {
    if (this.initialized) return;
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    this.ctx = ctx;

    const masterGain = ctx.createGain();
    masterGain.gain.value = 0.0;
    masterGain.connect(ctx.destination);
    this.masterGain = masterGain;

    // 1. Single-cylinder 4-stroke diesel combustion thump
    const dieselOsc = ctx.createOscillator();
    dieselOsc.type = 'sawtooth';
    dieselOsc.frequency.value = 38;

    const dieselSubOsc = ctx.createOscillator();
    dieselSubOsc.type = 'triangle';
    dieselSubOsc.frequency.value = 24;

    const dieselFilter = ctx.createBiquadFilter();
    dieselFilter.type = 'lowpass';
    dieselFilter.frequency.value = 180;
    dieselFilter.Q.value = 3.2;

    const dieselGain = ctx.createGain();
    dieselGain.gain.value = 0.22;

    // Amplitude-modulate the diesel timbre at the exact 4-stroke firing rate (RPM / 120 Hz)
    const pulseLfo = ctx.createOscillator();
    pulseLfo.type = 'sine';
    pulseLfo.frequency.value = 11.6; // 1400 RPM / 120

    const pulseDepth = ctx.createGain();
    pulseDepth.gain.value = 0.14;

    pulseLfo.connect(pulseDepth);
    pulseDepth.connect(dieselGain.gain);

    dieselOsc.connect(dieselFilter);
    dieselSubOsc.connect(dieselFilter);
    dieselFilter.connect(dieselGain);
    dieselGain.connect(masterGain);

    dieselOsc.start();
    dieselSubOsc.start();
    pulseLfo.start();

    this.dieselOsc = dieselOsc;
    this.dieselSubOsc = dieselSubOsc;
    this.dieselFilter = dieselFilter;
    this.dieselGain = dieselGain;
    this.pulseLfo = pulseLfo;
    this.pulseDepth = pulseDepth;

    // 2. Flywheel & V-Belt mechanical whir
    const mechOsc = ctx.createOscillator();
    mechOsc.type = 'sine';
    mechOsc.frequency.value = 120;
    const mechGain = ctx.createGain();
    mechGain.gain.value = 0.03;
    mechOsc.connect(mechGain);
    mechGain.connect(masterGain);
    mechOsc.start();
    this.mechOsc = mechOsc;
    this.mechGain = mechGain;

    // 3. Turbulent 12-inch water discharge roar (looped filtered white noise)
    const bufferSize = ctx.sampleRate * 2;
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const noiseSource = ctx.createBufferSource();
    noiseSource.buffer = noiseBuffer;
    noiseSource.loop = true;

    const waterFilter = ctx.createBiquadFilter();
    waterFilter.type = 'bandpass';
    waterFilter.frequency.value = 620;
    waterFilter.Q.value = 0.75;

    const waterGain = ctx.createGain();
    waterGain.gain.value = 0.0;

    noiseSource.connect(waterFilter);
    waterFilter.connect(waterGain);
    waterGain.connect(masterGain);
    noiseSource.start();

    this.waterFilter = waterFilter;
    this.waterGain = waterGain;
    this.initialized = true;
  }

  public setMuted(muted: boolean) {
    this.muted = muted;
    if (!muted) {
      this.initContext();
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
    }
    if (this.ctx && this.masterGain) {
      const now = this.ctx.currentTime;
      this.masterGain.gain.setTargetAtTime(muted ? 0.0 : 0.42, now, 0.08);
    }
  }

  public update(rpm: number, waterFlowEnabled: boolean) {
    if (!this.initialized || !this.ctx || this.muted) return;
    const now = this.ctx.currentTime;
    const norm = Math.max(0, Math.min(1, rpm / 2200));

    if (rpm < 25) {
      this.dieselGain?.gain.setTargetAtTime(0.0, now, 0.08);
      this.pulseDepth?.gain.setTargetAtTime(0.0, now, 0.08);
      this.mechGain?.gain.setTargetAtTime(0.0, now, 0.08);
      this.waterGain?.gain.setTargetAtTime(0.0, now, 0.08);
      return;
    }

    // 4-stroke single-cylinder firing frequency = RPM / 120
    const firingHz = Math.max(4.0, rpm / 120);
    this.pulseLfo?.frequency.setTargetAtTime(firingHz, now, 0.06);
    this.dieselOsc?.frequency.setTargetAtTime(28 + norm * 52, now, 0.06);
    this.dieselSubOsc?.frequency.setTargetAtTime(16 + norm * 28, now, 0.06);
    this.dieselFilter?.frequency.setTargetAtTime(125 + norm * 280, now, 0.06);

    const dieselVol = 0.14 + norm * 0.22;
    this.dieselGain?.gain.setTargetAtTime(dieselVol, now, 0.08);
    this.pulseDepth?.gain.setTargetAtTime(dieselVol * 0.65, now, 0.08);

    this.mechOsc?.frequency.setTargetAtTime(75 + norm * 170, now, 0.06);
    this.mechGain?.gain.setTargetAtTime(0.012 + norm * 0.035, now, 0.08);

    const flowFactor =
      waterFlowEnabled && rpm > 320
        ? Math.max(0, (rpm - 320) / (2200 - 320))
        : 0;
    this.waterFilter?.frequency.setTargetAtTime(420 + flowFactor * 680, now, 0.08);
    this.waterGain?.gain.setTargetAtTime(flowFactor * 0.24, now, 0.1);
  }

  public dispose() {
    if (this.ctx) {
      this.ctx.close().catch(() => {});
      this.ctx = null;
    }
    this.initialized = false;
  }
}
