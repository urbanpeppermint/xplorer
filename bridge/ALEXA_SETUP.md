# Alexa relay — real glasses voice → robot (Serie 50)

Confirmed working: the robot obeys **Rowenta Robots** and **Amazon Alexa**. Since
Spectacles cannot call Alexa directly, we trigger an Alexa **routine** through a
webhook. The relay keeps the webhook token on the Mac, not in the Lens.

```text
Specs Lens ("eat this")  --HTTP /command-->  alexa_relay.py (Mac)
      --HTTPS webhook-->  Alexa routine  -->  Rowenta cloud  -->  robot
```

## One-time setup

### 1. Confirm Alexa controls the robot
Amazon Alexa app → the X-Plorer Serie 50 device → toggle power / say
"Alexa, start the vacuum". Robot must move. (Already confirmed.)

### 2. Create an Alexa trigger bridge (VoiceMonkey)
VoiceMonkey is a free, sanctioned Alexa skill that gives each routine an HTTPS
trigger URL.

1. Sign up at voicemonkey.io and enable the **VoiceMonkey** skill in the Alexa app.
   Amazon login happens only inside the Alexa app, not on the VoiceMonkey website.
2. In VoiceMonkey, add a **Routine Trigger**. Names allow letters, numbers, and
   spaces only — use `rowenta start`, not `rowenta-start`. Copy the **device ID**
   shown on that card (it may differ from the name). Create one **API token**.
3. In the Alexa app, create a **Routine**:
   - **When:** Smart Home → `Alexa Voice Monkey v3` → `rowenta start`
   - **Add action → Smart Home** → **X-Plorer Serie 50** → start / power on.
     Do not pick Skills. "Open VoiceMonkey" does not move the robot.
   - **Hear Alexa from:** your iPhone (`This device`) if you have no Echo.
4. Press VoiceMonkey's **Trigger** on `rowenta start`. The robot must move before
   you use the Mac relay.
5. Build the URL (v3). Reuse the same token. Only the device ID changes:
   `https://api-v3.voicemonkey.io/trigger?token=YOUR_TOKEN&device=YOUR_DEVICE_ID`

### Free plan: three triggers only

VoiceMonkey’s free plan allows **3 Routine Triggers**. Use them for:

| VoiceMonkey name | Alexa action on the X-Plorer | Config key |
|---|---|---|
| `rowenta start` | Power on / start | `StartClean` |
| `rowenta dock` | Mode → Charge | `ReturnToDock` |
| `rowenta stop` | Power off | `Stop` |

Do not create pause or boost. Alexa’s When list only shows triggers that already exist in VoiceMonkey. `rowenta stop` appears there only after that third trigger is saved.

### 3. Fill the relay config
```bash
cd bridge
cp alexa_config.example.json alexa_config.json
# paste your real trigger URLs into alexa_config.json
```

### 4. Dry-run, then live
```bash
python alexa_relay.py --dry-run     # prints which webhook WOULD fire
python alexa_relay.py                # live — fires Alexa routines
```
Test from the Mac:
```bash
curl -s -X POST http://127.0.0.1:8788/command -d '{"command":"StartClean"}'
```
Robot should start a few seconds later.

### 5. Point the Lens at the relay
`RowentaXplorerApp / ControlPanel` → **VacuumDeviceBridge**:
- `useSimulation` = **false**
- `bridgeEndpointUrl` = `http://YOUR_MAC_LAN_IP:8788`
- Enable **Experimental APIs** for plain `http://` (demo only).

The existing `HttpVacuumDevice` already POSTs `{command,...}` to `/command`, so no
Lens code change is needed to send commands. The voice router's "eat this" maps to
`StartClean` (+ optional `SetPower:Boost`).

## Latency (honest)
Spoken phrase → glasses ASR (~1s) → relay → VoiceMonkey → Alexa cloud → Rowenta
cloud → robot. Expect **~2–5s** end to end. Real, not instant.

## Command surface
Alexa exposes power on/off, mode, and suction level for this robot — enough for
Start / Dock / Pause / Stop / Boost. No "drive to this spot" (robot has no manual
steering).

## Publishable later
Plain `http://` + Experimental APIs is demo-only. To publish: host this relay
logic on HTTPS (e.g. Snap Cloud / a small cloud function) and point the Lens at the
`https://` URL — then Experimental APIs can be off and no token ships in the Lens.

## Security
`alexa_config.json` holds your trigger tokens. Keep it gitignored. Never commit it.
