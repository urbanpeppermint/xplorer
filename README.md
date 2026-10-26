# Xplorer

**Spectacles controlling a robot that never heard of AR.**

[Spectacles](https://www.spectacles.com/) is not another pair of AR glasses. Nothing else puts a full spatial computer on your face the way this platform does: hands, voice, a head-locked display, and a development loop that lets you build for the room you are standing in. Spectacles 2024 already proved that. There is still no peer for that kind of wearable.

Xplorer shows what that means when you stop chasing the newest appliance.

This lens starts, docks, and stops a **Rowenta X-Plorer Serie 50** (`RR7387` / `RR7387WH`) — a first-generation, mid-range robot vacuum. No special firmware. No premium cloud kit. The glasses are among the most advanced wearables ever shipped. The robot is ordinary. That is the point: advanced hardware should adopt the devices people already own, not wait for the next SKU.

The future of this computer is not a new gadget for every room. It is a wearable you can prototype on, aimed at the house you already live in.

## The idea

Most smart-home demos assume the latest model and a native SDK. Xplorer assumes the opposite.

The Serie 50 already joins Wi‑Fi. It already obeys the Rowenta Robots app and Amazon Alexa. Spectacles already hears, tracks hands, and draws a display locked to your head. The product is the bridge between those two facts — a control surface you wear, for a machine that was never built for glasses.

We are not chasing trends. We are making the devices we have work with the technology that just arrived.

## What you wear

The control panel is a cyborg-style helmet HUD, parented to the camera. It rides with the head the way a visor sits in front of the eyes — not a floating card in the room.

On that plane:

- **START / DOCK / STOP**, plus room **SCAN / CLEAR**
- voice coaching on the top line of the visor
- battery, a gyro-style map, SMART / SPOT / WALL / FIND, Eco / Normal / Boost
- a mic that opens with the lens, labeled **MIC**, with a ring that moves while it listens
- a short laser tick when a control is pinched

Say **follow me**, **dock**, or **stop**, or pinch the matching word. The physical robot answers.

## How it works

The Serie 50 has no Bluetooth control path we can use from Spectacles. That was never a blocker.

Spectacles and the vacuum share the same Wi‑Fi. A small relay on a Mac takes an HTTP command from the glasses and fires an Amazon Alexa routine through [VoiceMonkey](https://voicemonkey.io/). Alexa already knows the X-Plorer. Rowenta’s cloud moves the robot.

```text
Spectacles  →  Mac relay (Wi‑Fi)  →  VoiceMonkey  →  Alexa  →  Rowenta  →  robot
```

Tokens stay on the computer. The lens only knows the Mac’s address. Full setup: [`bridge/ALEXA_SETUP.md`](bridge/ALEXA_SETUP.md).

The free VoiceMonkey plan covers the three actions that matter:

| Glasses | Robot |
|---|---|
| start / follow me | starts cleaning |
| dock / go home | returns to charge |
| stop | powers off |

Keywords are editable lists on `VacuumVoiceRouter` in Lens Studio. Local Tuya pairing is a dead end on this model and can orphan the vacuum — see [`INCIDENT_TUYA_PATH.md`](INCIDENT_TUYA_PATH.md). `bridge/server.py` is that archived attempt. The live path is `bridge/alexa_relay.py`.

## Stack

| Layer | Choice |
|---|---|
| Wearable | Spectacles (Lens Studio, SIK, AsrModule, InternetModule, World Query) |
| UI | Head-locked additive HUD (`HelmetHud`, `HudGlow`) |
| Voice | Inspector keyword lists → vacuum commands |
| Network | Specs → Mac over Wi‑Fi (`POST /command`) |
| Home | Alexa routines via VoiceMonkey → Rowenta cloud |

Authoring stays where the tooling is strongest. The same scripts ship to Spectacles 2024. One codebase. The workshop and the glasses do not have to be the same generation.

## Run it

```bash
cd bridge
cp alexa_config.example.json alexa_config.json
# paste VoiceMonkey v3 trigger URLs — never commit that file
python3 alexa_relay.py
```

On `VacuumDeviceBridge`: simulation off, endpoint `http://YOUR_MAC_LAN_IP:8788`, Experimental APIs on for plain `http://`. Push the lens. Leave the robot on the dock with a clear floor the first time.

## Layout

```text
Assets/Scripts/Rowenta/   visor, voice, bridge, room scan
Assets/Scripts/ASRQueryController.ts
bridge/alexa_relay.py     live path
bridge/ALEXA_SETUP.md
INCIDENT_TUYA_PATH.md
```

## License

MIT. See [LICENSE](LICENSE).

Rowenta, X-Plorer, Alexa, and Spectacles belong to their owners. Xplorer is an independent demonstration of wearing a control surface for a machine you already have.
