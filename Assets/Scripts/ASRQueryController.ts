/**
 * Specs Inc. 2026
 * ASRQuery Controller for the AI Playground Spectacles lens experience.
 */
import animate from "SpectaclesInteractionKit.lspkg/Utils/animate"
import Event from "SpectaclesInteractionKit.lspkg/Utils/Event"
import {RoundButton} from "SpectaclesUIKit.lspkg/Scripts/Components/Button/RoundButton"
import {GlowElement, GlowFactory, GlowText, HUD_CYAN, HUD_ICE, makeGlowText, pushArc} from "./Rowenta/HudGlow"
import {playVisorClick} from "./Rowenta/VisorClick"

@component
export class ASRQueryController extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">ASRQueryController – voice query button</span><br/><span style="color: #94A3B8; font-size: 11px;">Listens for a single voice query via ASR and fires an event with the transcribed text.</span>')
  @ui.separator

  @input
  @hint("Round mic button. Pinch to start, pause to finish the phrase.")
  private button: RoundButton

  @input
  @hint("RenderMeshVisual used to indicate active recording state")
  private activityRenderMesh: RenderMeshVisual

  @input
  @hint("Materials/HudGlowLive.mat — same additive cyan as the visor")
  @allowUndefined
  private glowMaterial: Material

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Logging</span>')
  @input
  @hint("Enable general logging")
  enableLogging: boolean = false

  @input
  @hint("Enable lifecycle logging (onAwake, onStart, onUpdate, onDestroy)")
  enableLoggingLifecycle: boolean = false

  private activityMaterial: Material
  private asrModule: AsrModule = require("LensStudio:AsrModule")
  private isRecording: boolean = false
  private micRing: GlowElement | null = null
  private micSweep: GlowElement | null = null
  private micPing: GlowElement | null = null
  private micLabel: GlowText | null = null
  private elapsed: number = 0
  private wantsMic: boolean = true
  private rearmEvent: DelayedCallbackEvent

  public onQueryEvent: Event<string> = new Event<string>()

  onAwake(): void {
    this.rearmEvent = this.createEvent("DelayedCallbackEvent") as DelayedCallbackEvent
    this.rearmEvent.bind(() => {
      if (this.wantsMic && !this.isRecording) {
        this.listen(false)
      }
    })
    this.createEvent("UpdateEvent").bind(() => this.pulseMic())
    this.createEvent("OnStartEvent").bind(() => this.init())
  }

  private init(): void {
    if (!this.button || !this.activityRenderMesh) {
      print("[ASRQueryController] Assign the RoundButton and the ActivityIndicator mesh.")
      return
    }
    const sourceMaterial = this.activityRenderMesh.mainMaterial
    if (sourceMaterial) {
      this.activityMaterial = sourceMaterial.clone()
      this.activityRenderMesh.clearMaterials()
      this.activityRenderMesh.mainMaterial = this.activityMaterial
      this.activityMaterial.mainPass.in_out = 0
    }
    const fadeHost = this.button as RoundButton & {opacity?: number}
    fadeHost.opacity = 0
    this.button.initialize()
    this.dressAsVisorMic()
    this.button.onTriggerUp.add(() => this.onMicPinch())
    this.wantsMic = true
    this.listen(false)
  }

  /** Pinch silences an open mic. A later pinch, or the lens opening, turns it back on. */
  private onMicPinch(): void {
    if (this.isRecording) {
      this.wantsMic = false
      this.isRecording = false
      this.animateVoiceIndicator(false)
      this.asrModule.stopTranscribing()
      playVisorClick(this.button.sceneObject)
      print("ASR mic closed")
      return
    }
    this.wantsMic = true
    this.listen(true)
  }

  private listen(fromPinch: boolean): void {
    if (!this.wantsMic || this.isRecording) {
      return
    }
    this.getVoiceQuery(fromPinch).then((query) => {
      this.onQueryEvent.invoke(query)
      this.rearmEvent.reset(0.85)
    }).catch((err) => {
      print("[ASRQueryController] " + err)
      if (this.wantsMic) {
        this.rearmEvent.reset(0.85)
      }
    })
  }

  public getVoiceQuery(fromPinch: boolean = true): Promise<string> {
    return new Promise((resolve, reject) => {
      if (this.isRecording) {
        reject("Already recording")
        return
      }
      print("ASR listening... (speak, then pause to finish)")
      this.isRecording = true
      if (fromPinch) {
        playVisorClick(this.button.sceneObject)
      }
      const asrSettings = AsrModule.AsrTranscriptionOptions.create()
      asrSettings.mode = AsrModule.AsrMode.HighAccuracy
      asrSettings.silenceUntilTerminationMs = 1500
      asrSettings.onTranscriptionUpdateEvent.add((asrOutput) => {
        if (asrOutput.isFinal) {
          print(`ASR heard: "${asrOutput.text}"`)
          this.isRecording = false
          this.animateVoiceIndicator(false)
          this.asrModule.stopTranscribing()
          resolve(asrOutput.text)
        }
      })
      asrSettings.onTranscriptionErrorEvent.add((asrOutput) => {
        print(`ASR error: ${asrOutput}`)
        this.isRecording = false
        this.animateVoiceIndicator(false)
        reject(asrOutput)
      })
      this.animateVoiceIndicator(true)
      this.asrModule.startTranscribing(asrSettings)
    })
  }

  /** Idle ring plus a sweep that only moves while the mic is listening. Label is the word MIC. */
  private dressAsVisorMic(): void {
    const host = this.button.sceneObject
    if (!this.glowMaterial) {
      print("[ASRQueryController] Assign HudGlowLive so the mic matches the visor.")
      return
    }
    const factory = new GlowFactory(this.glowMaterial)
    const hostTransform = host.getTransform()
    const hostScale = hostTransform.getLocalScale()
    hostTransform.setLocalScale(new vec3(hostScale.x * 1.32, hostScale.y * 1.32, hostScale.z * 1.32))

    const ringV: number[] = []
    const ringI: number[] = []
    pushArc(ringV, ringI, 0, 0, 1.55, 0.06, 0, 360, 48)
    this.micRing = factory.build(host, "MicRing", ringV, ringI, HUD_CYAN, 6).setIntensity(0.4)

    const sweepV: number[] = []
    const sweepI: number[] = []
    pushArc(sweepV, sweepI, 0, 0, 1.55, 0.16, 18, 78, 16)
    this.micSweep = factory.build(host, "MicSweep", sweepV, sweepI, HUD_ICE, 7).setVisible(false)

    const pingV: number[] = []
    const pingI: number[] = []
    pushArc(pingV, pingI, 0, 0, 1.55, 0.05, 0, 360, 40)
    this.micPing = factory.build(host, "MicPing", pingV, pingI, HUD_CYAN, 5).setVisible(false)

    this.micLabel = makeGlowText(host, "MicLabel", "MIC", 78, HUD_ICE, "center", null, 0, 0, 8)

    const count = host.getChildrenCount()
    for (let i = 0; i < count; i++) {
      const child = host.getChild(i)
      const keep =
        child.name === "MicRing" ||
        child.name === "MicSweep" ||
        child.name === "MicPing" ||
        child.name === "MicLabel" ||
        child.name === "Collider"
      if (!keep) {
        child.enabled = false
      }
    }
  }

  private pulseMic(): void {
    if (!this.micRing) {
      return
    }
    this.elapsed += getDeltaTime()
    if (this.isRecording) {
      const wave = 0.5 + 0.5 * Math.sin(this.elapsed * 7)
      this.micRing.setIntensity(0.35 + 0.45 * wave)
      this.micSweep?.setVisible(true).setRotationDeg(this.elapsed * 220).setIntensity(0.7 + 0.3 * wave)
      const ping = (this.elapsed * 1.4) % 1
      this.micPing?.setVisible(true).setUniformScale(1 + ping * 0.55).setIntensity(0.7 * (1 - ping))
      this.micLabel?.setIntensity(0.75 + 0.25 * wave)
    } else {
      this.micRing.setIntensity(0.38)
      this.micSweep?.setVisible(false)
      this.micPing?.setVisible(false).setUniformScale(1)
      this.micLabel?.setColor(HUD_CYAN).setIntensity(0.9)
    }
  }

  private animateVoiceIndicator(on: boolean): void {
    if (!this.activityMaterial) {
      return
    }
    if (on) {
      animate({
        duration: 0.5,
        easing: "linear",
        update: (t) => {
          this.activityMaterial.mainPass.in_out = t
        }
      })
    } else {
      animate({
        duration: 0.5,
        easing: "linear",
        update: (t) => {
          this.activityMaterial.mainPass.in_out = 1 - t
        }
      })
    }
  }
}
