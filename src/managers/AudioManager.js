/* managers/AudioManager.js — efectos y música procedurales con WebAudio (sin archivos externos) */
(function (BB) {
  'use strict';

  const NOTE = (m) => 440 * Math.pow(2, (m - 69) / 12);

  // Pistas: bpm, compases de acordes (midi raíz + tipo), patrones de 16 pasos
  const TRACKS = {
    menu: { bpm: 92, chords: [[57, 'm'], [53, 'M'], [60, 'M'], [55, 'M']], kick: 'x.......x.......', snare: '................', hat: '..x...x...x...x.', arp: true, arpDiv: 2, bass: 'x...............', pad: 0.9, lead: 0.5, drive: 0 },
    game: { bpm: 124, chords: [[50, 'm'], [46, 'M'], [53, 'M'], [48, 'M']], kick: 'x...x...x...x...', snare: '....x.......x...', hat: '..x...x...x...xx', arp: true, arpDiv: 1, bass: 'x.xxx.x.x.xxx.x.', pad: 0.5, lead: 0.6, drive: 0.3 },
    boss: { bpm: 138, chords: [[45, 'm'], [45, 'm'], [41, 'M'], [44, 'd']], kick: 'x..xx...x..xx...', snare: '....x.......x..x', hat: 'xxxxxxxxxxxxxxxx', arp: true, arpDiv: 1, bass: 'xxxxxxxxxxxxxxxx', pad: 0.45, lead: 0.7, drive: 0.6 },
    over: { bpm: 70, chords: [[52, 'm'], [48, 'M'], [45, 'm'], [47, 'd']], kick: '................', snare: '................', hat: '................', arp: true, arpDiv: 4, bass: 'x...............', pad: 1, lead: 0.4, drive: 0 },
  };
  const CH = { m: [0, 3, 7, 12], M: [0, 4, 7, 12], d: [0, 3, 6, 9] };

  class AudioManager {
    constructor(game) {
      this.game = game;
      this.ctx = null;
      this.sound = true; this.music = true;
      this.track = null; this.wantTrack = null;
      this.step = 0; this.nextTime = 0;
      this.bossFinal = false;
      this.last = {};
      this.timer = null;
      this.voices = 0;
    }

    unlock() {
      try {
        if (!this.ctx) {
          const AC = window.AudioContext || window.webkitAudioContext;
          if (!AC) return;
          this.ctx = new AC();
          const c = this.ctx;
          this.master = c.createGain(); this.master.gain.value = 0.9;
          this.comp = c.createDynamicsCompressor();
          this.comp.threshold.value = -14; this.comp.ratio.value = 6;
          this.master.connect(this.comp); this.comp.connect(c.destination);
          this.sfxBus = c.createGain(); this.sfxBus.gain.value = this.sound ? 0.8 : 0; this.sfxBus.connect(this.master);
          this.musBus = c.createGain(); this.musBus.gain.value = this.music ? 0.42 : 0; this.musBus.connect(this.master);
          const len = c.sampleRate;
          this.noise = c.createBuffer(1, len, c.sampleRate);
          const d = this.noise.getChannelData(0);
          for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
          // buffer silencioso (desbloqueo iOS)
          const s = c.createBufferSource(); s.buffer = c.createBuffer(1, 1, 22050); s.connect(c.destination); s.start(0);
          this.timer = setInterval(() => this.schedule(), 30);
        }
        if (this.ctx.state === 'suspended') this.ctx.resume();
        if (this.wantTrack && !this.track) this.playMusic(this.wantTrack);
      } catch (e) { BB.reportError('audio-unlock', e); }
    }

    setSound(on) { this.sound = on; if (this.sfxBus) this.sfxBus.gain.value = on ? 0.8 : 0; }
    setMusic(on) { this.music = on; if (this.musBus) this.musBus.gain.setTargetAtTime(on ? 0.42 : 0, this.ctx.currentTime, 0.1); }
    suspend() { try { if (this.ctx && this.ctx.state === 'running') this.ctx.suspend(); } catch (e) { } }
    resume() { try { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); } catch (e) { } }

    playMusic(name) {
      this.wantTrack = name;
      if (!this.ctx) return;
      if (this.track === TRACKS[name]) return;
      this.track = TRACKS[name];
      this.trackName = name;
      this.step = 0;
      this.nextTime = this.ctx.currentTime + 0.08;
      if (name !== 'boss') this.bossFinal = false;
    }
    stopMusic() { this.track = null; this.wantTrack = null; }
    setBossFinal(on) { this.bossFinal = on; }

    schedule() {
      try {
        const c = this.ctx, tr = this.track;
        if (!c || !tr || c.state !== 'running') return;
        if (this.nextTime < c.currentTime - 0.5) this.nextTime = c.currentTime + 0.05;
        const bpm = tr.bpm * (this.bossFinal ? 1.12 : 1);
        const stepDur = 60 / bpm / 4;
        while (this.nextTime < c.currentTime + 0.14) {
          this.playStep(tr, this.step, this.nextTime, stepDur);
          this.nextTime += stepDur;
          this.step = (this.step + 1) % 64;
        }
      } catch (e) { BB.reportError('music', e); }
    }

    playStep(tr, step, t, sd) {
      const s16 = step % 16, bar = Math.floor(step / 16) % tr.chords.length;
      const ch = tr.chords[bar], root = ch[0], iv = CH[ch[1]];
      if (tr.kick[s16] === 'x') this.kick(t);
      if (tr.snare[s16] === 'x') this.snare(t);
      if (tr.hat[s16] === 'x') this.hat(t, s16 % 4 === 2 ? 0.05 : 0.025);
      if (tr.bass[s16] === 'x') this.tone(NOTE(root - 12 + (s16 % 8 === 6 && tr.drive ? 12 : 0)), t, sd * (tr.drive ? 0.9 : 6), 'sawtooth', 0.11, 500 + tr.drive * 900, this.musBus);
      if (s16 === 0 && tr.pad) for (let k = 0; k < 3; k++) this.pad(NOTE(root + 12 + iv[k]), t, sd * 16, 0.035 * tr.pad);
      if (tr.arp && s16 % tr.arpDiv === 0) {
        const idx = Math.floor(s16 / tr.arpDiv) % 4;
        const oct = this.bossFinal ? 36 : 24;
        this.tone(NOTE(root + oct + iv[idx]), t, sd * tr.arpDiv * 0.8, tr.drive > 0.5 ? 'square' : 'triangle', 0.045 * tr.lead, 2600, this.musBus);
      }
      if (this.bossFinal && s16 % 2 === 1) this.tone(NOTE(root + 31 + iv[(s16 >> 1) % 4]), t, sd * 0.7, 'square', 0.02, 3000, this.musBus);
    }

    // ---- instrumentos ----
    env(g, t, a, peak, dur) {
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peak, t + a);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    }
    tone(freq, t, dur, type, vol, cutoff, bus, slideTo) {
      const c = this.ctx;
      const o = c.createOscillator(), g = c.createGain(), f = c.createBiquadFilter();
      o.type = type; o.frequency.setValueAtTime(freq, t);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
      f.type = 'lowpass'; f.frequency.value = cutoff || 4000;
      o.connect(f); f.connect(g); g.connect(bus || this.sfxBus);
      this.env(g, t, 0.005, vol, dur);
      o.start(t); o.stop(t + dur + 0.05);
    }
    pad(freq, t, dur, vol) {
      const c = this.ctx;
      for (const det of [-7, 7]) {
        const o = c.createOscillator(), g = c.createGain(), f = c.createBiquadFilter();
        o.type = 'sawtooth'; o.frequency.value = freq; o.detune.value = det;
        f.type = 'lowpass'; f.frequency.value = 1100;
        o.connect(f); f.connect(g); g.connect(this.musBus);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.3);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.start(t); o.stop(t + dur + 0.05);
      }
    }
    noiseHit(t, dur, vol, type, freq, bus, q) {
      const c = this.ctx;
      const s = c.createBufferSource(), g = c.createGain(), f = c.createBiquadFilter();
      s.buffer = this.noise;
      f.type = type; f.frequency.value = freq; f.Q.value = q || 0.8;
      s.connect(f); f.connect(g); g.connect(bus || this.sfxBus);
      this.env(g, t, 0.003, vol, dur);
      s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
    }
    kick(t) { this.tone(140, t, 0.28, 'sine', 0.5, 800, this.musBus, 42); }
    snare(t) { this.noiseHit(t, 0.16, 0.18, 'bandpass', 1800, this.musBus); this.tone(190, t, 0.1, 'triangle', 0.1, 2000, this.musBus); }
    hat(t, v) { this.noiseHit(t, 0.04, v, 'highpass', 7000, this.musBus); }

    // ---- efectos ----
    sfx(name) {
      if (!this.ctx || !this.sound || this.ctx.state !== 'running') return;
      const now = this.ctx.currentTime;
      const minGap = { shoot: 0.075, hit: 0.045, coin: 0.035, mini: 0.12, explode: 0.04, enemyShoot: 0.08 }[name] || 0.02;
      if (this.last[name] && now - this.last[name] < minGap) return;
      this.last[name] = now;
      const t = now + 0.005;
      try {
        switch (name) {
          case 'shoot': this.tone(880 + Math.random() * 80, t, 0.07, 'square', 0.035, 2400, null, 420); break;
          case 'mini': this.tone(1400, t, 0.05, 'triangle', 0.03, 4000, null, 900); break;
          case 'hit': this.noiseHit(t, 0.05, 0.08, 'bandpass', 2600, null, 2); break;
          case 'explode': this.noiseHit(t, 0.35, 0.3, 'lowpass', 1400); this.tone(120, t, 0.25, 'sine', 0.2, 600, null, 45); break;
          case 'explodeBig': this.noiseHit(t, 0.8, 0.45, 'lowpass', 900); this.tone(90, t, 0.6, 'sine', 0.35, 500, null, 30); break;
          case 'coin': this.tone(1320, t, 0.06, 'square', 0.05, 5000); this.tone(1980, t + 0.05, 0.1, 'square', 0.05, 5000); break;
          case 'boost': [0, 4, 7, 12, 16].forEach((n, i) => this.tone(NOTE(72 + n), t + i * 0.05, 0.12, 'square', 0.06, 4000)); break;
          case 'zap': this.noiseHit(t, 0.25, 0.2, 'highpass', 3000); this.tone(1800, t, 0.2, 'sawtooth', 0.06, 5000, null, 200); break;
          case 'enemyShoot': this.tone(500, t, 0.12, 'sawtooth', 0.04, 1500, null, 220); break;
          case 'alienDie': this.tone(700, t, 0.3, 'square', 0.07, 2500, null, 90); this.noiseHit(t, 0.3, 0.2, 'lowpass', 1600); break;
          case 'dive': this.tone(1200, t, 0.4, 'sawtooth', 0.04, 3000, null, 300); break;
          case 'hurt': this.tone(220, t, 0.35, 'sawtooth', 0.2, 1200, null, 60); this.noiseHit(t, 0.3, 0.3, 'lowpass', 900); break;
          case 'shieldBlock': this.tone(600, t, 0.3, 'sine', 0.2, 3000, null, 1200); break;
          case 'roar': this.tone(70, t, 1.0, 'sawtooth', 0.28, 500, null, 40); this.noiseHit(t, 0.9, 0.25, 'lowpass', 500); break;
          case 'siren': for (let i = 0; i < 3; i++) { this.tone(440, t + i * 0.55, 0.26, 'square', 0.07, 2200, null, 880); this.tone(880, t + i * 0.55 + 0.27, 0.26, 'square', 0.07, 2200, null, 440); } break;
          case 'shockwave': this.tone(160, t, 0.5, 'sine', 0.25, 800, null, 50); break;
          case 'rumble': this.noiseHit(t, 0.7, 0.2, 'lowpass', 300); break;
          case 'missile': this.noiseHit(t, 0.4, 0.14, 'bandpass', 900); break;
          case 'summon': this.tone(300, t, 0.5, 'triangle', 0.12, 2000, null, 900); break;
          case 'warp': this.tone(200, t, 0.9, 'sawtooth', 0.1, 1200, null, 900); break;
          case 'laserCharge': this.tone(300, t, 0.9, 'sawtooth', 0.06, 2000, null, 1600); break;
          case 'laser': this.noiseHit(t, 0.8, 0.25, 'bandpass', 1200); this.tone(110, t, 0.8, 'square', 0.12, 900); break;
          case 'victory': [0, 4, 7, 12, 7, 12, 16, 19].forEach((n, i) => this.tone(NOTE(67 + n), t + i * 0.1, 0.22, 'square', 0.07, 4000)); break;
          case 'levelUp': [0, 7, 12, 16].forEach((n, i) => this.tone(NOTE(72 + n), t + i * 0.09, 0.2, 'triangle', 0.09, 4000)); break;
          case 'gameover': [12, 7, 3, 0, -5].forEach((n, i) => this.tone(NOTE(60 + n), t + i * 0.22, 0.4, 'triangle', 0.1, 2000)); break;
          case 'click': this.tone(1000, t, 0.04, 'square', 0.04, 3000); break;
          case 'buy': this.tone(880, t, 0.08, 'square', 0.06, 4000); this.tone(1320, t + 0.08, 0.14, 'square', 0.06, 4000); break;
          case 'deny': this.tone(200, t, 0.18, 'square', 0.06, 1500); break;
        }
      } catch (e) { BB.reportError('sfx', e); }
    }
  }
  BB.AudioManager = AudioManager;
})(window.BB);
