// Particles (smoke, fire, sparks) and synthesized sound effects.
import * as THREE from 'three';

export class Particles {
  constructor(scene, max = 2500) {
    this.max = max;
    this.next = 0;
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.alpha = new Float32Array(max);
    this.size = new Float32Array(max);
    this.life = new Float32Array(max);     // seconds left
    this.span = new Float32Array(max);     // total lifetime
    this.a0 = new Float32Array(max);
    this.grow = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.drag = new Float32Array(max);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.uniforms = { scale: { value: 500 } };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      vertexShader: `
        attribute float size; attribute float alpha; attribute vec3 color;
        uniform float scale; varying vec3 vC; varying float vA;
        void main() {
          vC = color; vA = alpha;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = alpha > 0.0 ? size * scale / -mv.z : 0.0;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        varying vec3 vC; varying float vA;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          if (d > 0.5) discard;
          gl_FragColor = vec4(vC, vA * smoothstep(0.5, 0.15, d));
        }`,
    });
    this.points = new THREE.Points(g, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  // Fit point sizes to the camera: a size-1 particle is 1 meter across.
  resize(heightPx, fovDeg) { this.uniforms.scale.value = heightPx / (2 * Math.tan(fovDeg * Math.PI / 360)); }

  emit(x, y, z, vx, vy, vz, { life = 1, size = 1, grow = 0, color = [1, 1, 1], alpha = 1, grav = 0, drag = 0 } = {}) {
    const i = this.next;
    this.next = (i + 1) % this.max;
    this.pos.set([x, y, z], i * 3);
    this.vel.set([vx, vy, vz], i * 3);
    this.col.set(color, i * 3);
    this.life[i] = this.span[i] = life;
    this.size[i] = size;
    this.alpha[i] = this.a0[i] = alpha;
    this.grow[i] = grow;
    this.grav[i] = grav;
    this.drag[i] = drag;
  }

  update(dt) {
    const { pos, vel, life } = this;
    for (let i = 0; i < this.max; i++) {
      if (life[i] <= 0) continue;
      life[i] -= dt;
      if (life[i] <= 0) { this.alpha[i] = 0; continue; }
      const k = i * 3, d = Math.exp(-this.drag[i] * dt);
      vel[k + 1] -= this.grav[i] * dt;
      vel[k] *= d; vel[k + 1] *= d; vel[k + 2] *= d;
      pos[k] += vel[k] * dt; pos[k + 1] += vel[k + 1] * dt; pos[k + 2] += vel[k + 2] * dt;
      this.size[i] += this.grow[i] * dt;
      this.alpha[i] = this.a0[i] * Math.min(1, life[i] / this.span[i] * 2);
    }
    const a = this.points.geometry.attributes;
    a.position.needsUpdate = a.color.needsUpdate = a.alpha.needsUpdate = a.size.needsUpdate = true;
  }

  // ---------- Presets ----------
  smoke(x, y, z, dark = 0.3, big = 1) {
    const c = 0.25 + (1 - dark) * 0.5;
    this.emit(x, y, z, rnd(1), 1.5 + Math.random() * 1.5, rnd(1),
      { life: 1.4, size: 0.9 * big, grow: 2.2 * big, color: [c, c, c * 1.02], alpha: 0.55, drag: 0.8 });
  }
  fire(x, y, z) {
    this.emit(x, y, z, rnd(0.8), 2 + Math.random() * 2, rnd(0.8),
      { life: 0.45, size: 0.8, grow: -0.8, color: [1, 0.45 + Math.random() * 0.3, 0.1], alpha: 0.95, drag: 1 });
  }
  sparks(x, y, z, n = 12, power = 8) {
    for (let k = 0; k < n; k++) {
      this.emit(x, y, z, rnd(power), Math.random() * power * 0.8, rnd(power),
        { life: 0.3 + Math.random() * 0.3, size: 0.18, color: [1, 0.85, 0.4], grav: 22, drag: 1.5 });
    }
  }
  explosion(x, y, z, big = 1) {
    for (let k = 0; k < 40 * big; k++) {
      const s = 14 * big;
      this.emit(x, y + 0.5, z, rnd(s), Math.random() * s * 0.8, rnd(s),
        { life: 0.5 + Math.random() * 0.5, size: 1.6 * big, grow: 2, color: [1, 0.35 + Math.random() * 0.45, 0.08], alpha: 1, drag: 3.5 });
    }
    for (let k = 0; k < 24 * big; k++) {
      this.emit(x + rnd(1.5), y + 1, z + rnd(1.5), rnd(4), 3 + Math.random() * 5, rnd(4),
        { life: 1.6 + Math.random(), size: 2 * big, grow: 3.5, color: [0.22, 0.2, 0.2], alpha: 0.6, drag: 1.2 });
    }
    this.sparks(x, y + 0.5, z, 30 * big, 18);
  }
  sparkle(x, y, z, color) {
    for (let k = 0; k < 24; k++) {
      this.emit(x + rnd(1.5), y + Math.random() * 1.5, z + rnd(1.5), rnd(1), 2 + Math.random() * 3, rnd(1),
        { life: 0.8, size: 0.35, color, drag: 1 });
    }
  }
}
const rnd = s => (Math.random() * 2 - 1) * s;

// ---------- Sound ----------
// Everything is synthesized, so there are no audio files to load.
export class Sound {
  constructor() {
    this.ctx = null;
    try { this.muted = localStorage.getItem('crash-muted') === '1'; } catch { this.muted = false; }
  }
  // Browsers only allow audio after a user gesture.
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      const ctx = this.ctx = new AudioContext();
      this.master = ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.6;
      this.master.connect(ctx.destination);
      const len = ctx.sampleRate;
      this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      // Engine: a soft low hum (triangle plus a sine an octave down) through a gentle lowpass.
      // Kept quiet and narrow in pitch on purpose; it plays the whole race.
      this.eng = ctx.createGain(); this.eng.gain.value = 0;
      this.engF = ctx.createBiquadFilter(); this.engF.type = 'lowpass'; this.engF.frequency.value = 300; this.engF.Q.value = 0.5;
      this.oscs = [['triangle', 1], ['sine', 0.5]].map(([type, mul]) => {
        const o = ctx.createOscillator(); o.type = type; o.frequency.value = 50;
        o.connect(this.engF); o.start(); return { o, mul };
      });
      this.engF.connect(this.eng).connect(this.master);
    } catch { this.ctx = null; }
  }
  setMuted(m) {
    this.muted = m;
    try { localStorage.setItem('crash-muted', m ? '1' : '0'); } catch { }
    if (this.master) this.master.gain.value = m ? 0 : 0.6;
  }
  // pitch scales the whole range: heavy vehicles hum lower, light ones higher.
  engine(speedFrac, on, boost, pitch = 1) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, s = Math.min(1, speedFrac);
    const f = (55 + s * 55 + (boost ? 12 : 0)) * pitch;
    for (const { o, mul } of this.oscs) o.frequency.setTargetAtTime(f * mul, t, 0.25);
    this.engF.frequency.setTargetAtTime(220 + s * 380, t, 0.3);
    this.eng.gain.setTargetAtTime(on ? 0.035 + s * 0.035 : 0, t, 0.3);
  }
  noise(dur, freq, vol, type = 'lowpass', sweep = 0) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t);
    if (sweep) f.frequency.exponentialRampToValueAtTime(sweep, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random() * 0.5); src.stop(t + dur);
  }
  tone(freq, dur, vol = 0.15, type = 'square', at = 0, slide = 0) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime + at;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  }
  crash(power) { this.noise(0.25, 900, Math.min(0.5, 0.08 + power * 0.02), 'bandpass'); this.tone(90, 0.15, 0.12, 'triangle'); }
  boom(near = 1) { this.noise(1.1, 1200, 0.7 * near, 'lowpass', 80); this.tone(70, 0.6, 0.3 * near, 'sine', 0, 30); }
  launch() { this.noise(0.5, 400, 0.25, 'bandpass', 3000); }
  pickup() { [660, 880, 1320].forEach((f, k) => this.tone(f, 0.12, 0.08, 'square', k * 0.06)); }
  beep(high) { this.tone(high ? 880 : 440, high ? 0.5 : 0.22, 0.14, 'square'); }
  zap() { this.tone(300, 0.4, 0.12, 'sawtooth', 0, 1200); }
  heal() { [523, 659, 784].forEach((f, k) => this.tone(f, 0.18, 0.08, 'triangle', k * 0.07)); }
  whoosh() { this.noise(0.6, 300, 0.3, 'bandpass', 2000); }
}
