// mediaSession.js — centralised Media Session helper
export class MediaSessionController {
  constructor() {
    this.meta = null;
    if ('mediaSession' in navigator) {
      // default handlers; app wires specific functions by overriding setActionHandler
      navigator.mediaSession.setActionHandler('play', () => {});
      navigator.mediaSession.setActionHandler('pause', () => {});
      navigator.mediaSession.setActionHandler('nexttrack', () => {});
      navigator.mediaSession.setActionHandler('previoustrack', () => {});
    }
  }

  updateMetadata({ title, artist, artwork }) {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: title || '',
      artist: artist || '',
      artwork: [{ src: artwork || 'CR0WN.jpg', sizes: '512x512', type: 'image/jpeg' }]
    });
  }
}
