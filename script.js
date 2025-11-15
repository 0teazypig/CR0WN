/* script.js — player with waveform, scrub preview, preview panel, lyrics sync, shuffle/repeat, crossfade, persistence */

(() => {
  // CONFIG
  const CROSSFADE_SECONDS = 1.0;
  const PREVIEW_DURATION_MS = 12000;
  const WAVEFORM_FPS = 60;
  const LS_KEY = "cr0wn_player_state_v1";

  // SELECTORS
  const trackItems = Array.from(document.querySelectorAll(".track-item"));
  const audioFallback = document.getElementById("audioFallback");
  const playerArt = document.getElementById("playerArt");
  const playerTitle = document.getElementById("playerTitle");
  const playerArtist = document.getElementById("playerArtist");
  const playerTitleMini = document.getElementById("playerTitleMini");
  const playerArtistMini = document.getElementById("playerArtistMini");
  const playerArtMini = document.getElementById("playerArtMini");
  const playPauseBtn = document.getElementById("playPauseBtn");
  const playPauseBtnMini = document.getElementById("playPauseBtnMini");
  const prevBtn = document.getElementById("prevBtn");
  const nextBtn = document.getElementById("nextBtn");
  const prevBtnMini = document.getElementById("prevBtnMini");
  const nextBtnMini = document.getElementById("nextBtnMini");
  const seekBar = document.getElementById("seekBar");
  const seekBarMini = document.getElementById("seekBarMini");
  const currentTimeEl = document.getElementById("currentTime");
  const totalTimeEl = document.getElementById("totalTime");
  const currentTimeMini = document.getElementById("currentTimeMini");
  const totalTimeMini = document.getElementById("totalTimeMini");
  const lyricsToggle = document.getElementById("lyricsToggle");
  const lyricsBox = document.getElementById("lyricsBox");
  const downloadLink = document.getElementById("downloadLink");
  const visualizerRoot = document.getElementById("visualizer");
  const scrubPreview = document.getElementById("scrubPreview");

  // preview panel elements
  const previewPanel = document.getElementById("previewPanel");
  const previewAudio = document.getElementById("previewAudio");
  const previewArt = document.getElementById("previewArt");
  const previewTitle = document.getElementById("previewTitle");
  const previewArtist = document.getElementById("previewArtist");
  const previewPlay = document.getElementById("previewPlay");
  const previewOpen = document.getElementById("previewOpen");

  // internal state
  let currentIndex = 0;
  let audioContext = null;
  let analyser = null;
  let waveformCanvas = null;
  let waveformCtx = null;
  let audioElements = { a: null, b: null };
  let gainNodes = { a: null, b: null };
  let sourceNodes = { a: null, b: null };
  let masterGain = null;
  let activeSlot = "a";
  let isPlaying = false;
  let rafId = null;
  let lastDrawTime = 0;
  let shuffleMode = false;
  let repeatMode = 0; // 0 off, 1 one, 2 all
  let syncedLyrics = [];
  let previewTimeout = null;
  let clickedPreviewIndex = null;

  // create UI extras (shuffle/repeat + waveform canvas + buffer indicator)
  function injectUI() {
    const controlsGroup = document.querySelector(".controls");
    if (!controlsGroup) return;

    // shuffle
    const shuffleBtn = document.createElement("button");
    shuffleBtn.className = "player-button extra shuffle";
    shuffleBtn.title = "Shuffle";
    shuffleBtn.setAttribute("aria-pressed", "false");
    shuffleBtn.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M16 3h5v5"></path></svg>`;
    controlsGroup.insertBefore(shuffleBtn, controlsGroup.firstChild);

    // repeat
    const repeatBtn = document.createElement("button");
    repeatBtn.className = "player-button extra repeat";
    repeatBtn.title = "Repeat (off / one / all)";
    repeatBtn.setAttribute("data-mode", "0");
    repeatBtn.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M7 7V3l-4 4 4 4V8h11v8h-2v3h5V7z"></path></svg>`;
    controlsGroup.appendChild(repeatBtn);

    // buffering indicator
    const playerCard = document.querySelector(".player-card");
    if (playerCard) {
      const bufferEl = document.createElement("div");
      bufferEl.className = "buffering-indicator";
      bufferEl.style.display = "none";
      bufferEl.innerHTML = `<div class="loader" aria-hidden="true"></div><span class="buffer-text" style="margin-left:8px;font-size:12px;color:var(--muted)">Buffering…</span>`;
      bufferEl.style.alignItems = "center";
      bufferEl.style.marginLeft = "8px";
      playerCard.querySelector(".player-top").appendChild(bufferEl);
    }

    // waveform canvas
    waveformCanvas = document.createElement("canvas");
    waveformCanvas.id = "waveformCanvas";
    waveformCanvas.style.width = "100%";
    waveformCanvas.style.height = "64px";
    if (visualizerRoot) {
      visualizerRoot.innerHTML = "";
      visualizerRoot.appendChild(waveformCanvas);
    } else {
      const playerTop = document.querySelector(".player-card .player-top");
      if (playerTop) playerTop.appendChild(waveformCanvas);
    }

    // inject minimal style for spinner animation handled in CSS (already included)
  }

  // audio context and nodes
  function ensureAudioContext() {
    if (audioContext) return;
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048;
    masterGain = audioContext.createGain();
    masterGain.gain.value = 1.0;
    masterGain.connect(audioContext.destination);
  }

  function setupAudioSlots() {
    ensureAudioContext();
    // slot a uses existing audioFallback
    audioElements.a = audioFallback;
    audioElements.b = document.createElement("audio");
    audioElements.b.preload = "metadata";
    audioElements.b.controlsList = "nodownload";
    audioElements.b.className = "hidden";
    document.body.appendChild(audioElements.b);

    Object.keys(audioElements).forEach(slot => {
      const el = audioElements[slot];
      sourceNodes[slot] = audioContext.createMediaElementSource(el);
      gainNodes[slot] = audioContext.createGain();
      gainNodes[slot].gain.value = slot === activeSlot ? 1 : 0;
      // connect: source -> analyser -> slotGain -> masterGain
      sourceNodes[slot].connect(analyser);
      analyser.connect(gainNodes[slot]);
      gainNodes[slot].connect(masterGain);
    });
  }

  // utility
  function formatTime(sec) {
    if (!sec || isNaN(sec) || !isFinite(sec)) return "0:00";
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  }

  function saveState() {
    const st = { currentIndex, time: getActiveAudio().currentTime || 0, isPlaying, shuffleMode, repeatMode };
    try { localStorage.setItem(LS_KEY, JSON.stringify(st)); } catch (e) {}
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) { return null; }
  }

  // get active/inactive audio
  function getActiveAudio() { return audioElements[activeSlot]; }
  function getInactiveAudio() { return audioElements[activeSlot === "a" ? "b" : "a"]; }
  function swapActiveSlot() { activeSlot = activeSlot === "a" ? "b" : "a"; }

  // highlight
  function highlightTrack(index = currentIndex) {
    trackItems.forEach((el, i) => el.classList.toggle("active", i === index));
  }

  // load track into inactive slot; optionally play with crossfade
  function loadTrack(index, { play = false, crossfade = true, preserveTime = false, time = 0 } = {}) {
    if (index < 0 || index >= trackItems.length) return;
    const item = trackItems[index];
    const src = item.dataset.src;
    const title = item.dataset.title || "—";
    const artist = item.dataset.artist || "—";
    const lyricsRaw = item.dataset.lyrics || "";

    const inactive = getInactiveAudio();
    inactive.src = src;
    inactive.load();
    if (preserveTime && time) {
      try { inactive.currentTime = time; } catch (e) {}
    }

    // update UI
    playerTitle.textContent = title;
    playerArtist.textContent = artist;
    playerTitleMini.textContent = title;
    playerArtistMini.textContent = artist;
    playerArt.src = playerArtMini.src = (document.getElementById("pageArt")?.src || "CR0WN.jpg");
    downloadLink.href = src;
    downloadLink.download = `${title}.mp3`;

    // parse lyrics for sync
    syncedLyrics = parseTimestampedLyrics(lyricsRaw);
    if (!syncedLyrics.length) {
      // show static lyrics if present
      lyricsBox.innerHTML = `<strong>Lyrics / Story</strong><p style="margin:8px 0 0 0">${lyricsRaw || "No lyrics provided for this track."}</p>`;
    } else {
      // build list view in lyricsBox
      const listHtml = syncedLyrics.map(l => `<div data-time="${l.time}" class="ly-line">${escapeHtml(l.text)}</div>`).join("");
      lyricsBox.innerHTML = `<strong>Lyrics</strong><div style="margin-top:8px">${listHtml}</div>`;
    }

    highlightTrack(index);
    currentIndex = index;

    if (isPlaying && crossfade) {
      crossfadeToInactiveAndPlay();
    } else {
      // immediate swap
      try { getActiveAudio().pause(); } catch (e) {}
      swapActiveSlot();
      // set gains
      gainNodes.a.gain.value = activeSlot === "a" ? 1 : 0;
      gainNodes.b.gain.value = activeSlot === "b" ? 1 : 0;
      if (play) {
        try { getActiveAudio().play(); isPlaying = true; updatePlayIcons(true); } catch (e) {}
      }
    }
    saveState();
  }

  // crossfade function
  function crossfadeToInactiveAndPlay() {
    const from = activeSlot;
    const to = from === "a" ? "b" : "a";
    const fromGain = gainNodes[from];
    const toGain = gainNodes[to];
    const toAudio = audioElements[to];
    const fromAudio = audioElements[from];
    const now = audioContext.currentTime;
    if (audioContext.state === "suspended") audioContext.resume().catch(()=>{});

    toGain.gain.setValueAtTime(0, now);
    fromGain.gain.setValueAtTime(fromGain.gain.value, now);

    toAudio.play().catch(()=>{});
    toGain.gain.linearRampToValueAtTime(1, now + CROSSFADE_SECONDS);
    fromGain.gain.linearRampToValueAtTime(0, now + CROSSFADE_SECONDS);

    setTimeout(() => {
      try { fromAudio.pause(); } catch (e) {}
      swapActiveSlot();
      gainNodes.a.gain.value = activeSlot === "a" ? 1 : 0;
      gainNodes.b.gain.value = activeSlot === "b" ? 1 : 0;
      updatePlayIcons(true);
      saveState();
    }, Math.round(CROSSFADE_SECONDS * 1000) + 80);
  }

  // play/pause
  function playActive() {
    const el = getActiveAudio();
    ensureAudioContext();
    if (audioContext.state === "suspended") audioContext.resume().catch(()=>{});
    el.play().then(() => {
      isPlaying = true;
      updatePlayIcons(true);
      startRenderLoop();
      saveState();
    }).catch(()=>{});
  }
  function pauseActive() {
    try { getActiveAudio().pause(); } catch (e) {}
    isPlaying = false;
    updatePlayIcons(false);
    stopRenderLoop();
    saveState();
  }
  function togglePlay() { if (isPlaying) pauseActive(); else playActive(); }

  function updatePlayIcons(play) {
    const playIcon = playPauseBtn.querySelector(".icon-play");
    const pauseIcon = playPauseBtn.querySelector(".icon-pause");
    const playIconMini = playPauseBtnMini.querySelector(".icon-play");
    const pauseIconMini = playPauseBtnMini.querySelector(".icon-pause");
    if (playIcon) playIcon.style.display = play ? "none" : "block";
    if (pauseIcon) pauseIcon.style.display = play ? "block" : "none";
    if (playIconMini) playIconMini.style.display = play ? "none" : "block";
    if (pauseIconMini) pauseIconMini.style.display = play ? "block" : "none";
  }

  // next / prev (shuffle & repeat aware)
  function playNext() {
    if (shuffleMode) {
      const other = trackItems.length === 1 ? 0 : (() => { let i = currentIndex; while (i === currentIndex) i = Math.floor(Math.random() * trackItems.length); return i; })();
      loadTrack(other, { play: true, crossfade: true });
      return;
    }
    let next = (currentIndex + 1) % trackItems.length;
    if (next === 0 && repeatMode === 0) { pauseActive(); return; }
    loadTrack(next, { play: true, crossfade: true });
  }
  function playPrev() {
    const el = getActiveAudio();
    if (el && el.currentTime > 3) { el.currentTime = 0; return; }
    let prev = shuffleMode ? Math.floor(Math.random() * trackItems.length) : (currentIndex - 1 + trackItems.length) % trackItems.length;
    loadTrack(prev, { play: true, crossfade: true });
  }

  // seek UI
  function syncSeekbars() {
    const el = getActiveAudio();
    const pct = el.duration ? (el.currentTime / el.duration) * 100 : 0;
    seekBar.value = pct;
    seekBarMini.value = pct;
    currentTimeEl.textContent = formatTime(el.currentTime);
    totalTimeEl.textContent = formatTime(el.duration);
    currentTimeMini.textContent = formatTime(el.currentTime);
    totalTimeMini.textContent = formatTime(el.duration);
    // lyrics sync update
    if (syncedLyrics.length) {
      updateSyncedLyrics(el.currentTime);
    }
  }

  function seekFromRange(value) {
    const el = getActiveAudio();
    if (!el.duration || isNaN(el.duration)) return;
    const time = (value / 100) * el.duration;
    el.currentTime = time;
    syncSeekbars();
  }

  function attachClickToSeek(rangeEl) {
    const wrapper = rangeEl.parentElement;
    if (!wrapper) return;
    wrapper.addEventListener("click", (ev) => {
      if (ev.target === rangeEl) return;
      const rect = rangeEl.getBoundingClientRect();
      const x = ev.clientX - rect.left;
      const pct = Math.max(0, Math.min(1, x / rect.width));
      rangeEl.value = pct * 100;
      seekFromRange(rangeEl.value);
    });
  }

  // buffering indicator
  function showBuffering(show = true) {
    const indicator = document.querySelector(".buffering-indicator");
    if (indicator) indicator.style.display = show ? "flex" : "none";
  }

  // waveform
  function initWaveform() {
    if (!analyser || !waveformCanvas) return;
    waveformCtx = waveformCanvas.getContext("2d");
    function resize() {
      const dpr = window.devicePixelRatio || 1;
      const w = waveformCanvas.clientWidth;
      const h = waveformCanvas.clientHeight;
      waveformCanvas.width = Math.max(256, Math.floor(w * dpr));
      waveformCanvas.height = Math.max(64, Math.floor(h * dpr));
      waveformCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    window.addEventListener("resize", resize);
  }

  function drawWaveform(ts) {
    if (!waveformCtx || !analyser) return;
    if (ts - lastDrawTime < (1000 / WAVEFORM_FPS)) { rafId = requestAnimationFrame(drawWaveform); return; }
    lastDrawTime = ts;
    const width = waveformCanvas.clientWidth;
    const height = waveformCanvas.clientHeight;
    waveformCtx.clearRect(0, 0, width, height);

    const bufLen = analyser.fftSize;
    const data = new Uint8Array(bufLen);
    analyser.getByteTimeDomainData(data);

    waveformCtx.lineWidth = 1.6;
    waveformCtx.beginPath();
    const sliceW = width / bufLen;
    let x = 0;
    for (let i = 0; i < bufLen; i++) {
      const v = (data[i] - 128) / 128;
      const y = (height / 2) + v * (height / 2) * 0.9;
      if (i === 0) waveformCtx.moveTo(x, y); else waveformCtx.lineTo(x, y);
      x += sliceW;
    }
    waveformCtx.strokeStyle = getComputedStyle(document.body).color || "#fff";
    waveformCtx.stroke();
    rafId = requestAnimationFrame(drawWaveform);
  }

  function startRenderLoop() { if (!rafId) rafId = requestAnimationFrame(drawWaveform); }
  function stopRenderLoop() { if (rafId) { cancelAnimationFrame(rafId); rafId = null; } }

  // scrub preview (desktop + touch)
  function attachScrubPreview(rangeEl) {
    function showAt(clientX) {
      if (!scrubPreview) return;
      const rect = rangeEl.getBoundingClientRect();
      const pos = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const el = getActiveAudio();
      const duration = el.duration || 0;
      const t = duration * pos;
      scrubPreview.textContent = formatTime(t);
      scrubPreview.style.left = Math.max(8, Math.min(rect.width - 60, (clientX - rect.left) - 20)) + "px";
      scrubPreview.style.opacity = "1";
      scrubPreview.style.transform = "translateY(0)";
      scrubPreview.setAttribute("aria-hidden", "false");
    }
    function hide() {
      if (!scrubPreview) return;
      scrubPreview.style.opacity = "0";
      scrubPreview.style.transform = "translateY(6px)";
      scrubPreview.setAttribute("aria-hidden", "true");
    }

    rangeEl.addEventListener("mousemove", (e) => showAt(e.clientX));
    rangeEl.addEventListener("mouseleave", hide);

    // touch: show while dragging
    rangeEl.addEventListener("touchstart", (e) => {
      if (!e.touches || !e.touches[0]) return;
      showAt(e.touches[0].clientX);
    }, { passive: true });
    rangeEl.addEventListener("touchmove", (e) => {
      if (!e.touches || !e.touches[0]) return;
      showAt(e.touches[0].clientX);
    }, { passive: true });
    rangeEl.addEventListener("touchend", hide);
  }

  // parse timestamped lyrics: format [MM:SS] line
  function parseTimestampedLyrics(raw) {
    if (!raw) return [];
    // normalize separators
    const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const parsed = [];
    for (const l of lines) {
      // allow multiple timestamps per line: [mm:ss][mm:ss] text
      const matches = [...l.matchAll(/\[(\d{1,2}):(\d{2})\]/g)];
      const text = l.replace(/\[(\d{1,2}):(\d{2})\]/g, "").trim();
      for (const m of matches) {
        const t = parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
        parsed.push({ time: t, text });
      }
    }
    // sort by time asc
    parsed.sort((a,b) => a.time - b.time);
    return parsed;
  }

  function updateSyncedLyrics(currentTime) {
    if (!syncedLyrics.length) return;
    // find last line <= currentTime
    let idx = -1;
    for (let i = 0; i < syncedLyrics.length; i++) {
      if (currentTime >= syncedLyrics[i].time) idx = i;
      else break;
    }
    if (idx >= 0) {
      // highlight in lyricsBox
      const lines = Array.from(lyricsBox.querySelectorAll(".ly-line"));
      lines.forEach(l => l.classList.remove("current-ly"));
      const found = lines.find(l => parseFloat(l.dataset.time || "0") === syncedLyrics[idx].time);
      if (found) {
        found.classList.add("current-ly");
        // ensure visible by scrolling if needed
        found.scrollIntoView({ block: "nearest", behavior: "smooth" });
      } else {
        lyricsBox.querySelector("p") && (lyricsBox.querySelector("p").textContent = syncedLyrics[idx].text);
      }
    }
  }

  function escapeHtml(s){ return (s||"").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"})[c]); }

  // preview panel behavior
  function openPreviewForIndex(index) {
    if (index < 0 || index >= trackItems.length) return;
    clickedPreviewIndex = index;
    const item = trackItems[index];
    const src = item.dataset.src;
    const title = item.dataset.title || "—";
    const artist = item.dataset.artist || "—";
    previewTitle.textContent = title;
    previewArtist.textContent = artist;
    previewArt.src = (document.getElementById("pageArt")?.src || "CR0WN.jpg");
    previewAudio.src = src;
    previewPanel.style.display = "flex";
    previewPanel.setAttribute("aria-hidden", "false");
    previewAudio.currentTime = 0;
    previewAudio.play().catch(()=>{});
    previewPlay.textContent = "Pause";
    // stop previous timeout
    if (previewTimeout) clearTimeout(previewTimeout);
    previewTimeout = setTimeout(() => {
      try { previewAudio.pause(); previewPlay.textContent = "Play"; } catch(e){}
    }, PREVIEW_DURATION_MS);
  }
  function closePreview() {
    previewPanel.style.display = "none";
    previewPanel.setAttribute("aria-hidden", "true");
    try { previewAudio.pause(); } catch(e){}
    if (previewTimeout) { clearTimeout(previewTimeout); previewTimeout = null; }
    clickedPreviewIndex = null;
  }

  // attach events
  function attachEventHandlers() {
    // track click -> open preview (mobile friendly)
    trackItems.forEach((item, idx) => {
      item.addEventListener("click", (e) => {
        e.preventDefault();
        openPreviewForIndex(idx);
      });
      // keyboard enter playable: open preview
      item.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter" || ev.key === " ") {
          ev.preventDefault();
          openPreviewForIndex(idx);
        }
      });
    });

    // preview controls
    previewPlay.addEventListener("click", () => {
      if (previewAudio.paused) { previewAudio.play(); previewPlay.textContent = "Pause"; }
      else { previewAudio.pause(); previewPlay.textContent = "Play"; }
    });
    previewOpen.addEventListener("click", () => {
      // load clicked track into main player and play
      if (typeof clickedPreviewIndex === "number") {
        loadTrack(clickedPreviewIndex, { play: true, crossfade: false });
        closePreview();
      }
    });
    previewPanel.addEventListener("click", (e) => {
      if (e.target === previewPanel) closePreview();
    });

    // main player controls
    playPauseBtn.addEventListener("click", togglePlay);
    playPauseBtnMini.addEventListener("click", togglePlay);
    prevBtn.addEventListener("click", playPrev);
    nextBtn.addEventListener("click", playNext);
    prevBtnMini.addEventListener("click", playPrev);
    nextBtnMini.addEventListener("click", playNext);

    // seekbars
    seekBar.addEventListener("input", () => { seekFromRange(seekBar.value); saveState(); });
    seekBarMini.addEventListener("input", () => { seekFromRange(seekBarMini.value); saveState(); });
    attachClickToSeek(seekBar);
    attachClickToSeek(seekBarMini);
    attachScrubPreview(seekBar);

    // lyrics toggle
    lyricsToggle.addEventListener("click", () => {
      const open = lyricsBox.style.display === "block";
      lyricsBox.style.display = open ? "none" : "block";
      lyricsToggle.setAttribute("aria-expanded", (!open).toString());
    });

    // shuffle/repeat via delegated click
    document.addEventListener("click", (ev) => {
      const el = ev.target.closest(".player-button.extra");
      if (!el) return;
      if (el.classList.contains("shuffle")) {
        shuffleMode = !shuffleMode;
        el.setAttribute("aria-pressed", String(shuffleMode));
        el.style.opacity = shuffleMode ? "1" : "0.6";
        saveState();
      } else if (el.classList.contains("repeat")) {
        repeatMode = (repeatMode + 1) % 3;
        el.setAttribute("data-mode", String(repeatMode));
        el.style.opacity = repeatMode === 0 ? "0.6" : "1";
        el.title = repeatMode === 0 ? "Repeat off" : (repeatMode === 1 ? "Repeat one" : "Repeat all");
        if (repeatMode === 1) getActiveAudio().loop = true; else getActiveAudio().loop = false;
        saveState();
      }
    });

    // audio events for each slot
    Object.keys(audioElements).forEach(slot => {
      const el = audioElements[slot];
      if (!el) return;
      el.addEventListener("timeupdate", () => { if (activeSlot === slot) syncSeekbars(); });
      el.addEventListener("ended", () => {
        if (repeatMode === 1) { el.currentTime = 0; el.play(); }
        else playNext();
      });
      el.addEventListener("waiting", () => showBuffering(true));
      el.addEventListener("playing", () => showBuffering(false));
      el.addEventListener("canplay", () => showBuffering(false));
      el.addEventListener("loadstart", () => showBuffering(true));
      el.addEventListener("progress", () => showBuffering(false));
      el.addEventListener("loadedmetadata", () => { if (activeSlot === slot) syncSeekbars(); });
    });

    // keyboard shortcuts
    window.addEventListener("keydown", (e) => {
      const tag = document.activeElement && document.activeElement.tagName && document.activeElement.tagName.toLowerCase();
      if (tag === "input" || tag === "textarea") return;
      if (e.code === "Space") { e.preventDefault(); togglePlay(); }
      else if (e.key === "ArrowRight") playNext();
      else if (e.key === "ArrowLeft") playPrev();
    });

    window.addEventListener("beforeunload", saveState);

    // mobile gestures (basic)
    const area = document.querySelector(".player-card") || document.body;
    let startX = 0, startY = 0, startT = 0;
    area.addEventListener("touchstart", (e) => {
      if (!e.touches || !e.touches[0]) return;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      startT = Date.now();
    }, { passive: true });
    area.addEventListener("touchend", (e) => {
      if (!e.changedTouches || !e.changedTouches[0]) return;
      const dx = e.changedTouches[0].clientX - startX;
      const dy = e.changedTouches[0].clientY - startY;
      const dt = Date.now() - startT;
      if (Math.abs(dx) > 60 && Math.abs(dy) < 80 && dt < 700) {
        if (dx < 0) playNext(); else playPrev();
      } else if (Math.abs(dx) < 10 && Math.abs(dy) < 10 && dt < 300) {
        togglePlay();
      }
    }, { passive: true });
  }

  // initialization
  function init() {
    injectUI();
    ensureAudioContext();
    setupAudioSlots();

    // load persisted state
    const prev = loadState();
    if (prev && typeof prev.currentIndex === "number") currentIndex = Math.max(0, Math.min(trackItems.length - 1, prev.currentIndex));
    if (prev) { shuffleMode = !!prev.shuffleMode; repeatMode = prev.repeatMode || 0; }

    // attach handlers after audio elements exist
    attachEventHandlers();

    // initialize waveform ctx
    if (waveformCanvas) initWaveform();

    // load initial track into inactive slot (preserve time if exists)
    const restoreTime = prev && prev.time ? prev.time : 0;
    loadTrack(currentIndex, { play: !!(prev && prev.isPlaying), crossfade: false, preserveTime: true, time: restoreTime });

    // update shuffle/repeat UI states
    const shuffleBtn = document.querySelector(".player-button.extra.shuffle");
    const repeatBtn = document.querySelector(".player-button.extra.repeat");
    if (shuffleBtn) { shuffleBtn.setAttribute("aria-pressed", String(shuffleMode)); shuffleBtn.style.opacity = shuffleMode ? "1" : "0.6"; }
    if (repeatBtn) { repeatBtn.setAttribute("data-mode", String(repeatMode)); repeatBtn.style.opacity = repeatMode === 0 ? "0.6" : "1"; }

    // show static waveform baseline
    if (waveformCanvas) drawWaveform(0);
  }

  // start
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();

})();
