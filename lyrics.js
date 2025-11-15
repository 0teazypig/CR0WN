// lyrics.js — parse & sync timestamped lyrics
export class Lyrics {
  constructor(containerEl) {
    this.container = containerEl;
    this.parsed = [];
  }

  setRaw(raw) {
    this.parsed = this._parse(raw || '');
    if (!this.parsed.length) {
      this.container.innerHTML = `<strong>Lyrics / Story</strong><p style="margin:8px 0 0 0">No lyrics provided for this track.</p>`;
      return;
    }
    const html = this.parsed.map(l => `<div data-time="${l.time}" class="ly-line">${this._escape(l.text)}</div>`).join('');
    this.container.innerHTML = `<strong>Lyrics</strong><div style="margin-top:8px">${html}</div>`;
  }

  _parse(raw) {
    if (!raw) return [];
    const lines = raw.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    const out = [];
    lines.forEach(line => {
      const matches = [...line.matchAll(/\[(\d{1,2}):(\d{2})\]/g)];
      const text = line.replace(/\[(\d{1,2}):(\d{2})\]/g,'').trim();
      matches.forEach(m => {
        const mm = parseInt(m[1],10), ss = parseInt(m[2],10);
        out.push({ time: mm*60 + ss, text });
      });
    });
    out.sort((a,b) => a.time - b.time);
    return out;
  }

  sync(currentTime) {
    if (!this.parsed.length) return;
    let idx = -1;
    for (let i=0;i<this.parsed.length;i++) {
      if (currentTime >= this.parsed[i].time) idx = i;
      else break;
    }
    if (idx >= 0) {
      const lines = Array.from(this.container.querySelectorAll('.ly-line'));
      lines.forEach(l => l.classList.remove('current-ly'));
      const found = lines.find(l => Number(l.dataset.time) === this.parsed[idx].time);
      if (found) {
        found.classList.add('current-ly');
        found.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }
  }

  _escape(s) { return (s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"}[c])); }
}
