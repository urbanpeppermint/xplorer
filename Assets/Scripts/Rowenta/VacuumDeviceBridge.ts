/**
 * Device bridge for Rowenta X-Plorer Serie 50.
 * Simulation backend ships now; HTTP/cloud bridge is a drop-in later.
 */
import {
  CleaningMode,
  VacuumCommand,
  VacuumCommandPayload,
  VacuumDeviceState,
  VacuumPower,
  VacuumRunState,
  createDefaultVacuumState
} from "./VacuumTypes"

export type VacuumStateListener = (state: VacuumDeviceState) => void

export interface IVacuumDevice {
  getState(): VacuumDeviceState
  subscribe(listener: VacuumStateListener): void
  unsubscribe(listener: VacuumStateListener): void
  send(payload: VacuumCommandPayload): Promise<VacuumDeviceState>
}

/**
 * In-Lens simulator so Specs UI + room scan can be developed without Rowenta cloud credentials.
 * Replace with HttpVacuumDevice when a bridge endpoint is available.
 */
export class SimulatedVacuumDevice implements IVacuumDevice {
  private state: VacuumDeviceState
  private listeners: VacuumStateListener[] = []
  private cleanTimerCancel: (() => void) | null = null

  constructor() {
    this.state = createDefaultVacuumState(true)
  }

  getState(): VacuumDeviceState {
    return this.clone(this.state)
  }

  subscribe(listener: VacuumStateListener): void {
    this.listeners.push(listener)
    listener(this.getState())
  }

  unsubscribe(listener: VacuumStateListener): void {
    this.listeners = this.listeners.filter((l) => l !== listener)
  }

  async send(payload: VacuumCommandPayload): Promise<VacuumDeviceState> {
    this.state.lastCommand = payload.command
    switch (payload.command) {
      case VacuumCommand.SetMode:
        if (payload.mode && payload.mode !== CleaningMode.Idle) {
          this.state.mode = payload.mode
          this.state.lastMessage = `Mode → ${payload.mode}`
        }
        break
      case VacuumCommand.SetPower:
        if (payload.power) {
          this.state.power = payload.power
          this.state.lastMessage = `Power → ${payload.power}`
        }
        break
      case VacuumCommand.StartClean:
        this.beginCleaning(payload.mode ?? this.state.mode)
        break
      case VacuumCommand.Pause:
        if (this.state.runState === VacuumRunState.Cleaning) {
          this.stopCleanTimer()
          this.state.runState = VacuumRunState.Paused
          this.state.isCharging = false
          this.state.lastMessage = "Paused"
        }
        break
      case VacuumCommand.Resume:
        if (this.state.runState === VacuumRunState.Paused) {
          this.beginCleaning(this.state.mode)
        }
        break
      case VacuumCommand.Stop:
        this.stopCleanTimer()
        this.state.runState = VacuumRunState.Idle
        this.state.mode = CleaningMode.Idle
        this.state.isCharging = false
        this.state.lastMessage = "Stopped"
        break
      case VacuumCommand.ReturnToDock:
        this.stopCleanTimer()
        this.state.runState = VacuumRunState.Returning
        this.state.lastMessage = "Returning to dock…"
        this.emit()
        // Simulate dock arrival
        this.schedule(() => {
          this.state.runState = VacuumRunState.Charging
          this.state.isCharging = true
          this.state.mode = CleaningMode.Idle
          this.state.lastMessage = "Docked & charging"
          this.emit()
        }, 1.2)
        break
      case VacuumCommand.Localize:
        this.state.lastMessage = "Beep — find-me (simulated)"
        break
      case VacuumCommand.ClearRoomScan:
        this.state.lastMessage = "Room scan cleared (UI-side)"
        break
      default:
        this.state.lastMessage = `Unhandled: ${payload.command}`
        break
    }
    this.emit()
    return this.getState()
  }

  private beginCleaning(mode: CleaningMode): void {
    const resolved = mode === CleaningMode.Idle ? CleaningMode.Methodic : mode
    this.state.mode = resolved
    this.state.runState = VacuumRunState.Cleaning
    this.state.isCharging = false
    this.state.lastMessage = `Cleaning (${resolved})`
    this.stopCleanTimer()
    this.tickCleanSurface()
  }

  private tickCleanSurface(): void {
    if (this.state.runState !== VacuumRunState.Cleaning) {
      return
    }
    // Rough sim: ~0.4 m² per second while cleaning
    this.state.cleanedSurfaceM2 = Math.round((this.state.cleanedSurfaceM2 + 0.4) * 10) / 10
    if (this.state.batteryPercent > 15) {
      this.state.batteryPercent = Math.max(15, this.state.batteryPercent - 0.05)
    }
    this.emit()
    this.schedule(() => this.tickCleanSurface(), 1.0)
  }

  private stopCleanTimer(): void {
    if (this.cleanTimerCancel) {
      this.cleanTimerCancel()
      this.cleanTimerCancel = null
    }
  }

  private schedule(fn: () => void, delaySec: number): void {
    if (!this.scheduleViaHost) {
      print("[SimulatedVacuum] No host scheduler — skipping delayed action")
      return
    }
    this.cleanTimerCancel = this.scheduleViaHost(fn, delaySec)
  }

  /**
   * Optional hook set by VacuumDeviceBridge.
   * Returns a cancel function for the scheduled callback.
   */
  scheduleViaHost: ((fn: () => void, delaySec: number) => () => void) | null = null

  private emit(): void {
    const snapshot = this.getState()
    for (const listener of this.listeners) {
      listener(snapshot)
    }
  }

  private clone(state: VacuumDeviceState): VacuumDeviceState {
    return {
      modelId: state.modelId,
      runState: state.runState,
      mode: state.mode,
      power: state.power,
      batteryPercent: Math.round(state.batteryPercent),
      isCharging: state.isCharging,
      cleanedSurfaceM2: state.cleanedSurfaceM2,
      lastCommand: state.lastCommand,
      lastMessage: state.lastMessage,
      simulation: state.simulation
    }
  }
}

/**
 * Talks to the Mac/PC TinyTuya bridge (`bridge/server.py`).
 * Specs cannot speak Tuya TCP:6668 — the computer is the required middle hop.
 *
 * bridgeBaseUrl examples:
 *   http://127.0.0.1:8787          — Lens Studio Preview on this Mac
 *   http://192.168.x.x:8787        — Specs on the same Wi‑Fi (not localhost)
 *
 * Plain http:// needs Experimental APIs enabled in Project Settings.
 */
export class HttpVacuumDevice implements IVacuumDevice {
  private internetModule: InternetModule = require("LensStudio:InternetModule")
  private listeners: VacuumStateListener[] = []
  private state: VacuumDeviceState
  private baseUrl: string
  private commandUrl: string
  private stateUrl: string
  /** Start and Stop share this. A second one inside the window toggles the robot off. */
  private lastLiveAt: number = -10

  constructor(bridgeBaseOrCommandUrl: string) {
    this.state = createDefaultVacuumState(false)
    this.state.lastMessage = "Connecting to Mac bridge…"
    const trimmed = bridgeBaseOrCommandUrl.replace(/\/$/, "")
    if (trimmed.endsWith("/command")) {
      this.baseUrl = trimmed.substring(0, trimmed.length - "/command".length)
      this.commandUrl = trimmed
    } else {
      this.baseUrl = trimmed
      this.commandUrl = trimmed + "/command"
    }
    this.stateUrl = this.baseUrl + "/state"
  }

  getState(): VacuumDeviceState {
    return this.state
  }

  subscribe(listener: VacuumStateListener): void {
    this.listeners.push(listener)
    listener(this.state)
  }

  unsubscribe(listener: VacuumStateListener): void {
    this.listeners = this.listeners.filter((l) => l !== listener)
  }

  async refresh(): Promise<VacuumDeviceState> {
    try {
      const response = await this.internetModule.fetch(this.stateUrl, {method: "GET"})
      if (response.status < 200 || response.status >= 300) {
        throw new Error("HTTP " + response.status)
      }
      const json = await response.json()
      this.applyRemoteState(json)
      this.state.lastMessage = this.state.lastMessage || "Connected via Mac bridge"
      this.emit()
      return this.state
    } catch (err) {
      this.state.simulation = false
      this.state.runState = VacuumRunState.Error
      this.state.lastMessage =
        "Bridge unreachable (" +
        this.baseUrl +
        "): " +
        err +
        " — is bridge/server.py running? Experimental APIs on for http?"
      this.emit()
      return this.state
    }
  }

  async send(payload: VacuumCommandPayload): Promise<VacuumDeviceState> {
    const now = getTime()
    if (this.gatesRobot(payload.command) && now - this.lastLiveAt < 4) {
      print("[VacuumBridge] Held " + payload.command + " — start is still arming")
      this.state.lastMessage = "Held " + payload.command
      this.emit()
      return this.state
    }
    if (this.gatesRobot(payload.command)) {
      this.lastLiveAt = now
    }
    try {
      const response = await this.internetModule.fetch(this.commandUrl, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify(payload)
      })
      if (response.status < 200 || response.status >= 300) {
        throw new Error("HTTP " + response.status)
      }
      const json = await response.json()
      this.applyRemoteState(json)
      this.emit()
      return this.state
    } catch (err) {
      this.state.lastMessage = "Command failed: " + err
      this.state.runState = VacuumRunState.Error
      this.emit()
      return this.state
    }
  }

  private applyRemoteState(json: any): void {
    if (!json || typeof json !== "object") {
      return
    }
    if (json.modelId) this.state.modelId = json.modelId
    if (json.runState) this.state.runState = json.runState
    if (json.mode) this.state.mode = json.mode
    if (json.power) this.state.power = json.power
    if (typeof json.batteryPercent === "number") this.state.batteryPercent = json.batteryPercent
    if (typeof json.isCharging === "boolean") this.state.isCharging = json.isCharging
    if (typeof json.cleanedSurfaceM2 === "number") this.state.cleanedSurfaceM2 = json.cleanedSurfaceM2
    if (json.lastCommand) this.state.lastCommand = json.lastCommand
    if (json.lastMessage) this.state.lastMessage = json.lastMessage
    this.state.simulation = false
  }

  private gatesRobot(command: VacuumCommand): boolean {
    return (
      command === VacuumCommand.StartClean ||
      command === VacuumCommand.Stop ||
      command === VacuumCommand.Pause ||
      command === VacuumCommand.ReturnToDock
    )
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener(this.state)
    }
  }
}

/**
 * ScriptComponent host (class name matches file for Lens Studio registration).
 */
@component
export class VacuumDeviceBridge extends BaseScriptComponent {
  @ui.label('<span style="color:#38BDF8;">Rowenta Serie 50 — device bridge</span>')

  @input
  @hint("ON = fake robot in-Lens. OFF = talk to Mac bridge → real Tuya vacuum")
  useSimulation: boolean = false

  @input
  @hint("Bridge base URL (Preview: http://127.0.0.1:8787 — Specs: http://YOUR_MAC_LAN_IP:8787)")
  bridgeEndpointUrl: string = "http://127.0.0.1:8787"

  @input
  @hint("Poll /state every N seconds while connected (0 = off)")
  statusPollSeconds: number = 3

  private device: IVacuumDevice
  private httpDevice: HttpVacuumDevice | null = null
  private sim: SimulatedVacuumDevice | null = null

  onAwake(): void {
    if (this.useSimulation || !this.bridgeEndpointUrl) {
      this.sim = new SimulatedVacuumDevice()
      this.sim.scheduleViaHost = (fn, delaySec) => {
        const ev = this.createEvent("DelayedCallbackEvent") as DelayedCallbackEvent
        ev.bind(fn)
        ev.reset(delaySec)
        return () => ev.cancel()
      }
      this.device = this.sim
      print("[VacuumBridge] SIMULATION mode")
    } else {
      this.httpDevice = new HttpVacuumDevice(this.bridgeEndpointUrl)
      this.device = this.httpDevice
      print("[VacuumBridge] LIVE mode → " + this.bridgeEndpointUrl)
      this.createEvent("OnStartEvent").bind(() => {
        this.httpDevice.refresh()
        if (this.statusPollSeconds > 0) {
          this.schedulePoll()
        }
      })
    }
  }

  getDevice(): IVacuumDevice {
    return this.device
  }

  private schedulePoll(): void {
    if (!this.httpDevice) {
      return
    }
    const ev = this.createEvent("DelayedCallbackEvent") as DelayedCallbackEvent
    ev.bind(() => {
      this.httpDevice.refresh().then(() => this.schedulePoll())
    })
    ev.reset(this.statusPollSeconds)
  }
}
