/**
 * Rowenta X-Plorer Serie 50 (RR7387 / RR7387WH) command + state model.
 * Grounded in IFU + Rowenta Robots app FAQ:
 * - Modes: Methodic, Spot, Wall Follow
 * - Gyro map is session-only and not customizable on Serie 50
 * - Dock return, pause/resume, Wi-Fi app + Alexa/Google
 */

export enum CleaningMode {
  Idle = "Idle",
  Methodic = "Methodic",
  Spot = "Spot",
  WallFollow = "WallFollow"
}

export enum VacuumPower {
  Eco = "Eco",
  Normal = "Normal",
  Boost = "Boost"
}

export enum VacuumRunState {
  Docked = "Docked",
  Charging = "Charging",
  Idle = "Idle",
  Cleaning = "Cleaning",
  Paused = "Paused",
  Returning = "Returning",
  Error = "Error"
}

export enum VacuumCommand {
  StartClean = "StartClean",
  Pause = "Pause",
  Resume = "Resume",
  Stop = "Stop",
  ReturnToDock = "ReturnToDock",
  Localize = "Localize",
  SetMode = "SetMode",
  SetPower = "SetPower",
  ClearRoomScan = "ClearRoomScan"
}

export type VacuumCommandPayload = {
  command: VacuumCommand
  mode?: CleaningMode
  power?: VacuumPower
}

export type VacuumDeviceState = {
  modelId: string
  runState: VacuumRunState
  mode: CleaningMode
  power: VacuumPower
  batteryPercent: number
  isCharging: boolean
  cleanedSurfaceM2: number
  lastCommand: string
  lastMessage: string
  simulation: boolean
}

export function createDefaultVacuumState(simulation: boolean = true): VacuumDeviceState {
  return {
    modelId: "RR7387WH",
    runState: VacuumRunState.Docked,
    mode: CleaningMode.Idle,
    power: VacuumPower.Normal,
    batteryPercent: 100,
    isCharging: true,
    cleanedSurfaceM2: 0,
    lastCommand: "none",
    lastMessage: simulation ? "Simulation ready — no robot cloud linked yet" : "Connected",
    simulation
  }
}
