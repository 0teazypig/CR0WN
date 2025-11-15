// player.js — main coordinator
import { AudioEngine } from './audioEngine.js';
import { Waveform } from './waveform.js';
import { Lyrics } from './lyrics.js';
import { MediaSessionController } from './mediaSession.js';
import { UI } from './ui.js';

const LS_KEY = 'cr0wn_player_state_v1';

// Build references to DOM
const dom = {
  trackList: document.getElementById('trackList'),
  audioFallback: document.getElementById('audioFallback'),
  playPauseBtn: document.getElementById('playPauseBtn'),
  playPauseBtnMini: document.getElementById('playPauseBtnMini'),
  prevBtn: document.getElementById('prevBtn'),
  nextBtn: document.getElementById('nextBtn'),
  prevBtnMini: document.getElementById('prevBtnMini'),
  nextBtnMini: document.getElementById('nextBtnMini'),
  seekBar: document.getElementById('seekBar'),
  seekBarMini: document.getElementById('seekBarMini'),
  currentTime: document.getElementById('currentTime'),
  totalTime: document.getElementById('totalTime'),
  playerTitle: document.getElementById('playerTitle'),
  playerArtist: document.getElementById('playerArtist'),
  playerArt: document.getElementById('playerArt'),
  visualizerRoot: document.getElementById('visualizer'),
  scrubPreview: document.getElementById('scrubPreview'),
  previewPanel: document.getElementById('previewPanel'),
  previewAudio: document.getElementById('previewAudio'),
  previewPlay: document.getElementById('previewPlay'),
  previewOpen: document.getElementById('previewOpen'),
  lyricsToggle: document.getElementById('lyricsToggle'),
  lyricsBox: document.getElementById('lyricsBox'),
  downloadLink: document.getElementById('downloadLink')
};

// Replace with your actual track list — filenames must match disk
const TRACKS = [
  { title: 'Umgane Wami', src: 'Umgane Wami.mp3', lyrics: '[00:00] Intro line for Umgane Wami\n[00:12] First verse line' },
  { title: 'O A Nkata', src: 'O A Nkata.mp3', lyrics: '[00:00] Intro line for O A Nkata' },
  { title: 'Ukahlelani', src: 'Ukahlelani.mp3', lyrics: '[00:00] Intro line for Ukahlelani' },
  { title: 'Peace Release', src: 'Peace Release.mp3', lyrics: '' },
  { title: 'Lerato', src: 'Lerato.mp3', lyrics: '' },
  { title: 'Tshinwe Tshe Ndo Ndi Funa', src: 'Tshinwe Tshe Ndo Ndi Funa.mp3', lyrics: '' },
  { title: 'One Day We Will Be Free', src: 'One Day We Will Be Free.mp3', lyrics: '' }
];

// modules
const audioEngine = new AudioEngine(dom.audioFallback);
const waveform = new Waveform(dom.visualizerRoot, audioEngine.analyser);
const lyrics = new Lyrics(dom.lyricsBox);
const mediaSession = new MediaSessionController();
const ui = new UI(dom);

// render track list
function renderTracks() {
  dom.trackList.innerHTML = TRACKS.map((t, i) => `
    <li class="track-item" data-src="${encodeURI(t.src)}" data-title="${t.title}" data-artist="0teazy" tabindex="0" data-lyrics="${(t.lyrics || '').replace(/\n/g,'\\n')}">
      <span class="track-number">${i+1}</span>
      <span class="track-title">${t.title}</span>
      <span class="track-duration">--:--</span>
    </li>
  `).join('');
}

renderTracks();

// wire UI events
ui.injectExtraButtons();
ui.attachTrackHandlers((index, openPreview) => {
  if (openPreview) {
    ui.openPreview(index, TRACKS[index]);
    return;
  }
  loadTrack(index, { play: true, crossfade: true });
});

// load (and optionally play) track
let currentIndex = 0;
let savedState = (function loadState(){ try { return JSON.parse(localStorage.getItem(LS_KEY) || 'null'); } catch(e){ return null; } })();

if (savedState && typeof savedState.currentIndex === 'number') currentIndex = Math.max(0, Math.min(TRACKS.length -1, savedState.currentIndex));

async function loadTrack(index, opts = { play:false, crossfade:true, preserveTime:false, time:0 }) {
  const track = TRACKS[index];
  if (!track) return;
  // update UI
  ui.highlightTrack(index);
  dom.playerTitle.textContent = track.title;
  dom.playerArtist.textContent = '0teazy';
  dom.playerArt.src = document.getElementById('pageArt')?.src || 'CR0WN.jpg';
  dom.downloadLink.href = track.src;
  dom.downloadLink.download = `${track.title}.mp3`;
  // parse lyrics into module
  lyrics.setRaw(track.lyrics || '');
  // load into engine
  await audioEngine.load(track.src, { preserveTime: opts.preserveTime ? opts.time : 0, crossfade: opts.crossfade });
  waveform.bindToAudio(audioEngine.getActiveElement());
  mediaSession.updateMetadata({ title: track.title, artist: '0teazy', artwork: dom.playerArt.src });
  currentIndex = index;
  persistState();
  if (opts.play) {
    audioEngine.play();
    ui.updatePlayIcons(true);
    waveform.start();
  } else {
    ui.updatePlayIcons(false);
    waveform.drawBaseline();
  }
}

// UI control wiring
dom.playPauseBtn.addEventListener('click', () => {
  if (audioEngine.isPlaying()) { audioEngine.pause(); ui.updatePlayIcons(false); waveform.stop(); }
  else { audioEngine.play(); ui.updatePlayIcons(true); waveform.start(); }
});
dom.playPauseBtnMini.addEventListener('click', () => dom.playPauseBtn.click());
dom.nextBtn.addEventListener('click', ()=> nextTrack());
dom.prevBtn.addEventListener('click', ()=> prevTrack());
dom.nextBtnMini.addEventListener('click', ()=> dom.nextBtn.click());
dom.prevBtnMini.addEventListener('click', ()=> dom.prevBtn.click());

// seekbars
ui.attachSeek(dom.seekBar, (pct) => { audioEngine.seekToPercent(pct); });
ui.attachSeek(dom.seekBarMini, (pct) => { audioEngine.seekToPercent(pct); });

audioEngine.onTimeUpdate((current, duration) => {
  ui.syncSeekbars(current, duration);
  lyrics.sync(current);
});

audioEngine.onEnded(() => {
  // default behavior: if repeat one -> handled in audioEngine; else advance
  nextTrack();
});

function nextTrack() {
  let next = (currentIndex + 1) % TRACKS.length;
  loadTrack(next, { play: true, crossfade: true });
}

function prevTrack() {
  const el = audioEngine.getActiveElement();
  if (el && el.currentTime > 3) { el.currentTime = 0; return; }
  let prev = (currentIndex - 1 + TRACKS.length) % TRACKS.length;
  loadTrack(prev, { play: true, crossfade: true });
}

function persistState() {
  const st = { currentIndex, time: audioEngine.getCurrentTime(), isPlaying: audioEngine.isPlaying() };
  try { localStorage.setItem(LS_KEY, JSON.stringify(st)); } catch(e) {}
}

// restore
(async () => {
  const prev = savedState;
  await loadTrack(currentIndex, { play: !!(prev && prev.isPlaying), crossfade:false, preserveTime: true, time: prev?.time || 0 });
})();

// preview panel wiring
ui.attachPreviewControls({
  openPreview: (index) => ui.openPreview(index, TRACKS[index]),
  previewPlayToggle: () => ui.togglePreviewPlay()
});

// keyboard and gestures
ui.attachKeyboardShortcuts({
  playPause: () => dom.playPauseBtn.click(),
  next: () => dom.nextBtn.click(),
  prev: () => dom.prevBtn.click()
});

// expose for debug
window.__CR0WN = { audioEngine, waveform, lyrics, ui, mediaSession };
