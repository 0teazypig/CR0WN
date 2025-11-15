// waveform.js — responsive canvas waveform renderer
export class Waveform {
  constructor(rootEl, analyser) {
    this.rootEl = rootEl;
    this.analyser = analyser;
    this.canvas = document.createElement('canvas');
    this.canvas.id = 'waveformCanvas';
    this.canvas.style.width = '100%';
    this.canvas.style.height = '80px';
    this.rootEl.innerHTML = '';
    this.rootEl.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d');
    this.raf = null;
    this.buf = new Uint8Array(2048);
    this.boundEl = null;

    this._resize();
    window.addEventListener('resize', () => this._resize());
    this.drawBaseline();
  }

  bindToAudio(audioEl) {
    this.boundEl = audioEl;
  }

  _resize() {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = Math.max(256, Math.floor(rect.width * dpr));
    this.canvas.height = Math.max(64, Math.floor(rect.height * dpr));
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  drawBaseline() {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    this.ctx.clearRect(0,0,w,h);
    this.ctx.fillStyle = 'rgba(255,255,255,0.03)';
    this.ctx.fillRect(0,0,w,h);
    // thin middle line
    this.ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();
    this.ctx.moveTo(0, h/2);
    this.ctx.lineTo(w, h/2);
    this.ctx.stroke();
  }

  start() {
    if (!this.analyser) return;
    if (this.raf) return;
    const draw = () => {
      this.analyser.getByteTimeDomainData(this.buf);
      this._render(this.buf);
      this.raf = requestAnimationFrame(draw);
    };
    this.raf = requestAnimationFrame(draw);
  }

  stop() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = null;
  }

  _render(data) {
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    this.ctx.clearRect(0,0,width,height);
    this.ctx.lineWidth = 1.6;
    this.ctx.beginPath();
    const slice = width / data.length;
    let x = 0;
    for (let i=0;i<data.length;i++) {
      const v = (data[i] - 128) / 128;
      const y = (height/2) + v * (height/2) * 0.9;
      if (i === 0) this.ctx.moveTo(x, y); else this.ctx.lineTo(x, y);
      x += slice;
    }
    this.ctx.strokeStyle = getComputedStyle(document.body).color || '#fff';
    this.ctx.stroke();
  }
}
