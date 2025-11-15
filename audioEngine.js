// audioEngine.js — two-slot AudioContext engine with crossfade and analyser
export class AudioEngine {
  constructor(fallbackEl) {
    this.audioContext = null;
    this.analyser = null;
    this.masterGain = null;

    // two media elements
    this.elements = { a: fallbackEl, b: document.createElement('audio') };
    this.elements.b.preload = 'metadata';
    this.elements.b.controlsList = 'nodownload';
    this.elements.b.className = 'hidden';
    document.body.appendChild(this.elements.b);

    this.slot = 'a';
    this.sourceNodes = {};
    this.gainNodes = {};
    this._isPlaying = false;
    this._timeUpdateCb = null;
    this._endedCb = null;
    this._onProgress = null;

    this._initAudioContext();
    this._wireSlots();
    this._attachNativeEvents();
  }

  _initAudioContext() {
    if (this.audioContext) return;
    this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 2048;
    this.masterGain = this.audioContext.createGain();
    this.masterGain.gain.value = 1.0;
    this.masterGain.connect(this.audioContext.destination);
  }

  _wireSlots() {
    ['a','b'].forEach(s => {
      const el = this.elements[s];
      // if previously wired remove etc. (safe to ignore)
      try {
        const src = this.audioContext.createMediaElementSource(el);
        this.sourceNodes[s] = src;
        const g = this.audioContext.createGain();
        g.gain.value = (s === this.slot) ? 1 : 0;
        this.gainNodes[s] = g;
        src.connect(this.analyser);
        this.analyser.connect(g);
        g.connect(this.masterGain);
      } catch (e) {
        // safari may throw if reused; best-effort
      }
    });
  }

  _attachNativeEvents() {
    ['a','b'].forEach(s => {
      const el = this.elements[s];
      el.addEventListener('timeupdate', () => {
        if (this.slot === s && typeof this._timeUpdateCb === 'function') this._timeUpdateCb(el.currentTime, el.duration || 0);
      });
      el.addEventListener('ended', () => {
        if (typeof this._endedCb === 'function') this._endedCb();
      });
    });
  }

  onTimeUpdate(cb) { this._timeUpdateCb = cb; }
  onEnded(cb) { this._endedCb = cb; }

  getActiveElement() { return this.elements[this.slot]; }
  getInactiveElement() { return this.elements[this.slot === 'a' ? 'b' : 'a']; }
  isPlaying() { return this._isPlaying; }
  getCurrentTime() { return this.getActiveElement().currentTime || 0; }

  async load(src, { preserveTime = false, time = 0, crossfade = true } = {}) {
    // ensure context running
    if (this.audioContext.state === 'suspended') await this.audioContext.resume().catch(()=>{});
    const inactive = this.getInactiveElement();
    inactive.src = src;
    inactive.load();
    try { if (preserveTime && time) inactive.currentTime = time; } catch(e) {}
    // if nothing playing or crossfade false, swap immediately
    if (!this._isPlaying || !crossfade) {
      try { this.getActiveElement().pause(); } catch(e) {}
      this._swapSlotsInstant();
      // new slot remains paused; caller chooses play
      return;
    }
    // perform crossfade
    await this._crossfadeToInactive();
  }

  async play() {
    const el = this.getActiveElement();
    if (this.audioContext.state === 'suspended') await this.audioContext.resume().catch(()=>{});
    try { await el.play(); this._isPlaying = true; } catch(e) {
      // play failed (autoplay policy), still mark state false
      this._isPlaying = false;
    }
  }
  pause() {
    try { this.getActiveElement().pause(); } catch(e){}
    this._isPlaying = false;
  }

  seekToPercent(pct) {
    const el = this.getActiveElement();
    if (!el.duration || isNaN(el.duration)) return;
    el.currentTime = el.duration * pct / 100;
  }

  async _crossfadeToInactive(seconds = 1.0) {
    const from = this.slot;
    const to = from === 'a' ? 'b' : 'a';
    const fromGain = this.gainNodes[from];
    const toGain = this.gainNodes[to];
    const fromEl = this.elements[from];
    const toEl = this.elements[to];
    const now = this.audioContext.currentTime;
    try { await toEl.play(); } catch(e){ /* ignore */ }
    toGain.gain.setValueAtTime(0, now);
    fromGain.gain.setValueAtTime(fromGain.gain.value || 1, now);
    toGain.gain.linearRampToValueAtTime(1, now + seconds);
    fromGain.gain.linearRampToValueAtTime(0, now + seconds);
    setTimeout(() => {
      try { fromEl.pause(); } catch(e) {}
      this._swapSlotsInstant();
    }, Math.round(seconds * 1000) + 50);
  }

  _swapSlotsInstant() {
    this.slot = this.slot === 'a' ? 'b' : 'a';
    // ensure gains consistent
    this.gainNodes.a && (this.gainNodes.a.gain.value = this.slot === 'a' ? 1 : 0);
    this.gainNodes.b && (this.gainNodes.b.gain.value = this.slot === 'b' ? 1 : 0);
  }
}
