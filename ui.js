// ui.js — DOM helpers and binding logic
export class UI {
  constructor(dom) {
    this.dom = dom;
    this.scrubPreview = dom.scrubPreview;
    this.extraButtonsInjected = false;
  }

  injectExtraButtons() {
    if (this.extraButtonsInjected) return;
    const controlsGroup = document.querySelector('.controls');
    if (!controlsGroup) return;
    // shuffle
    const shuffleBtn = document.createElement('button');
    shuffleBtn.className = 'player-button extra shuffle';
    shuffleBtn.title = 'Shuffle';
    shuffleBtn.setAttribute('aria-pressed', 'false');
    shuffleBtn.innerHTML = '🔀';
    controlsGroup.insertBefore(shuffleBtn, controlsGroup.firstChild);
    // repeat
    const repeatBtn = document.createElement('button');
    repeatBtn.className = 'player-button extra repeat';
    repeatBtn.title = 'Repeat (off/one/all)';
    repeatBtn.setAttribute('data-mode', '0');
    repeatBtn.innerHTML = '🔁';
    controlsGroup.appendChild(repeatBtn);
    this.extraButtonsInjected = true;
  }

  attachTrackHandlers(onSelect) {
    const items = Array.from(document.querySelectorAll('.track-item'));
    items.forEach((item, idx) => {
      // copy dataset into attribute if missing
      item.addEventListener('click', (e) => {
        // on long press or secondary click open preview (we use simple modifier)
        const openPreview = e.ctrlKey || e.metaKey;
        onSelect(idx, openPreview);
      });
      item.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') {
          ev.preventDefault();
          onSelect(idx, false);
        }
      });
    });
  }

  openPreview(index, track) {
    const previewPanel = document.getElementById('previewPanel');
    document.getElementById('previewTitle').textContent = track.title;
    document.getElementById('previewArtist').textContent = '0teazy';
    document.getElementById('previewArt').src = document.getElementById('pageArt')?.src || 'CR0WN.jpg';
    const previewAudio = document.getElementById('previewAudio');
    previewAudio.src = track.src;
    previewPanel.style.display = 'flex';
    previewPanel.setAttribute('aria-hidden','false');
    previewAudio.currentTime = 0;
    previewAudio.play().catch(()=>{});
  }

  togglePreviewPlay() {
    const pa = document.getElementById('previewAudio');
    const btn = document.getElementById('previewPlay');
    if (!pa) return;
    if (pa.paused) { pa.play().catch(()=>{}); btn.textContent = 'Pause'; }
    else { pa.pause(); btn.textContent = 'Play'; }
  }

  attachPreviewControls({ openPreview, previewPlayToggle }) {
    document.getElementById('previewPlay').addEventListener('click', previewPlayToggle);
    document.getElementById('previewOpen').addEventListener('click', () => {
      const previewPanel = document.getElementById('previewPanel');
      const src = document.getElementById('previewAudio').src;
      // find index
      const items = Array.from(document.querySelectorAll('.track-item'));
      const idx = items.findIndex(i => decodeURI(i.dataset.src || '') === decodeURI(src || ''));
      if (idx >= 0) openPreview(idx);
      previewPanel.style.display = 'none';
      previewPanel.setAttribute('aria-hidden','true');
    });
    const previewPanel = document.getElementById('previewPanel');
    previewPanel.addEventListener('click', (e) => { if (e.target === previewPanel) { previewPanel.style.display = 'none'; previewPanel.setAttribute('aria-hidden','true'); } });
  }

  attachSeek(rangeEl, onSeekPercent) {
    if (!rangeEl) return;
    // click-to-seek
    const wrapper = rangeEl.parentElement || rangeEl;
    wrapper.addEventListener('click', (ev) => {
      if (ev.target === rangeEl) return;
      const rect = rangeEl.getBoundingClientRect();
      const x = ev.clientX - rect.left;
      const pct = Math.max(0, Math.min(1, x / rect.width));
      rangeEl.value = pct * 100;
      onSeekPercent(pct * 100);
    });
    // drag
    rangeEl.addEventListener('input', (e) => onSeekPercent(Number(rangeEl.value)));
    // scrub preview
    rangeEl.addEventListener('mousemove', (e) => {
      this._showScrub(rangeEl, e.clientX);
    });
    rangeEl.addEventListener('mouseleave', ()=> this._hideScrub());
    // touch
    rangeEl.addEventListener('touchstart', (e) => { if (!e.touches || !e.touches[0]) return; this._showScrub(rangeEl, e.touches[0].clientX); }, { passive:true });
    rangeEl.addEventListener('touchmove', (e) => { if (!e.touches || !e.touches[0]) return; this._showScrub(rangeEl, e.touches[0].clientX); }, { passive:true });
    rangeEl.addEventListener('touchend', ()=> this._hideScrub());
  }

  _showScrub(rangeEl, clientX) {
    if (!this.scrubPreview) return;
    const rect = rangeEl.getBoundingClientRect();
    const pos = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const active = document.querySelector('.track-item.active');
    const duration = active ? Number(active.dataset.duration || 0) : 0;
    // we cannot compute duration without audio; show percent
    const pct = Math.round(pos * 100);
    this.scrubPreview.textContent = `${pct}%`;
    this.scrubPreview.style.left = Math.max(8, Math.min(rect.width - 60, (clientX - rect.left) - 20)) + 'px';
    this.scrubPreview.style.opacity = '1';
    this.scrubPreview.style.transform = 'translateY(0)';
    this.scrubPreview.setAttribute('aria-hidden','false');
  }

  _hideScrub() {
    if (!this.scrubPreview) return;
    this.scrubPreview.style.opacity = '0';
    this.scrubPreview.style.transform = 'translateY(6px)';
    this.scrubPreview.setAttribute('aria-hidden','true');
  }

  updatePlayIcons(play) {
    const playIcon = document.querySelector('#playPauseBtn .icon-play');
    const pauseIcon = document.querySelector('#playPauseBtn .icon-pause');
    const playIconMini = document.querySelector('#playPauseBtnMini .icon-play');
    const pauseIconMini = document.querySelector('#playPauseBtnMini .icon-pause');
    if (playIcon) playIcon.style.display = play ? 'none' : 'block';
    if (pauseIcon) pauseIcon.style.display = play ? 'block' : 'none';
    if (playIconMini) playIconMini.style.display = play ? 'none' : 'block';
    if (pauseIconMini) pauseIconMini.style.display = play ? 'block' : 'none';
  }

  highlightTrack(index = 0) {
    const items = Array.from(document.querySelectorAll('.track-item'));
    items.forEach((el,i) => el.classList.toggle('active', i === index));
  }

  syncSeekbars(current, duration) {
    const pct = duration ? (current / duration) * 100 : 0;
    if (this.dom.seekBar) this.dom.seekBar.value = pct;
    if (this.dom.seekBarMini) this.dom.seekBarMini.value = pct;
    if (this.dom.currentTime) this.dom.currentTime.textContent = UI.formatTime(current);
    if (this.dom.totalTime) this.dom.totalTime.textContent = UI.formatTime(duration);
  }

  attachKeyboardShortcuts({ playPause, next, prev }) {
    window.addEventListener('keydown', (e) => {
      const tag = document.activeElement && document.activeElement.tagName && document.activeElement.tagName.toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;
      if (e.code === 'Space') { e.preventDefault(); playPause(); }
      else if (e.key === 'ArrowRight') next();
      else if (e.key === 'ArrowLeft') prev();
    });
  }

  static formatTime(sec) {
    if (!sec || isNaN(sec) || !isFinite(sec)) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60).toString().padStart(2,'0');
    return `${m}:${s}`;
  }
}
