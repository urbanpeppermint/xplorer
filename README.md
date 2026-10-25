# Xplorer

**Your old robot vacuum, on your face.**

Xplorer is a [Snap Spectacles](https://www.spectacles.com/) lens that starts, docks, and stops a **Rowenta X-Plorer Serie 50** (`RR7387` / `RR7387WH`). The glasses in this demo are Spectacles 2024. The vacuum is one of the first generations of that robot line. Neither of them is the newest thing in the category. That is the point.

The future of this kind of computer is not a new gadget for every room. It is a wearable you can prototype on, aimed at the house you already live in. Spectacles is that bench. It is one of a kind, the best wearable we have had our hands on, and the one that actually lets you vibe-code and reverse-engineer a real product into something you wear.

We did not wait for a newer vacuum, a newer app, or a trend cycle. We took the devices we had and made the day easier.

A pinch, or the words "follow me", and the robot leaves the dock.

## The pitch

People throw away working machines because a newer one speaks the newer protocol. Then they wait for an official integration that never arrives for the thing they already paid for.

Xplorer is the other move.

Look at what the device already knows how to do. The Serie 50 already obeys the Rowenta Robots app and Amazon Alexa. It already has a start, a dock, and a stop. Spectacles already has a microphone, hand tracking, and a display locked to your head. The missing piece was a small, honest bridge between those two facts.

That is the whole product:

- the glasses you can develop on like a computer
- the appliance you already own
- a relay you can read in an afternoon

This is how a smart house gets built from here. Not by replacing every object. By giving the objects you have a new front door, and wearing that front door.

Spectacles is unusually good at this. You can talk a lens into existence, inspect the scene, push it to the glasses, and stand in the room with the robot. When the local protocol is a dead end, you can turn around and adopt the interface the manufacturer already shipped. Vibe coding and reverse engineering are the same loop: watch the real device, keep what works, throw away the path that bricks it.

## What the visor is

The control panel is not a floating card in the room. It is a helmet HUD, parented to the camera, the way a visor sits in front of your eyes.

On that plane, in the language of the Rowenta app:

- **START / DOCK / STOP**, plus **SCAN / CLEAR**
- a coaching line where a fake schedule used to be: "say follow me to start", "say dock", "say wall"
- battery, a gyro-style map, SMART / SPOT / WALL / FIND, Eco / Normal / Boost
- a mic that is already listening, drawn as the word **MIC**, with a ring that only sweeps while it hears you
- a short laser tick and a flash when a control is pinched

Follow, dock, and stop move the physical robot. Boost, spot, wall, pause, and find light the visor. Those extra words are the features a paid voice-trigger plan would add. They are on screen so a demo can show the whole product. They are not sent to Alexa, and the visor does not pretend a missing routine succeeded.

The dot on the map moves only while the robot is cleaning or going home. The rest of the time it stays still.

## How a first-generation vacuum takes an order

The Serie 50 is a Tuya Wi-Fi robot. It is not a later RobEye HTTP robot. Specs cannot open the vacuum's local socket, and on this model that socket is closed anyway. Pairing it into Smart Life or Tuya IoT to "get a local key" is the wrong path. It tends to orphan the robot. Read [`INCIDENT_TUYA_PATH.md`](INCIDENT_TUYA_PATH.md) before you are tempted. `bridge/server.py` is the archived LAN attempt. It is not the live path.

The live path uses the front door Rowenta already built.

```text
Spectacles
  voice ("follow me") or a pinch on the visor
        │  HTTP POST /command
        ▼
Mac relay  (bridge/alexa_relay.py, port 8788)
        │  HTTPS, one VoiceMonkey trigger
        ▼
Alexa routine
  When: VoiceMonkey "rowenta start" | "rowenta dock" | "rowenta stop"
  Action: Smart Home → X-Plorer Serie 50 → power on, charge, or power off
        │
        ▼
Rowenta cloud → the robot on the floor
```

The glasses never see the Alexa token. The token lives in `bridge/alexa_config.json` on the computer. The lens only knows the Mac's address.

VoiceMonkey's free plan allows three routine triggers. That is exactly the product surface that moves metal:

| You say or pinch | VoiceMonkey trigger | The robot |
|---|---|---|
| follow me, start, go, vacuum | `rowenta start` | starts cleaning |
| dock, go home, charge | `rowenta dock` | returns to the dock |
| stop, off, cancel | `rowenta stop` | powers off |

Keywords are comma-separated lists on `VacuumVoiceRouter` in the Inspector. Stop is checked before dock, dock before start, and a keyword has to be a whole word. "Off" does not fire inside another word.

### The toggle, and why a start can kill itself

On this robot, Alexa power is a toggle. The first pulse starts the motors. A second start, or a stop in the same breath, turns them off again. A pinch that lands on two words, or a microphone that is still open, will do that.

The relay claims the slot **before** it calls VoiceMonkey, and it drops a second Start, Stop, Dock, or Pause for 4 seconds. The lens has the same hold, shared by the visor and the microphone. One `rowenta start` routine must contain one action. A second Alexa routine on that same trigger still runs, and no relay can cancel it. The Mac log prints `fire StartClean` once per real start. If the robot dies after a single fire, the extra action is in the Alexa app.

## What we actually invented here

1. **Adopt the interface the machine already has.** Local Tuya was a closed door. Alexa was an open one. The innovation is refusing to brick a working robot in order to look more technical.

2. **A relay small enough to read.** `bridge/alexa_relay.py` is one Python file. `GET /health`, `GET /state`, `POST /command`. The lens speaks the same JSON a simulator speaks. Point `VacuumDeviceBridge` at port 8788 and the physical robot answers.

3. **A head-locked visor instead of a menu.** Rowenta's own features, drawn as additive glow on a plane parented to the camera. Distance and scale are inspector numbers. The hint line replaced a fake "tomorrow 13:50" program chip, because a demo should teach the words that work.

4. **Voice as a list you can edit.** Current Spectacles ASR (`AsrModule`), not the deprecated voice-ML block. The mic arms itself when the lens starts. Pinch closes it. Pinch again opens it.

5. **Honest demo features.** Commands with no webhook update the visor and do not call Alexa. The video can show boost, spot, and wall. The robot is not lied to.

6. **One codebase, two Lens Studio generations.** The work was authored where the agent tools run (Lens Studio 5.24) and worn on Spectacles 2024 through Lens Studio 5.15. Shared scripts use `text.font` and `text.worldSpaceRect`, which both compilers accept. The newer editor is a workshop. The older glasses are the product. That split is the thesis, not a compromise.

7. **The glasses scan the room themselves.** `RoomScanController` samples the floor with World Query. The Serie 50's gyro map is a session map. It cannot take an uploaded no-go zone. We did not fake one.

## Run it

You need Spectacles, Lens Studio, a Mac on the same Wi-Fi, the Rowenta Robots app, the Alexa app, and a free VoiceMonkey account. Full click-path: [`bridge/ALEXA_SETUP.md`](bridge/ALEXA_SETUP.md).

```bash
cd bridge
cp alexa_config.example.json alexa_config.json
# paste three VoiceMonkey v3 trigger URLs. Never commit that file.
python3 alexa_relay.py
```

On `VacuumDeviceBridge`:

- `useSimulation` off
- `bridgeEndpointUrl` = `http://YOUR_MAC_LAN_IP:8788`
- Experimental APIs on, so the glasses may call plain `http://`

Push the lens to the glasses. Say "follow me", or pinch START.

`POST /command` moves the real robot. Leave it on the dock with a clear floor the first time.

Plain HTTP is a demo path. A store build wants this same relay behind HTTPS, with the token still on a server, still out of the lens.

## Layout

```text
Assets/Scripts/Rowenta/
  HelmetHud.ts            head-locked visor, pinch deck, hint line
  HudGlow.ts              runtime additive glow
  VacuumDeviceBridge.ts   sim or HTTP, shared start-hold
  VacuumVoiceRouter.ts    phrases → commands
  VacuumTypes.ts          the Serie 50 command model
  VisorClick.ts           short laser tick
  RoomScanController.ts   World Query floor samples
Assets/Scripts/ASRQueryController.ts
bridge/alexa_relay.py     the live robot path
bridge/server.py          archived Tuya LAN attempt, not the demo
bridge/ALEXA_SETUP.md
INCIDENT_TUYA_PATH.md     why Smart Life pairing is off limits
```

Rowenta's instruction manual and app screenshots are not in this repository. They are Rowenta's, and the behavior we depend on is public: the Robots app, Alexa, and the [Serie 50 FAQ](https://www.rowenta.com/instructions-for-use/csp/2211401005).

## License

MIT. See [LICENSE](LICENSE).

The Rowenta name, the X-Plorer, and Spectacles belong to their owners. This project is an independent demo of wearing a control surface for a machine you already have.
