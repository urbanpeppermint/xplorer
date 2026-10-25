/**
 * Maps spoken phrases → VacuumCommand for the glasses demo.
 * Works with AI Playground ASR (or any string source) while still on CLAD.
 */
import {ASRQueryController} from "../ASRQueryController"
import {VacuumDeviceBridge} from "./VacuumDeviceBridge"
import {CleaningMode, VacuumCommand, VacuumPower, VacuumRunState} from "./VacuumTypes"
import {HelmetHud} from "./HelmetHud"

type ParsedIntent = {
  command: VacuumCommand
  mode?: CleaningMode
  power?: VacuumPower
  runState?: VacuumRunState
  label: string
  /** False = visor reacts, Alexa is not called. Used for the paid-tier demo cues. */
  live: boolean
}

@component
export class VacuumVoiceRouter extends BaseScriptComponent {
  @ui.label('<span style="color:#38BDF8;">Voice → Rowenta commands (CLAD demo)</span>')

  @input
  bridgeHost: VacuumDeviceBridge

  @input
  @allowUndefined
  @hint("Drag VoiceInput here. The ASRQueryController on that object is used.")
  asrController: ScriptComponent

  @input
  @hint("Words that start cleaning. Comma-separated. Change these in the Inspector, then restart Preview.")
  startWords: string = "eat this, start, go, follow, vacuum, come here"

  @input
  @hint("Words that send the robot to the dock. Comma-separated.")
  dockWords: string = "dock, go home, charge, recharge"

  @input
  @hint("Words that turn the robot off. Comma-separated. Checked before start words.")
  stopWords: string = "stop, off, cancel, halt"

  @input
  @hint("Visor-only. Pause has no Alexa routine on the free VoiceMonkey plan.")
  pauseWords: string = "pause, hold, wait"

  @input
  @hint("Visor-only suction words.")
  boostWords: string = "boost, max, turbo"

  @input
  spotWords: string = "spot, patch"

  @input
  wallWords: string = "wall, edges, trace"

  @input
  findWords: string = "find, locate, where are you"

  @input
  enableLogging: boolean = true

  private lastSentAt: number = -10

  onAwake(): void {
    this.createEvent("OnStartEvent").bind(() => this.wireAsr())
  }

  /** Call from other scripts / Gemini tool hooks with raw transcript. */
  public async handleTranscript(raw: string): Promise<void> {
    const intent = this.parse(raw)
    if (!intent) {
      if (this.enableLogging) {
        print("[VacuumVoice] No intent for: " + raw)
      }
      return
    }
    if (this.enableLogging) {
      print("[VacuumVoice] " + intent.label + " ← \"" + raw + "\"")
    }
    if (intent.live) {
      const now = getTime()
      if (now - this.lastSentAt < 1.5) {
        print("[VacuumVoice] Ignored extra phrase")
        return
      }
      this.lastSentAt = now
      if (!this.bridgeHost) {
        print("[VacuumVoice] Missing VacuumDeviceBridge")
        return
      }
      const state = await this.bridgeHost.getDevice().send({
        command: intent.command,
        mode: intent.mode,
        power: intent.power
      })
      if (state.lastMessage.indexOf("Held ") === 0) {
        return
      }
    }
    this.showOnHelmet(intent)
  }

  private showOnHelmet(intent: ParsedIntent): void {
    const line = this.helmetLine(intent)
    const roots = global.scene.getRootObjectsCount()
    for (let i = 0; i < roots; i++) {
      this.pushLine(global.scene.getRootObject(i), intent, line)
    }
  }

  private helmetLine(intent: ParsedIntent): string {
    if (intent.command === VacuumCommand.ReturnToDock) {
      return "DOCK"
    }
    if (intent.command === VacuumCommand.Pause) {
      return "HOLD"
    }
    if (intent.command === VacuumCommand.Stop) {
      return "STOP"
    }
    if (intent.command === VacuumCommand.StartClean) {
      return "TARGET LOCK"
    }
    return intent.label.toUpperCase()
  }

  private pushLine(node: SceneObject, intent: ParsedIntent, line: string): void {
    const scripts = node.getComponents("Component.ScriptComponent")
    for (let i = 0; i < scripts.length; i++) {
      const hud = scripts[i] as HelmetHud
      if (!hud || !hud.setLine) {
        continue
      }
      if (!intent.live && hud.presentDemo) {
        hud.presentDemo(line, intent.mode, intent.power, intent.runState)
      } else {
        hud.setLine(line)
      }
    }
    const children = node.getChildrenCount()
    for (let c = 0; c < children; c++) {
      this.pushLine(node.getChild(c), intent, line)
    }
  }

  private wireAsr(): void {
    const asr = this.resolveAsr()
    if (!asr) {
      print("[VacuumVoice] No ASRQueryController in the scene. Add the VoiceInput prefab, then press its button and say \"start\".")
      return
    }
    asr.onQueryEvent.add((query) => this.handleTranscript(query))
    if (this.enableLogging) {
      print("[VacuumVoice] ASR wired")
    }
  }

  private resolveAsr(): ASRQueryController | null {
    const assigned = this.asAsr(this.asrController)
    if (assigned) {
      return assigned
    }
    const roots = global.scene.getRootObjectsCount()
    for (let i = 0; i < roots; i++) {
      const found = this.findAsr(global.scene.getRootObject(i))
      if (found) {
        return found
      }
    }
    return null
  }

  private findAsr(node: SceneObject): ASRQueryController | null {
    const scripts = node.getComponents("Component.ScriptComponent")
    for (let i = 0; i < scripts.length; i++) {
      const found = this.asAsr(scripts[i])
      if (found) {
        return found
      }
    }
    const children = node.getChildrenCount()
    for (let c = 0; c < children; c++) {
      const found = this.findAsr(node.getChild(c))
      if (found) {
        return found
      }
    }
    return null
  }

  private asAsr(value: unknown): ASRQueryController | null {
    const candidate = value as ASRQueryController
    if (candidate && candidate.onQueryEvent && candidate.getVoiceQuery) {
      return candidate
    }
    return null
  }

  private parse(raw: string): ParsedIntent | null {
    const t = (raw || "").toLowerCase().trim()
    if (!t) {
      return null
    }

    if (this.matches(t, this.stopWords)) {
      return {command: VacuumCommand.Stop, label: "Stop", live: true}
    }
    if (this.matches(t, this.dockWords)) {
      return {command: VacuumCommand.ReturnToDock, label: "Dock", live: true}
    }
    if (this.matches(t, this.startWords)) {
      return {
        command: VacuumCommand.StartClean,
        mode: CleaningMode.Methodic,
        label: "Start",
        live: true
      }
    }
    if (this.matches(t, this.pauseWords)) {
      return {command: VacuumCommand.Pause, runState: VacuumRunState.Paused, label: "Pause", live: false}
    }
    if (this.matches(t, this.boostWords)) {
      return {command: VacuumCommand.SetPower, power: VacuumPower.Boost, label: "Boost", live: false}
    }
    if (this.matches(t, "eco, quiet")) {
      return {command: VacuumCommand.SetPower, power: VacuumPower.Eco, label: "Eco", live: false}
    }
    if (this.matches(t, this.spotWords)) {
      return {command: VacuumCommand.SetMode, mode: CleaningMode.Spot, label: "Spot", live: false}
    }
    if (this.matches(t, this.wallWords)) {
      return {command: VacuumCommand.SetMode, mode: CleaningMode.WallFollow, label: "Wall", live: false}
    }
    if (this.matches(t, "smart, methodic")) {
      return {command: VacuumCommand.SetMode, mode: CleaningMode.Methodic, label: "Smart", live: false}
    }
    if (this.matches(t, this.findWords)) {
      return {command: VacuumCommand.Localize, label: "Find", live: false}
    }
    if (this.matches(t, "resume, continue")) {
      return {command: VacuumCommand.Resume, runState: VacuumRunState.Cleaning, label: "Resume", live: false}
    }
    return null
  }

  private matches(heard: string, list: string): boolean {
    const padded = " " + (heard || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim() + " "
    const words = (list || "").split(",")
    for (let i = 0; i < words.length; i++) {
      const word = words[i].toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim()
      if (word.length > 0 && padded.indexOf(" " + word + " ") >= 0) {
        return true
      }
    }
    return false
  }
}
