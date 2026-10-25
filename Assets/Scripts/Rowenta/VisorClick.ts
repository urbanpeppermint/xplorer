/**
 * One short laser tick shared by every visor pinch, including the mic.
 * The clip is Assets/GeneratedSFX/visor_laser.wav (about 0.16 s).
 */
const CLICK = requireAsset("../../GeneratedSFX/visor_laser.wav") as AudioTrackAsset

export function playVisorClick(host: SceneObject): void {
  let audio = host.getComponent("Component.AudioComponent") as AudioComponent
  if (!audio) {
    audio = host.createComponent("Component.AudioComponent") as AudioComponent
    audio.audioTrack = CLICK
    audio.volume = 0.7
    audio.playbackMode = Audio.PlaybackMode.LowLatency
  }
  if (audio.isPlaying()) {
    audio.stop(false)
  }
  audio.play(1)
}
