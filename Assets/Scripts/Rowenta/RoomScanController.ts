/**
 * Specs-side room scan using WorldQueryModule.
 * Serie 50 only exposes a non-editable gyro map from the robot — Specs raycasts
 * give us an independent spatial overlay (floor samples) for AR guidance.
 *
 * Requires WorldQueryModule (LensStudio:WorldQueryModule). Degrades gracefully
 * if the module is unavailable (e.g. during 5.15.4 migration until re-enabled).
 */
import {SIK} from "SpectaclesInteractionKit.lspkg/SIK"
import {InteractorTriggerType} from "SpectaclesInteractionKit.lspkg/Core/Interactor/Interactor"

export type RoomScanSample = {
  position: vec3
  normal: vec3
}

@component
export class RoomScanController extends BaseScriptComponent {
  @ui.label('<span style="color:#38BDF8;">Room scan (Specs World Query)</span>')

  @input
  @hint("Preview marker that follows the hit surface while pointing")
  @allowUndefined
  previewMarker: SceneObject

  @input
  @hint("Parent for committed floor samples")
  @allowUndefined
  samplesRoot: SceneObject

  @input
  @hint("Prefab / template object cloned at each committed sample")
  @allowUndefined
  sampleTemplate: SceneObject

  @input
  filterEnabled: boolean = true

  @input
  maxSamples: number = 64

  @input
  enableLogging: boolean = true

  private hitTestSession: HitTestSession | null = null
  private samples: RoomScanSample[] = []
  private worldQueryAvailable: boolean = false
  private scanning: boolean = false
  private statusText: string = "Room scan idle"

  onAwake(): void {
    if (this.previewMarker) {
      this.previewMarker.enabled = false
    }
    if (this.sampleTemplate) {
      this.sampleTemplate.enabled = false
    }
    this.tryInitWorldQuery()
    this.createEvent("UpdateEvent").bind(() => this.onUpdate())
  }

  getStatus(): string {
    return this.statusText
  }

  getSampleCount(): number {
    return this.samples.length
  }

  getSamples(): RoomScanSample[] {
    return this.samples.slice()
  }

  setScanning(enabled: boolean): void {
    this.scanning = enabled
    if (!this.worldQueryAvailable) {
      this.statusText = "WorldQuery unavailable — install WorldQueryHit / enable module"
      return
    }
    this.statusText = enabled
      ? "Scanning — point + pinch to drop floor samples"
      : `Scan paused (${this.samples.length} samples)`
    if (!enabled && this.previewMarker) {
      this.previewMarker.enabled = false
    }
  }

  clearSamples(): void {
    this.samples = []
    if (this.samplesRoot) {
      const count = this.samplesRoot.getChildrenCount()
      for (let i = count - 1; i >= 0; i--) {
        this.samplesRoot.getChild(i).destroy()
      }
    }
    this.statusText = "Room scan cleared"
  }

  private tryInitWorldQuery(): void {
    try {
      const WorldQueryModule = require("LensStudio:WorldQueryModule") as WorldQueryModule
      const options = HitTestSessionOptions.create()
      options.filter = this.filterEnabled
      this.hitTestSession = WorldQueryModule.createHitTestSessionWithOptions(options)
      this.hitTestSession.start()
      this.worldQueryAvailable = true
      this.statusText = "WorldQuery ready"
      if (this.enableLogging) {
        print("[RoomScan] WorldQuery session started")
      }
    } catch (err) {
      this.worldQueryAvailable = false
      this.statusText = "WorldQuery missing — room scan disabled until package/module is available"
      print("[RoomScan] Init failed: " + err)
    }
  }

  private onUpdate(): void {
    if (!this.scanning || !this.worldQueryAvailable || !this.hitTestSession) {
      return
    }
    const interactor = SIK.InteractionManager.getTargetingInteractors().shift()
    if (!interactor || !interactor.isActive() || !interactor.isTargeting()) {
      if (this.previewMarker) {
        this.previewMarker.enabled = false
      }
      return
    }

    this.hitTestSession.hitTest(interactor.startPoint, interactor.endPoint, (result) => {
      this.onHitResult(result, interactor)
    })
  }

  private onHitResult(result: WorldQueryHitTestResult | null, interactor: any): void {
    if (!result) {
      if (this.previewMarker) {
        this.previewMarker.enabled = false
      }
      return
    }

    if (this.previewMarker) {
      this.previewMarker.enabled = true
      const tr = this.previewMarker.getTransform()
      tr.setWorldPosition(result.position)
      this.orientToNormal(tr, result.normal)
    }

    const released =
      interactor.previousTrigger !== InteractorTriggerType.None &&
      interactor.currentTrigger === InteractorTriggerType.None
    if (released) {
      this.commitSample(result.position, result.normal)
    }
  }

  private commitSample(position: vec3, normal: vec3): void {
    if (this.samples.length >= this.maxSamples) {
      this.statusText = `Max samples (${this.maxSamples}) reached`
      return
    }
    this.samples.push({position, normal})
    this.statusText = `Sample ${this.samples.length}/${this.maxSamples}`

    if (this.sampleTemplate && this.samplesRoot) {
      const clone = this.samplesRoot.copyWholeHierarchy(this.sampleTemplate)
      clone.enabled = true
      clone.name = "ScanSample_" + this.samples.length
      const tr = clone.getTransform()
      tr.setWorldPosition(position)
      this.orientToNormal(tr, normal)
    }

    if (this.enableLogging) {
      print(`[RoomScan] sample #${this.samples.length} @ ${position}`)
    }
  }

  private orientToNormal(tr: Transform, normal: vec3): void {
    const n = normal.normalize()
    const EPSILON = 0.01
    let lookDir: vec3
    if (1 - Math.abs(n.dot(vec3.up())) < EPSILON) {
      lookDir = vec3.forward()
    } else {
      lookDir = n.cross(vec3.up())
    }
    tr.setWorldRotation(quat.lookAt(lookDir, n))
  }
}
