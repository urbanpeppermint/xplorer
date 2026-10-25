# Peak: on-device Specs testing

**North star = feature demo on glasses, not Lens Studio Preview.**

## Delivery order (locked)

| Phase | Where | Goal |
|-------|--------|------|
| **1 — CLAD / LS 5.24 (NOW)** | This project + MCP + Preview (Specs override) | Build UI, room scan, bridge, voice, demo modes. Debug here — tooling is smooth. |
| **2 — Live robot on CLAD** | Same, Mac bridge + RR7387 on LAN | Prove Start/Dock while still on CLAD. |
| **3 — 5.15.4 ship (LAST)** | Downgrade / open on 5.15.4 + old Specs | Only after Phase 1–2 are solid. Expect package/API friction; don’t do day‑to‑day debug there. |

Do **not** jump to 5.15.4 early — it will slow iteration.

Your Mac LAN IP right now: **`192.168.178.68`** (re-check if Wi‑Fi changes).

## BLE study (RR7387 + Specs) — done properly

| Question | Finding |
|----------|---------|
| Do Specs support BLE GATT? | **Yes** — `BluetoothCentralModule` (scan/connect/read/write). **On-device only** — BLE does **not** work in Preview. |
| Does RR7387 document BLE control? | **No.** Official FAQ/IFU only describe **Wi‑Fi SoftAP** pairing (`SEB_ACCESS_POINT`), 2.4 GHz, Rowenta Robots app. Spec sheets list **Wi‑Fi**, not Bluetooth control. |
| Could it still advertise Tuya BLE? | Possible for *provisioning* on some Tuya OEMs (service `0xFD50`), but that protocol is encrypted, needs cloud `local_key`, and is **not** a documented vacuum Start/Dock API. `ha-tuya-ble` targets small BLE gadgets (fingerbots), not this sweeper class. |
| Specs → vacuum over BLE alone? | **Not a reliable demo path** for RR7387 without reverse‑engineering + keys. Do a 5‑minute phone scan (nRF Connect) while robot is in pairing mode — if no useful GATT, close BLE for this model. |
| Specs Mobile Kit (phone↔glasses BLE)? | Exists, but the **phone** still talks to the vacuum (Wi‑Fi/Tuya). Extra app surface — not “no third party.” |

**Demo implication:** BLE is attractive because it only runs on glasses — but **this vacuum’s public control plane is Wi‑Fi/Tuya**, not BLE. For a working glasses demo, use **Specs HTTP → Mac bridge → Tuya LAN**, or a scripted sim if the robot isn’t linked yet.

## REA concept (Spectacles AC demo pattern)

Reference: [morluto/rea](https://github.com/morluto/rea) — *Reverse Engineer Anything* (agent MCP for apps/binaries/network), not a device SDK.

What the IG “control AC from Specs without the vendor app” pattern actually is:

```text
1. Own device + own vendor app (authorized)
2. REA (or JADX/mitm/pcap) → discover how the app talks to the device
   (BLE GATT / local HTTP / MQTT / proprietary frames)
3. Re-implement THAT protocol in a Specs Lens
   (BluetoothCentralModule and/or InternetModule)
4. Demo: glasses talk to the appliance — vendor app UI is not in the loop
```

| Piece | Role |
|-------|------|
| REA | Investigation tool — finds endpoints, UUIDs, payloads, crypto |
| Specs BLE/HTTP | Runtime — only after the protocol is known |
| Vendor app | Often still needed once for Wi‑Fi onboarding; not needed *during* the glasses demo if local control was recovered |

**For RR7387:** same *concept* applies (RE the Rowenta Robots APK / traffic). Likely rediscovery = Tuya local/cloud DPs — which is what `bridge/` + tinytuya already uses as the **community-known** result of that RE. A REA campaign is worth it if we find a **simpler Specs-native path** (e.g. open BLE GATT like some ACs). It is **not** faster than tinytuya for a near-term glasses demo unless BLE/local HTTP shows up in a phone scan + capture.

**Demo order stays:** (1) Lens on your Specs (5.15.4 if needed) → (2) live command path (bridge or Specs-native after RE) → (3) polish.

## Hard constraints

| Constraint | What it means |
|------------|----------------|
| Demo target | **Glasses** — Preview is only a build aid |
| Specs ≠ localhost | Glasses must call `http://192.168.178.68:8787`, not `127.0.0.1` |
| HTTP needs Experimental APIs | Project Settings → enable Experimental APIs for local `http://` |
| Same Wi‑Fi | Specs + Mac (+ vacuum for live) on one LAN |
| Hardware / LS version | You need **5.15.4-compatible Specs**. This project is currently LS **5.24 / CLAD**. **Downgrade may be required before any glasses push** |

## Stage A — Specs ↔ Mac (do this first, today)

No vacuum keys required.

```bash
cd bridge
./start.sh --probe
```

In Lens Studio (`ControlPanel` → VacuumDeviceBridge):

- `useSimulation` = **false**
- `bridgeEndpointUrl` = **`http://192.168.178.68:8787`**

Then:

1. Enable **Experimental APIs**
2. **Preview Lens → Connect Specs** (wired USB or same Wi‑Fi)
3. Push Lens to glasses
4. On panel: tap **Start** — status should show `PROBE echo OK: StartClean`
5. On Mac terminal you should see `[bridge] 192.168.…` request logs

**Pass criteria:** glasses UI updates from Mac bridge responses.

Mac firewall: allow Python inbound **8787** if prompts appear.

## Stage B — Specs ↔ Mac ↔ RR7387 (live vacuum)

1. Pair robot in Rowenta Robots app  
2. `python -m tinytuya wizard` → fill `bridge/config.json`  
3. `./start.sh` (no `--probe`)  
4. Re-push Lens; tap **Start / Dock** — robot must move  

**Pass criteria:** physical clean / dock from Specs panel.

## Stage C — Room scan on device

With World Query on hardware:

1. Panel → **Scan On/Off**  
2. Point + pinch floor samples in real space  

## If push to glasses fails (5.15.4)

Stop polishing Preview. Prioritize:

1. Open / migrate project in **Lens Studio 5.15.4**  
2. Reinstall SIK / UIKit / RSG / WorldQuery packages for that version  
3. Re-run Stage A on the actual device  

See root `README.md` → *5.15.4 downgrade plan*.
