# Xplorer

**Specs in the house you already live in.**

[Specs](https://www.spectacles.com/) (Snap’s AR glasses; formerly Spectacles) is wearable spatial computing: you see the room, you use your hands, you speak, and you run software that was built for that moment. That alone is useful. What makes Specs the platform to build on is that it is also a **prototype computer** — a full development loop on your face, aimed at the world around you.

## Specs, then the house

Specs gives you the basics every spatial wearable needs — stereo view, hand tracking, voice, networking — and then the part that changes how you build: you can iterate a lens, put it on, and stand next to the thing you are controlling. That is not a phone demo. That is a workshop you carry.

Most “smart home” projects wait for the latest SKU and a native SDK. Xplorer does the opposite. The Serie 50 already had Wi‑Fi, the Rowenta Robots app, and Amazon Alexa. It did **not** offer a usable Bluetooth control path for Specs. So we reverse-engineered the reachable stack: keep the OEM pairing, stay on Wi‑Fi, and drive the robot through the interface it already obeys — Alexa — triggered from the glasses by a small Mac relay and [VoiceMonkey](https://voicemonkey.io/).

That is the thesis in one line. Specs does not need every appliance to be new. Specs needs a path. Once you have the path, an old vacuum is a smart-home endpoint.

## The lens

A cyborg-style visor HUD rides with the user’s head. Pinch **START**, **DOCK**, or **STOP**, or say **follow me**, **dock**, or **stop**. The physical robot answers.

Also on the visor:

- voice coaching on the top line
- battery, map, SMART / SPOT / WALL / FIND, Eco / Normal / Boost
- **SCAN / CLEAR** for Specs World Query floor samples
- a mic that opens with the lens, labeled **MIC**

## How Specs reaches the robot

```text
Specs  →  Mac relay (Wi‑Fi)  →  VoiceMonkey  →  Alexa  →  Rowenta cloud  →  robot
```

Tokens stay on the computer. The lens only knows the Mac’s address. Setup: [`bridge/ALEXA_SETUP.md`](bridge/ALEXA_SETUP.md). Live relay: `bridge/alexa_relay.py`.

| Specs | Robot |
|---|---|
| start / follow me | starts cleaning |
| dock / go home | returns to charge |
| stop | powers off |

Keywords are editable on `VacuumVoiceRouter`. Do not re-pair this vacuum into Smart Life / Tuya IoT — that path can orphan the device ([`INCIDENT_TUYA_PATH.md`](INCIDENT_TUYA_PATH.md)).

## Stack

| Layer | Choice |
|---|---|
| Wearable | Specs — Lens Studio, SIK, AsrModule, InternetModule, World Query |
| UI | Visor HUD (`HelmetHud`, `HudGlow`) |
| Voice | Keyword lists → vacuum commands |
| Network | Specs → Mac over Wi‑Fi (`POST /command`) |
| Home | Alexa via VoiceMonkey → Rowenta |

## Run it

```bash
cd bridge
cp alexa_config.example.json alexa_config.json
# paste VoiceMonkey v3 trigger URLs — never commit that file
python3 alexa_relay.py
```

On `VacuumDeviceBridge`: simulation off, endpoint `http://YOUR_MAC_LAN_IP:8788`, Experimental APIs on for plain `http://`.

**Push the Specs build last** — author and debug where the tooling is strongest, then ship the lens to Specs hardware for the on-device demo. Leave the robot on the dock with a clear floor the first time.

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

Rowenta, X-Plorer, Alexa, and Specs / Spectacles belong to their owners. Xplorer is an independent Specs demonstration of adopting the home you already have.
