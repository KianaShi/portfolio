(function(){
  var ctx = window.__ctx;

  // Filenames carry no machine-readable "Artist - Title" structure, so titles below
  // are the literal filenames (confirmed via tools/inspect-audio.mjs) and artist is
  // explicitly left as an unknown placeholder rather than invented — see CREDITS.md.
  // Paths are encodeURI()'d at use (phone-player.js) since these filenames contain
  // spaces and "!".
  // Morning first (tracks[0]) — the phone player autoplays whatever is at index 0 on
  // mount, so this order also determines the autoplay-on-load track. The other four
  // keep their previous relative order.
  ctx.phonePlayerTracks = [
    {
      title: 'Morning',
      artist: 'Unknown Artist',
      audio: 'assets/audio/tracks/Morning.mp3',
      cover: 'assets/audio/covers/Morning.png'
    },
    {
      title: 'Hello World!',
      artist: 'Unknown Artist',
      audio: 'assets/audio/tracks/Hello World!.mp3',
      cover: 'assets/audio/covers/Hello World!.png'
    },
    {
      title: 'Mirrorborn',
      artist: 'Unknown Artist',
      audio: 'assets/audio/tracks/Mirrorborn.wav',
      cover: 'assets/audio/covers/Mirrorborn.png'
    },
    {
      title: 'Summer evening breeze',
      artist: 'Unknown Artist',
      audio: 'assets/audio/tracks/Summer evening breeze.mp3',
      cover: 'assets/audio/covers/Summer evening breeze.png'
    },
    {
      title: 'Withered Dream',
      artist: 'Unknown Artist',
      audio: 'assets/audio/tracks/Withered Dream.mp3',
      cover: 'assets/audio/covers/Withered Dream.png'
    }
  ];
})();
