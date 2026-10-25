/**
 * Head-locked cyborg visor for the Rowenta X-Plorer Serie 50.
 *
 * The whole HUD is parented to the Camera Object, so it rides the user's head
 * instead of sitting in world space. Geometry is authored in a nominal
 * "centimetres at 55 cm" space and the root is scaled by distance/55, which keeps
 * the angular layout identical at any viewing distance.
 *
 * Readouts and pinch controls are the same visor. There is no separate menu card.
 * Battery, gyro map, SMART / SPOT / WALL / FIND, Eco / Normal / Boost, the
 * schedule chip, accessory ticks, and Start / Dock / Stop all live on this plane.
 */
import {Interactable} from "SpectaclesInteractionKit.lspkg/Components/Interaction/Interactable/Interactable"
import {
  GlowElement,
  GlowFactory,
  GlowText,
  HUD_ALERT,
  HUD_AMBER,
  HUD_CYAN,
  HUD_ICE,
  HUD_RAIL,
  Rgb,
  makeGlowText,
  mixRgb,
  pushArc,
  pushBracket,
  pushChevron,
  pushRadialTicks,
  pushRect,
  pushSegment
} from "./HudGlow"
import {RoomScanController} from "./RoomScanController"
import {playVisorClick} from "./VisorClick"
import {VacuumDeviceBridge} from "./VacuumDeviceBridge"
import {CleaningMode, VacuumCommand, VacuumDeviceState, VacuumPower, VacuumRunState} from "./VacuumTypes"

/** Authoring distance. Layout numbers below are centimetres at this distance. */
const REF_DISTANCE = 55
/** Half-extents the layout below occupies, so the visor can shrink to fit a narrow FOV. */
const DESIGN_HALF_W = 17.0
const DESIGN_HALF_H = 16.0

// --- Layout (cm @ REF_DISTANCE) ----------------------------------------------
const RETICLE_Y = 1.0
const RETICLE_R = 6.4
const MAP_W = 8.8
const MAP_H = 4.6
const PRIMARY_Y = -7.6
const SECONDARY_Y = -9.6
const SCHEDULE_Y = 11.3
const COMMAND_Y = -12.2
const CLUSTER_Y = 9.4
const MODE_X = -13.2
const BATT_X = 13.2
const BATT_R = 2.5
const BATT_START_DEG = 305
const BATT_SWEEP_DEG = 290
const GAUGE_Y = -11.4
const POWER_X = -12.8
const SYS_X = 12.8
const CHROME_X = 16.8
const CHROME_TOP = 12.6
const CHROME_BOTTOM = 15.2

// --- Type scale (Text.size; em height cm = size / 43.886) ---------------------
const SIZE_PRIMARY = 66
const SIZE_SECONDARY = 40
const SIZE_MICRO = 30
const SIZE_TINY = 25

/** Coaching line. Start / dock / stop are live. The rest are visor-only demo cues. */
const HINTS = [
  "SAY FOLLOW ME TO START",
  "SAY DOCK TO CHARGE",
  "SAY STOP",
  "SAY BOOST",
  "SAY SPOT",
  "SAY WALL",
  "SAY PAUSE"
]

const MODE_ROWS = ["SMART", "SPOT", "WALL", "FIND"]
const MODE_ROW_PITCH = 1.95
const MODE_ROW_TOP = CLUSTER_Y + 0.9
const POWER_LABELS = ["ECO", "NORMAL", "BOOST"]
const POWER_PITCH = 2.0
/** Six accessory slots — Dust / Mop / Filter / Central / Side / Sensors. */
const SYS_TICK_COUNT = 6
const SYS_PITCH = 0.92

type HudMood = {
  accent: Rgb
  primary: string
  secondary: string
  pulseHz: number
  sweep: boolean
  tracer: boolean
  dockVector: boolean
}

@component
export class HelmetHud extends BaseScriptComponent {
  @ui.label(
    '<span style="color:#38BDF8;">Rowenta helmet visor — head-locked illuminated HUD</span>'
  )

  @input
  @hint("Unlit material HudGlowLive. The script switches it to additive glow. Do not assign an empty material.")
  @allowUndefined
  glowMaterial: Material

  @input
  @hint("Materials/HudTerminalFont.ttf — terminal face for every readout")
  @allowUndefined
  hudFont: Font

  @input
  @hint("VacuumDeviceBridge driving the live robot state. Found automatically if empty.")
  @allowUndefined
  bridgeHost: VacuumDeviceBridge

  @input
  @hint("Distance from the eyes to the HUD plane, in cm. Angular layout is preserved.")
  hudDistanceCm: number = 45

  @input
  @hint("Overall HUD scale multiplier. Lower it if the chrome falls outside the Specs FOV.")
  hudScale: number = 1.0

  @input
  @hint("Scheduled program window shown on the visor, e.g. TOMORROW 13:50")
  scheduleWhen: string = "TOMORROW 13:50"

  @input
  @hint("Scheduled program name from the Robots app")
  scheduleLabel: string = "PROGRAMMA"

  @input
  @hint("Light the schedule chip. Off shows NO PROGRAM ARMED.")
  scheduleArmed: boolean = true

  @input
  @hint("Room scan. Found automatically if empty. Scan and Clear live on the visor.")
  @allowUndefined
  roomScan: RoomScanController

  // --- Geometry ---------------------------------------------------------------
  private factory: GlowFactory | null = null
  private root: SceneObject | null = null
  private reticle: SceneObject | null = null
  private mapGroup: SceneObject | null = null

  private chrome: GlowElement | null = null
  private reticleFrame: GlowElement | null = null
  private reticleArcs: GlowElement | null = null
  private lockBrackets: GlowElement | null = null
  private scanSweep: GlowElement | null = null
  private dockVector: GlowElement | null = null
  private mapDots: GlowElement | null = null
  private mapPath: GlowElement | null = null
  private mapHome: GlowElement | null = null
  private mapTracer: GlowElement | null = null
  private battFrame: GlowElement | null = null
  private battFill: GlowElement | null = null
  private railSpine: GlowElement | null = null
  private railCaret: GlowElement | null = null
  private powerTrack: GlowElement | null = null
  private powerFill: GlowElement | null = null
  private sysTicksOk: GlowElement | null = null
  private sysTicksWarn: GlowElement | null = null

  private primaryText: GlowText | null = null
  private secondaryText: GlowText | null = null
  private scheduleText: GlowText | null = null
  private battValue: GlowText | null = null
  private battMode: GlowText | null = null
  private railLabels: GlowText[] = []
  private powerTag: GlowText | null = null
  private powerValue: GlowText | null = null
  private sysTag: GlowText | null = null
  private sysValue: GlowText | null = null

  // --- State -------------------------------------------------------------------
  private mood: HudMood = HelmetHud.moodFor(VacuumRunState.Docked, CleaningMode.Idle)
  private runState: VacuumRunState = VacuumRunState.Docked
  private elapsed: number = 0
  private tracerDistance: number = 0
  private localizeFlash: number = 0
  private overrideTimer: number = 0
  private lastBatteryPercent: number = -1
  private lastCommandSeen: string = ""
  private maintenanceOk: boolean[] = [true, true, true, true, true, true]
  private scanning: boolean = false
  private presses: {text: GlowText; age: number}[] = []
  private lastCommandAt: number = -10
  private hintText: GlowText | null = null
  private hintIndex: number = 0
  private hintAge: number = 0
  private hintHold: number = 0
  private demoMode: CleaningMode | null = null
  private demoPower: VacuumPower | null = null
  private demoRun: VacuumRunState | null = null
  private pathPoints: vec2[] = []
  private pathLengths: number[] = []
  private pathTotal: number = 0

  onAwake(): void {
    this.createEvent("OnStartEvent").bind(() => this.mount())
    this.createEvent("UpdateEvent").bind(() => this.animate())
  }

  // ---------------------------------------------------------------------------
  // Public API — kept stable for VacuumVoiceRouter and the control panel
  // ---------------------------------------------------------------------------

  /** Transient headline override, e.g. voice feedback. Resolves back to live state. */
  public setLine(line: string): void {
    if (!this.primaryText) {
      return
    }
    const text = (line || "").toUpperCase()
    this.primaryText.setContent(text)
    this.overrideTimer = 2.2
    this.hintHold = 2.8
    this.hintText?.setContent("›  " + text).setColor(HUD_ICE).setIntensity(1.2)
  }

  /**
   * Visor-only reaction for commands with no VoiceMonkey routine (pause, boost,
   * spot, wall, find). The widgets move. Alexa is not called.
   */
  public presentDemo(line: string, mode?: CleaningMode, power?: VacuumPower, run?: VacuumRunState): void {
    if (mode) {
      this.demoMode = mode
    }
    if (power) {
      this.demoPower = power
    }
    if (run) {
      this.demoRun = run
      this.runState = run
    }
    const modeNow = this.demoMode ?? CleaningMode.Idle
    const powerNow = this.demoPower ?? VacuumPower.Normal
    this.mood = HelmetHud.moodFor(this.runState, modeNow)
    this.applyMode({mode: modeNow} as VacuumDeviceState)
    this.applyPower({power: powerNow} as VacuumDeviceState)
    this.applyAccent()
    if (line.toUpperCase() === "FIND") {
      this.pingLocalize()
    }
    this.setLine(line)
  }

  public setStatus(primary: string, secondary?: string): void {
    this.setLine(primary)
    if (secondary && this.secondaryText) {
      this.secondaryText.setContent(secondary.toUpperCase())
    }
  }

  /** Flash the LOCALIZE row — the Robots app "find my robot" beep. */
  public pingLocalize(): void {
    this.localizeFlash = 1.6
  }

  public setSchedule(when: string, label: string, armed: boolean): void {
    this.scheduleWhen = when
    this.scheduleLabel = label
    this.scheduleArmed = armed
    this.refreshSchedule()
  }

  /** Accessory index follows the Maintenance tab: Dust/Mop/Filter/Central/Side/Sensors. */
  public setMaintenanceOk(index: number, ok: boolean): void {
    if (index < 0 || index >= this.maintenanceOk.length) {
      return
    }
    this.maintenanceOk[index] = ok
    this.refreshMaintenance()
  }

  // ---------------------------------------------------------------------------
  // Build
  // ---------------------------------------------------------------------------

  private mount(): void {
    if (!this.glowMaterial) {
      print("[HelmetHud] glowMaterial is unassigned — wire the Unlit material HudGlowLive")
      return
    }
    const cameraObject = this.resolveCameraObject()
    if (!cameraObject) {
      print("[HelmetHud] No camera in the scene — visor cannot head-lock")
      return
    }

    this.factory = new GlowFactory(this.glowMaterial)

    const root = global.scene.createSceneObject("HelmetVisor")
    root.setParent(cameraObject)
    root.layer = cameraObject.layer
    const distance = this.hudDistanceCm > 1 ? this.hudDistanceCm : REF_DISTANCE
    const manual = this.hudScale > 0 ? this.hudScale : 1
    const k = (distance / REF_DISTANCE) * manual * this.fitScale(cameraObject, distance)
    const rootTransform = root.getTransform()
    // The chrome hangs lower than it rises, so the bottom clips while the top of the
    // view stays empty. Lift the whole visor into that spare space.
    rootTransform.setLocalPosition(new vec3(0, 5.5, -distance))
    rootTransform.setLocalRotation(quat.quatIdentity())
    rootTransform.setLocalScale(new vec3(k, k, k))
    this.root = root

    this.buildChrome(root)
    this.buildReticle(root)
    this.buildStatusStack(root)
    this.buildBattery(root)
    this.buildModeRail(root)
    this.buildPowerGauge(root)
    this.buildSysGauge(root)
    this.buildCommandDeck(root)

    this.refreshMaintenance()
    this.bindBridge()
    print("[HelmetHud] Visor mounted on " + cameraObject.name + " at z=-" + distance + "cm")
  }

  /** Visor edge brackets — the only chrome that touches the periphery. */
  private buildChrome(parent: SceneObject): void {
    const v: number[] = []
    const i: number[] = []
    const armX = 3.0
    const armY = 2.0
    const t = 0.14
    pushBracket(v, i, -CHROME_X, CHROME_TOP, armX, armY, t, 1, -1)
    pushBracket(v, i, CHROME_X, CHROME_TOP, armX, armY, t, -1, -1)
    pushBracket(v, i, -CHROME_X, -CHROME_BOTTOM, armX, armY, t, 1, 1)
    pushBracket(v, i, CHROME_X, -CHROME_BOTTOM, armX, armY, t, -1, 1)
    this.chrome = this.factory!.build(parent, "VisorChrome", v, i, HUD_RAIL, 0).setIntensity(0.5)
  }

  private buildReticle(parent: SceneObject): void {
    const reticle = global.scene.createSceneObject("Reticle")
    reticle.setParent(parent)
    reticle.layer = parent.layer
    reticle.getTransform().setLocalPosition(new vec3(0, RETICLE_Y, 0))
    this.reticle = reticle

    // Base ring + bearing ticks. The map owns the centre, so there is no crosshair.
    const fv: number[] = []
    const fi: number[] = []
    pushArc(fv, fi, 0, 0, RETICLE_R, 0.1, 0, 360, 72)
    pushRadialTicks(fv, fi, 0, 0, RETICLE_R + 0.45, RETICLE_R + 1.0, 0.11, 12, 0)
    this.reticleFrame = this.factory!.build(reticle, "ReticleFrame", fv, fi, HUD_RAIL, 1).setIntensity(0.55)

    // Four live arcs that spin with the run state.
    const av: number[] = []
    const ai: number[] = []
    for (let q = 0; q < 4; q++) {
      pushArc(av, ai, 0, 0, RETICLE_R, 0.3, 90 * q + 17, 56, 14)
    }
    this.reticleArcs = this.factory!.build(reticle, "ReticleArcs", av, ai, HUD_CYAN, 3)

    // Target-lock frame around the map — tightens while cleaning.
    const lv: number[] = []
    const li: number[] = []
    const lx = MAP_W / 2 + 0.6
    const ly = MAP_H / 2 + 0.7
    pushBracket(lv, li, -lx, ly, 1.5, 1.1, 0.16, 1, -1)
    pushBracket(lv, li, lx, ly, 1.5, 1.1, 0.16, -1, -1)
    pushBracket(lv, li, -lx, -ly, 1.5, 1.1, 0.16, 1, 1)
    pushBracket(lv, li, lx, -ly, 1.5, 1.1, 0.16, -1, 1)
    this.lockBrackets = this.factory!.build(reticle, "LockFrame", lv, li, HUD_CYAN, 3)

    const sv: number[] = []
    const si: number[] = []
    pushRect(sv, si, 0, 0, RETICLE_R * 2 - 0.6, 0.12)
    this.scanSweep = this.factory!.build(reticle, "ScanSweep", sv, si, HUD_ICE, 4).setVisible(false)

    const dv: number[] = []
    const di: number[] = []
    pushChevron(dv, di, 0, 0, 2.2, 0.62, 0.17)
    this.dockVector = this.factory!
      .build(reticle, "DockVector", dv, di, HUD_AMBER, 4)
      .setLocalPosition(0, -3.4)
      .setVisible(false)

    this.buildMap(reticle)
  }

  /** Stylised gyro map: dot grid + boustrophedon cleaning path + dock + tracer. */
  private buildMap(parent: SceneObject): void {
    const map = global.scene.createSceneObject("GyroMap")
    map.setParent(parent)
    map.layer = parent.layer
    map.getTransform().setLocalPosition(new vec3(0, 0, 0.02))
    this.mapGroup = map

    const cols = 11
    const rows = 7
    const dv: number[] = []
    const di: number[] = []
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows; r++) {
        const x = -MAP_W / 2 + (MAP_W / (cols - 1)) * c
        const y = -MAP_H / 2 + (MAP_H / (rows - 1)) * r
        pushRect(dv, di, x, y, 0.17, 0.17)
      }
    }
    this.mapDots = this.factory!.build(map, "MapDots", dv, di, HUD_CYAN, 1).setIntensity(0.32)

    this.pathPoints = this.buildPathPoints()
    this.measurePath()
    const pv: number[] = []
    const pi: number[] = []
    for (let i = 0; i < this.pathPoints.length - 1; i++) {
      const a = this.pathPoints[i]
      const b = this.pathPoints[i + 1]
      pushSegment(pv, pi, a.x, a.y, b.x, b.y, 0.1)
    }
    this.mapPath = this.factory!.build(map, "CleaningPath", pv, pi, HUD_CYAN, 2).setIntensity(0.35)

    const hv: number[] = []
    const hi: number[] = []
    pushBracket(hv, hi, -0.45, 0.45, 0.9, 0.9, 0.14, 1, -1)
    pushBracket(hv, hi, 0.45, -0.45, 0.9, 0.9, 0.14, -1, 1)
    const home = this.pathPoints.length > 0 ? this.pathPoints[0] : new vec2(0, 0)
    this.mapHome = this.factory!
      .build(map, "DockMarker", hv, hi, HUD_ICE, 3)
      .setLocalPosition(home.x, home.y)
      .setIntensity(0.7)

    const tv: number[] = []
    const ti: number[] = []
    pushRect(tv, ti, 0, 0, 0.46, 0.46)
    this.mapTracer = this.factory!
      .build(map, "PathTracer", tv, ti, HUD_ICE, 5)
      .setRotationDeg(45)
      .setLocalPosition(home.x, home.y)
      .setVisible(true)
      .setIntensity(0.85)
  }

  private buildStatusStack(parent: SceneObject): void {
    const stack = global.scene.createSceneObject("StatusStack")
    stack.setParent(parent)
    stack.layer = parent.layer

    this.primaryText = makeGlowText(
      stack,
      "PrimaryLine",
      "STANDBY",
      SIZE_PRIMARY,
      HUD_ICE,
      "center",
      this.hudFont,
      0,
      PRIMARY_Y,
      24
    )
    this.secondaryText = makeGlowText(
      stack,
      "SecondaryLine",
      "LINKING ROBOT",
      SIZE_SECONDARY,
      HUD_CYAN,
      "center",
      this.hudFont,
      0,
      SECONDARY_Y,
      23
    )
    this.scheduleText = makeGlowText(
      stack,
      "ScheduleChip",
      HINTS[0],
      SIZE_MICRO,
      HUD_CYAN,
      "center",
      this.hudFont,
      0,
      SCHEDULE_Y,
      22
    ).setIntensity(0.85)
    this.hintText = this.scheduleText
  }

  private buildBattery(parent: SceneObject): void {
    const group = global.scene.createSceneObject("BatteryGauge")
    group.setParent(parent)
    group.layer = parent.layer
    group.getTransform().setLocalPosition(new vec3(BATT_X, CLUSTER_Y, 0))

    const fv: number[] = []
    const fi: number[] = []
    pushArc(fv, fi, 0, 0, BATT_R, 0.12, BATT_START_DEG, BATT_SWEEP_DEG, 58)
    this.battFrame = this.factory!.build(group, "BattFrame", fv, fi, HUD_RAIL, 1).setIntensity(0.55)
    this.battFill = this.factory!.build(group, "BattFill", [], [], HUD_CYAN, 2)

    this.battValue = makeGlowText(
      group,
      "BattValue",
      "--%",
      SIZE_SECONDARY,
      HUD_ICE,
      "center",
      this.hudFont,
      0,
      0.45,
      22
    )
    this.battMode = makeGlowText(
      group,
      "BattMode",
      "LINK",
      SIZE_TINY,
      HUD_CYAN,
      "center",
      this.hudFont,
      0,
      -1.5,
      22
    )
  }

  /** LOCALIZE / SPOT / SMART / WALL FOLLOW, as a sparse glowing rail. */
  private buildModeRail(parent: SceneObject): void {
    const group = global.scene.createSceneObject("ModeRail")
    group.setParent(parent)
    group.layer = parent.layer
    group.getTransform().setLocalPosition(new vec3(MODE_X, 0, 0))

    const bottom = MODE_ROW_TOP - MODE_ROW_PITCH * (MODE_ROWS.length - 1)
    const sv: number[] = []
    const si: number[] = []
    pushRect(sv, si, -2.9, (MODE_ROW_TOP + bottom) / 2, 0.1, MODE_ROW_TOP - bottom + 1.4)
    this.railSpine = this.factory!.build(group, "RailSpine", sv, si, HUD_RAIL, 1).setIntensity(0.5)

    const cv: number[] = []
    const ci: number[] = []
    pushRect(cv, ci, 0, 0, 0.5, 0.5)
    this.railCaret = this.factory!
      .build(group, "RailCaret", cv, ci, HUD_CYAN, 3)
      .setRotationDeg(45)
      .setLocalPosition(-2.9, MODE_ROW_TOP)

    this.railLabels = []
    for (let i = 0; i < MODE_ROWS.length; i++) {
      this.railLabels.push(
        makeGlowText(
          group,
          "Mode_" + MODE_ROWS[i],
          MODE_ROWS[i],
          SIZE_MICRO,
          HUD_CYAN,
          "center",
          this.hudFont,
          -0.6,
          MODE_ROW_TOP - MODE_ROW_PITCH * i,
          22
        ).setIntensity(0.5)
      )
      this.attachPinch(this.railLabels[i].object, this.railLabels[i], 5.2, 1.6, () => this.onModePinch(i))
    }
  }

  /** Eco / Normal / Boost as a three-notch illuminated track. */
  private buildPowerGauge(parent: SceneObject): void {
    const group = global.scene.createSceneObject("PowerGauge")
    group.setParent(parent)
    group.layer = parent.layer
    group.getTransform().setLocalPosition(new vec3(POWER_X, GAUGE_Y, 0))

    const tv: number[] = []
    const ti: number[] = []
    for (let i = 0; i < 3; i++) {
      pushRect(tv, ti, (i - 1) * POWER_PITCH, 0, 1.7, 0.5)
    }
    this.powerTrack = this.factory!.build(group, "PowerTrack", tv, ti, HUD_RAIL, 1).setIntensity(0.45)

    const fv: number[] = []
    const fi: number[] = []
    pushRect(fv, fi, 0, 0, 1.7, 0.5)
    this.powerFill = this.factory!.build(group, "PowerFill", fv, fi, HUD_CYAN, 2)

    this.powerTag = makeGlowText(
      group,
      "PowerTag",
      "SUCTION",
      SIZE_TINY,
      HUD_CYAN,
      "center",
      this.hudFont,
      0,
      1.45,
      22
    ).setIntensity(0.6)
    this.powerValue = makeGlowText(
      group,
      "PowerValue",
      "NORMAL",
      SIZE_MICRO,
      HUD_ICE,
      "center",
      this.hudFont,
      0,
      -1.5,
      22
    )

    for (let i = 0; i < POWER_LABELS.length; i++) {
      const hit = global.scene.createSceneObject("PowerHit_" + POWER_LABELS[i])
      hit.setParent(group)
      hit.layer = group.layer
      hit.getTransform().setLocalPosition(new vec3((i - 1) * POWER_PITCH, 0, 0.3))
      const slot = i
      this.attachPinch(hit, this.powerValue, 1.8, 2.2, () => this.onPowerPinch(slot))
    }
  }

  /**
   * Start / Dock / Stop and scan sit inside the visor brackets.
   * They are the control panel — not a second object in the scene.
   */
  private buildCommandDeck(parent: SceneObject): void {
    const deck = global.scene.createSceneObject("CommandDeck")
    deck.setParent(parent)
    deck.layer = parent.layer
    deck.getTransform().setLocalPosition(new vec3(0, COMMAND_Y, 0.2))

    const commands: {label: string; command: VacuumCommand}[] = [
      {label: "START", command: VacuumCommand.StartClean},
      {label: "DOCK", command: VacuumCommand.ReturnToDock},
      {label: "STOP", command: VacuumCommand.Stop}
    ]
    const pitch = 5.6
    for (let i = 0; i < commands.length; i++) {
      const spec = commands[i]
      const x = (i - 1) * pitch
      const word = makeGlowText(
        deck,
        "Cmd_" + spec.label,
        spec.label,
        SIZE_SECONDARY,
        HUD_ICE,
        "center",
        this.hudFont,
        x,
        0,
        24
      )
      const barV: number[] = []
      const barI: number[] = []
      pushRect(barV, barI, x, -0.85, 3.4, 0.1)
      this.factory!.build(deck, spec.label + "Bar", barV, barI, HUD_CYAN, 3).setIntensity(0.85)
      this.attachPinch(word.object, word, 3.2, 1.6, () => {
        this.send(spec.command).then((sent) => {
          if (sent) {
            this.setLine(spec.label)
          }
        })
      })
    }

    const scan = makeGlowText(deck, "Cmd_SCAN", "SCAN", SIZE_SECONDARY, HUD_CYAN, "center", this.hudFont, -4.2, -2.8, 23)
    const clear = makeGlowText(deck, "Cmd_CLEAR", "CLEAR", SIZE_SECONDARY, HUD_CYAN, "center", this.hudFont, 4.2, -2.8, 23)
    this.attachPinch(scan.object, scan, 3.6, 1.3, () => this.toggleScan())
    this.attachPinch(clear.object, clear, 3.6, 1.3, () => this.clearScan())
  }

  /** Box collider + SIK pinch on a visor element. Indirect rays, so it works at arm's length. */
  private attachPinch(
    host: SceneObject,
    text: GlowText | null,
    width: number,
    height: number,
    onPinch: () => void
  ): void {
    const collider = host.createComponent("Physics.ColliderComponent") as ColliderComponent
    const shape = Shape.createBoxShape()
    shape.size = new vec3(width, height, 2.5)
    collider.shape = shape
    const interactable = host.createComponent(Interactable.getTypeName()) as Interactable
    interactable.targetingMode = 3
    interactable.onHoverEnter.add(() => {
      if (text) {
        text.setColor(HUD_ICE).setIntensity(1)
      }
    })
    interactable.onHoverExit.add(() => {
      if (text && !this.isFlashing(text)) {
        text.setIntensity(0.62)
      }
    })
    interactable.onTriggerStart.add(() => this.react(text))
    interactable.onTriggerEnd.add(() => {
      const now = getTime()
      if (now - this.lastCommandAt < 1.5) {
        print("[HelmetHud] Ignored extra pinch")
        return
      }
      this.lastCommandAt = now
      onPinch()
    })
  }

  /** Bright flash plus the shared laser tick. Runs for every visor pinch. */
  private react(text: GlowText | null): void {
    if (this.root) {
      playVisorClick(this.root)
    }
    if (!text) {
      return
    }
    text.setColor(HUD_ICE).setIntensity(1.7)
    text.object.getTransform().setLocalScale(new vec3(1.16, 1.16, 1.16))
    this.presses.push({text, age: 0})
  }

  private isFlashing(text: GlowText): boolean {
    for (let i = 0; i < this.presses.length; i++) {
      if (this.presses[i].text === text) {
        return true
      }
    }
    return false
  }

  private tickPresses(dt: number): void {
    const duration = 0.22
    for (let i = this.presses.length - 1; i >= 0; i--) {
      const press = this.presses[i]
      press.age += dt
      const t = press.age / duration
      if (t >= 1) {
        press.text.setIntensity(0.7)
        press.text.object.getTransform().setLocalScale(new vec3(1, 1, 1))
        this.presses.splice(i, 1)
      } else {
        const fade = 1 - t
        press.text.setIntensity(0.7 + 1.0 * fade)
        const scale = 1 + 0.16 * fade
        press.text.object.getTransform().setLocalScale(new vec3(scale, scale, scale))
      }
    }
  }

  private onModePinch(row: number): void {
    if (row === 0) {
      this.presentDemo("SMART", CleaningMode.Methodic)
    } else if (row === 1) {
      this.presentDemo("SPOT", CleaningMode.Spot)
    } else if (row === 2) {
      this.presentDemo("WALL", CleaningMode.WallFollow)
    } else {
      this.pingLocalize()
      this.presentDemo("FIND")
    }
  }

  private onPowerPinch(slot: number): void {
    const power = slot === 0 ? VacuumPower.Eco : slot === 2 ? VacuumPower.Boost : VacuumPower.Normal
    this.presentDemo(POWER_LABELS[slot], undefined, power)
  }

  private async send(
    command: VacuumCommand,
    extra?: {mode?: CleaningMode; power?: VacuumPower}
  ): Promise<boolean> {
    const bridge = this.bridgeHost ?? this.findBridge()
    if (!bridge) {
      print("[HelmetHud] No VacuumDeviceBridge — pinch ignored")
      return false
    }
    print("[HelmetHud] " + command)
    const state = await bridge.getDevice().send({
      command,
      mode: extra?.mode,
      power: extra?.power
    })
    return state.lastMessage.indexOf("Held ") !== 0
  }

  private toggleScan(): void {
    const scan = this.roomScan ?? this.findRoomScan()
    if (!scan) {
      this.setLine("NO SCAN")
      return
    }
    this.scanning = !this.scanning
    scan.setScanning(this.scanning)
    this.setLine(this.scanning ? "SCAN ON" : "SCAN OFF")
  }

  private clearScan(): void {
    const scan = this.roomScan ?? this.findRoomScan()
    this.scanning = false
    if (scan) {
      scan.setScanning(false)
      scan.clearSamples()
    }
    this.send(VacuumCommand.ClearRoomScan)
    this.setLine("MAP CLEAR")
  }

  /** Accessory health — the Maintenance tab's "Good state" as glowing ticks. */
  private buildSysGauge(parent: SceneObject): void {
    const group = global.scene.createSceneObject("SysGauge")
    group.setParent(parent)
    group.layer = parent.layer
    group.getTransform().setLocalPosition(new vec3(SYS_X, GAUGE_Y, 0))

    this.sysTicksOk = this.factory!.build(group, "SysTicksOk", [], [], HUD_CYAN, 2)
    this.sysTicksWarn = this.factory!.build(group, "SysTicksWarn", [], [], HUD_ALERT, 2)

    this.sysTag = makeGlowText(
      group,
      "SysTag",
      "ACCESSORIES",
      SIZE_TINY,
      HUD_CYAN,
      "center",
      this.hudFont,
      0,
      1.45,
      22
    ).setIntensity(0.6)
    this.sysValue = makeGlowText(
      group,
      "SysValue",
      "GOOD STATE",
      SIZE_MICRO,
      HUD_ICE,
      "center",
      this.hudFont,
      0,
      -1.5,
      22
    )
  }

  // ---------------------------------------------------------------------------
  // Live state
  // ---------------------------------------------------------------------------

  private bindBridge(): void {
    const bridge = this.bridgeHost ?? this.findBridge()
    if (!bridge) {
      print("[HelmetHud] No VacuumDeviceBridge found — visor shows static chrome only")
      return
    }
    bridge.getDevice().subscribe((state) => this.onState(state))
  }

  private onState(state: VacuumDeviceState): void {
    if (state.lastCommand !== this.lastCommandSeen) {
      const live =
        state.lastCommand === "StartClean" ||
        state.lastCommand === "Stop" ||
        state.lastCommand === "ReturnToDock"
      this.lastCommandSeen = state.lastCommand
      if (live) {
        this.demoMode = null
        this.demoPower = null
        this.demoRun = null
      }
      if (state.lastCommand === "Localize") {
        this.pingLocalize()
      }
    }
    const mode = this.demoMode ?? state.mode
    const power = this.demoPower ?? state.power
    const run = this.demoRun ?? state.runState
    this.runState = run
    this.mood = HelmetHud.moodFor(run, mode)

    if (this.overrideTimer <= 0 && this.primaryText) {
      this.primaryText.setContent(this.mood.primary)
    }
    if (this.secondaryText) {
      const detail = state.simulation ? "SIM" : "LINK"
      this.secondaryText.setContent(this.mood.secondary + "  ·  " + power.toUpperCase() + "  ·  " + detail)
    }

    this.applyBattery(state)
    this.applyMode({mode: mode} as VacuumDeviceState)
    this.applyPower({power: power} as VacuumDeviceState)
    this.applyAccent()
  }

  private applyBattery(state: VacuumDeviceState): void {
    const pct = Math.max(0, Math.min(100, Math.round(state.batteryPercent)))
    if (this.battValue) {
      this.battValue.setContent(pct + "%")
    }
    if (this.battMode) {
      this.battMode.setContent(state.isCharging ? "CHARGING" : "ON CELL")
      this.battMode.setColor(state.isCharging ? HUD_ICE : HUD_CYAN)
    }
    if (this.battFill && pct !== this.lastBatteryPercent) {
      this.lastBatteryPercent = pct
      const v: number[] = []
      const i: number[] = []
      const sweep = (BATT_SWEEP_DEG * pct) / 100
      const segments = Math.max(1, Math.round((58 * pct) / 100))
      pushArc(v, i, 0, 0, BATT_R, 0.32, BATT_START_DEG, sweep, segments)
      this.battFill.rebuild(v, i)
      this.battFill.setColor(pct <= 20 ? HUD_ALERT : this.mood.accent)
    }
  }

  private applyMode(state: VacuumDeviceState): void {
    const active = HelmetHud.modeRow(state.mode)
    for (let i = 0; i < this.railLabels.length; i++) {
      const isActive = i === active
      this.railLabels[i].setColor(isActive ? HUD_ICE : HUD_CYAN).setIntensity(isActive ? 1 : 0.42)
    }
    if (this.railCaret) {
      const row = active >= 0 ? active : 0
      this.railCaret.setLocalPosition(-2.9, MODE_ROW_TOP - MODE_ROW_PITCH * row)
      this.railCaret.setVisible(active >= 0)
    }
  }

  private applyPower(state: VacuumDeviceState): void {
    const slot =
      state.power === VacuumPower.Eco ? 0 : state.power === VacuumPower.Boost ? 2 : 1
    if (this.powerFill) {
      this.powerFill.setLocalPosition((slot - 1) * POWER_PITCH, 0)
    }
    if (this.powerValue) {
      this.powerValue.setContent(POWER_LABELS[slot])
    }
  }

  private applyAccent(): void {
    const accent = this.mood.accent
    this.reticleArcs?.setColor(accent)
    this.lockBrackets?.setColor(accent)
    this.mapPath?.setColor(accent)
    this.mapTracer?.setColor(mixRgb(accent, HUD_ICE, 0.55))
    this.powerFill?.setColor(accent)
    this.railCaret?.setColor(accent)
    this.sysTicksOk?.setColor(mixRgb(accent, HUD_CYAN, 0.35))
    this.primaryText?.setColor(mixRgb(accent, HUD_ICE, 0.6))
    this.scanSweep?.setColor(mixRgb(accent, HUD_ICE, 0.4))
  }

  private refreshSchedule(): void {
    // The top chip is the voice hint. The program line was a demo placeholder.
  }

  private refreshMaintenance(): void {
    const ok: number[] = []
    const okIdx: number[] = []
    const warn: number[] = []
    const warnIdx: number[] = []
    let failures = 0
    for (let i = 0; i < SYS_TICK_COUNT; i++) {
      const x = (i - (SYS_TICK_COUNT - 1) / 2) * SYS_PITCH
      if (this.maintenanceOk[i]) {
        pushSegment(ok, okIdx, x - 0.22, 0.02, x - 0.04, -0.2, 0.13)
        pushSegment(ok, okIdx, x - 0.04, -0.2, x + 0.26, 0.28, 0.13)
      } else {
        failures++
        pushSegment(warn, warnIdx, x - 0.22, 0.26, x + 0.22, -0.18, 0.13)
        pushSegment(warn, warnIdx, x - 0.22, -0.18, x + 0.22, 0.26, 0.13)
      }
    }
    this.sysTicksOk?.rebuild(ok, okIdx)
    this.sysTicksWarn?.rebuild(warn, warnIdx)
    if (this.sysValue) {
      this.sysValue
        .setContent(failures === 0 ? "GOOD STATE" : "SERVICE x" + failures)
        .setColor(failures === 0 ? HUD_ICE : HUD_ALERT)
    }
  }

  // ---------------------------------------------------------------------------
  // Animation
  // ---------------------------------------------------------------------------

  private animate(): void {
    if (!this.root) {
      return
    }
    const dt = getDeltaTime()
    this.elapsed += dt
    this.tickHint(dt)
    this.tickPresses(dt)

    const mood = this.mood
    const pulse = 0.5 + 0.5 * Math.sin(this.elapsed * Math.PI * 2 * mood.pulseHz)
    const breathe = 0.42 + 0.14 * Math.sin(this.elapsed * 0.9)

    this.chrome?.setIntensity(breathe)
    this.reticleFrame?.setIntensity(0.45 + 0.12 * pulse)

    // Reticle: spins and contracts into a lock while the robot is working.
    const lockTarget = this.runState === VacuumRunState.Cleaning ? 0.86 : 1.0
    const spin = this.runState === VacuumRunState.Cleaning ? 28 : 7
    this.reticleArcs?.setRotationDeg(this.elapsed * spin)
    this.reticleArcs?.setIntensity(0.55 + 0.45 * pulse)
    this.lockBrackets?.setUniformScale(lockTarget + 0.035 * pulse)
    this.lockBrackets?.setIntensity(0.4 + 0.6 * pulse)

    // Scan line sweeps the map while cleaning.
    if (this.scanSweep) {
      if (mood.sweep) {
        const span = RETICLE_R - 0.8
        const phase = (this.elapsed * 0.55) % 1
        const y = -span + 2 * span * (phase < 0.5 ? phase * 2 : 2 - phase * 2)
        this.scanSweep.setVisible(true)
        this.scanSweep.setLocalPosition(0, y)
        this.scanSweep.setIntensity(0.3 + 0.5 * (1 - Math.abs(y) / span))
      } else {
        this.scanSweep.setVisible(false)
      }
    }

    // Dock return vector: a chevron falling toward the dock marker.
    if (this.dockVector) {
      if (mood.dockVector) {
        const phase = (this.elapsed * 1.3) % 1
        this.dockVector.setVisible(true)
        this.dockVector.setLocalPosition(0, -2.6 - 1.6 * phase)
        this.dockVector.setIntensity(1 - Math.abs(phase - 0.35) * 1.3)
      } else {
        this.dockVector.setVisible(false)
      }
    }

    this.animateTracer(dt, mood)
    this.animateRail(dt)

    this.mapDots?.setIntensity(0.28 + 0.1 * pulse)
    this.mapPath?.setIntensity(mood.tracer ? 0.3 + 0.25 * pulse : 0.24)
    this.mapHome?.setIntensity(
      this.runState === VacuumRunState.Returning ? 0.5 + 0.5 * pulse : 0.6
    )
    this.battFill?.setIntensity(0.7 + 0.3 * pulse)
    this.battMode?.setIntensity(this.runState === VacuumRunState.Charging ? 0.55 + 0.45 * pulse : 0.85)
    this.powerFill?.setIntensity(0.65 + 0.35 * pulse)
    this.sysTicksOk?.setIntensity(0.45 + 0.25 * pulse)
    this.sysTicksWarn?.setIntensity(0.4 + 0.6 * pulse)
    this.primaryText?.setIntensity(0.78 + 0.22 * pulse)
    this.secondaryText?.setIntensity(0.7)

    if (this.overrideTimer > 0) {
      this.overrideTimer -= dt
      if (this.overrideTimer <= 0) {
        this.primaryText?.setContent(this.mood.primary)
      }
    }
  }

  private tickHint(dt: number): void {
    if (!this.hintText) {
      return
    }
    if (this.hintHold > 0) {
      this.hintHold -= dt
      return
    }
    this.hintAge += dt
    const pulse = 0.45 + 0.4 * (0.5 + 0.5 * Math.sin(this.elapsed * 3.2))
    this.hintText.setColor(HUD_CYAN).setIntensity(pulse)
    if (this.hintAge < 2.6) {
      return
    }
    this.hintAge = 0
    this.hintIndex = (this.hintIndex + 1) % HINTS.length
    this.hintText.setContent(HINTS[this.hintIndex])
  }

  /** Walks the bright tracer along the cleaning path, forward or home-bound. */
  private animateTracer(dt: number, mood: HudMood): void {
    if (!this.mapTracer || this.pathTotal <= 0) {
      return
    }
    const moving =
      this.runState === VacuumRunState.Cleaning || this.runState === VacuumRunState.Returning
    this.mapTracer.setVisible(true)
    if (!moving) {
      this.mapTracer.setIntensity(0.85)
      return
    }
    const speed = mood.dockVector ? -5.5 : 3.2
    this.tracerDistance += speed * dt
    if (this.tracerDistance > this.pathTotal) {
      this.tracerDistance = 0
    }
    if (this.tracerDistance < 0) {
      this.tracerDistance = mood.dockVector ? 0 : this.pathTotal
    }
    const p = this.pointAtDistance(this.tracerDistance)
    this.mapTracer.setVisible(true)
    this.mapTracer.setLocalPosition(p.x, p.y)
    this.mapTracer.setIntensity(1.1)
  }

  private animateRail(dt: number): void {
    const localizeRow = MODE_ROWS.length - 1
    if (this.localizeFlash > 0) {
      this.localizeFlash -= dt
      const flash = 0.5 + 0.5 * Math.sin(this.elapsed * 26)
      this.railLabels[localizeRow]?.setColor(HUD_ICE).setIntensity(0.4 + 0.9 * flash)
    } else if (this.railLabels.length > localizeRow) {
      this.railLabels[localizeRow].setIntensity(0.32)
    }
    this.railCaret?.setIntensity(0.6 + 0.4 * (0.5 + 0.5 * Math.sin(this.elapsed * 4.4)))
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private buildPathPoints(): vec2[] {
    const points: vec2[] = []
    const rows = 4
    const halfW = MAP_W / 2 - 0.5
    const usableH = MAP_H - 0.9
    const spacing = usableH / (rows - 1)
    for (let r = 0; r < rows; r++) {
      const y = -usableH / 2 + spacing * r
      const leftFirst = r % 2 === 0
      points.push(new vec2(leftFirst ? -halfW : halfW, y))
      points.push(new vec2(leftFirst ? halfW : -halfW, y))
    }
    return points
  }

  private measurePath(): void {
    this.pathLengths = []
    this.pathTotal = 0
    for (let i = 0; i < this.pathPoints.length - 1; i++) {
      const a = this.pathPoints[i]
      const b = this.pathPoints[i + 1]
      const dx = b.x - a.x
      const dy = b.y - a.y
      const len = Math.sqrt(dx * dx + dy * dy)
      this.pathLengths.push(len)
      this.pathTotal += len
    }
  }

  private pointAtDistance(distance: number): vec2 {
    let remaining = distance
    for (let i = 0; i < this.pathLengths.length; i++) {
      const len = this.pathLengths[i]
      if (remaining <= len || i === this.pathLengths.length - 1) {
        const t = len > 0 ? Math.max(0, Math.min(1, remaining / len)) : 0
        const a = this.pathPoints[i]
        const b = this.pathPoints[i + 1]
        return new vec2(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t)
      }
      remaining -= len
    }
    return this.pathPoints[0]
  }

  private static moodFor(runState: VacuumRunState, mode: CleaningMode): HudMood {
    switch (runState) {
      case VacuumRunState.Cleaning:
        return {
          accent: HUD_CYAN,
          primary: "TARGET LOCK",
          secondary: HelmetHud.modeLabel(mode),
          pulseHz: 1.15,
          sweep: true,
          tracer: true,
          dockVector: false
        }
      case VacuumRunState.Returning:
        return {
          accent: HUD_AMBER,
          primary: "RETURN VECTOR",
          secondary: "DOCK INBOUND",
          pulseHz: 1.6,
          sweep: false,
          tracer: false,
          dockVector: true
        }
      case VacuumRunState.Error:
        return {
          accent: HUD_ALERT,
          primary: "ALERT",
          secondary: "SYSTEM FAULT",
          pulseHz: 3.2,
          sweep: false,
          tracer: false,
          dockVector: false
        }
      case VacuumRunState.Paused:
        return {
          accent: HUD_AMBER,
          primary: "HOLD",
          secondary: "LOCK SUSPENDED",
          pulseHz: 0.8,
          sweep: false,
          tracer: false,
          dockVector: false
        }
      case VacuumRunState.Charging:
        return {
          accent: HUD_CYAN,
          primary: "DOCKED",
          secondary: "CHARGING",
          pulseHz: 0.45,
          sweep: false,
          tracer: false,
          dockVector: false
        }
      case VacuumRunState.Idle:
        return {
          accent: HUD_CYAN,
          primary: "STANDBY",
          secondary: "AWAITING ORDER",
          pulseHz: 0.5,
          sweep: false,
          tracer: false,
          dockVector: false
        }
      default:
        return {
          accent: HUD_CYAN,
          primary: "DOCKED",
          secondary: "SYSTEMS NOMINAL",
          pulseHz: 0.45,
          sweep: false,
          tracer: false,
          dockVector: false
        }
    }
  }

  private static modeLabel(mode: CleaningMode): string {
    switch (mode) {
      case CleaningMode.Methodic:
        return "SMART SWEEP"
      case CleaningMode.Spot:
        return "SPOT FOCUS"
      case CleaningMode.WallFollow:
        return "WALL FOLLOW"
      default:
        return "NO PATTERN"
    }
  }

  private static modeRow(mode: CleaningMode): number {
    switch (mode) {
      case CleaningMode.Methodic:
        return 0
      case CleaningMode.Spot:
        return 1
      case CleaningMode.WallFollow:
        return 2
      default:
        return -1
    }
  }

  /**
   * Measures the visible half-extents at the HUD plane and shrinks the layout if
   * the live FOV is narrower than the design envelope. SPECS 27 is roughly square
   * so this is a no-op on device; a tall, narrow Preview panel gets a clean fit
   * instead of clipped chrome.
   */
  private fitScale(cameraObject: SceneObject, distance: number): number {
    const camera = cameraObject.getComponent("Component.Camera") as Camera
    if (!camera) {
      return 1
    }
    const depth = Math.max(1, distance - 1)
    const center = camera.screenSpaceToWorldSpace(new vec2(0.5, 0.5), depth)
    const edgeX = camera.screenSpaceToWorldSpace(new vec2(0, 0.5), depth)
    const edgeY = camera.screenSpaceToWorldSpace(new vec2(0.5, 0), depth)
    const halfW = center.distance(edgeX) / (distance / REF_DISTANCE)
    const halfH = center.distance(edgeY) / (distance / REF_DISTANCE)
    if (halfW < 1 || halfH < 1) {
      return 1
    }
    const fit = Math.min(1, Math.min(halfW / DESIGN_HALF_W, halfH / DESIGN_HALF_H))
    print(
      "[HelmetHud] Visible half-extents " +
        halfW.toFixed(1) +
        " x " +
        halfH.toFixed(1) +
        " cm — fit " +
        fit.toFixed(2)
    )
    return fit
  }

  private resolveCameraObject(): SceneObject | null {
    if (this.sceneObject.getComponents("Component.Camera").length > 0) {
      return this.sceneObject
    }
    const roots = global.scene.getRootObjectsCount()
    for (let i = 0; i < roots; i++) {
      const found = this.findCamera(global.scene.getRootObject(i))
      if (found) {
        return found
      }
    }
    return null
  }

  private findCamera(node: SceneObject): SceneObject | null {
    if (node.getComponents("Component.Camera").length > 0) {
      return node
    }
    const children = node.getChildrenCount()
    for (let i = 0; i < children; i++) {
      const found = this.findCamera(node.getChild(i))
      if (found) {
        return found
      }
    }
    return null
  }

  private findRoomScan(): RoomScanController | null {
    const roots = global.scene.getRootObjectsCount()
    for (let i = 0; i < roots; i++) {
      const found = this.searchRoomScan(global.scene.getRootObject(i))
      if (found) {
        return found
      }
    }
    return null
  }

  private searchRoomScan(node: SceneObject): RoomScanController | null {
    const scripts = node.getComponents("Component.ScriptComponent")
    for (let i = 0; i < scripts.length; i++) {
      const candidate = scripts[i] as RoomScanController
      if (candidate && candidate.setScanning && candidate.clearSamples) {
        return candidate
      }
    }
    const children = node.getChildrenCount()
    for (let c = 0; c < children; c++) {
      const found = this.searchRoomScan(node.getChild(c))
      if (found) {
        return found
      }
    }
    return null
  }

  private findBridge(): VacuumDeviceBridge | null {
    const roots = global.scene.getRootObjectsCount()
    for (let i = 0; i < roots; i++) {
      const found = this.searchBridge(global.scene.getRootObject(i))
      if (found) {
        return found
      }
    }
    return null
  }

  private searchBridge(node: SceneObject): VacuumDeviceBridge | null {
    const scripts = node.getComponents("Component.ScriptComponent")
    for (let i = 0; i < scripts.length; i++) {
      const candidate = scripts[i] as VacuumDeviceBridge
      if (candidate && candidate.getDevice) {
        return candidate
      }
    }
    const children = node.getChildrenCount()
    for (let c = 0; c < children; c++) {
      const found = this.searchBridge(node.getChild(c))
      if (found) {
        return found
      }
    }
    return null
  }
}
