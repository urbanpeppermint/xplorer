# Incident report — incorrect Tuya / Smart Life unlock path (Serie 50)

**Status:** Acknowledged error in agent guidance  
**Device:** Rowenta X-Plorer Serie 50 (RR7387 / RR7387WH)  
**Platform:** Specs Lens + Mac TinyTuya bridge prototype  
**Impact:** ~1 week lost on a non-viable unlock; robot removed from Rowenta Robots; Smart Life / Tuya Smart never discovered the device; user currently cannot re-pair on iPhone

## What went wrong

Guidance treated “pair in Smart Life → link iot.tuya.com → tinytuya wizard” as the default path for RR7387.

That path is the standard TinyTuya recipe for **generic** Tuya / Smart Life devices. **Serie 50 is OEM-locked to Rowenta Robots** (Groupe SEB SoftAP `SEB_ACCESS_POINT`). Official FAQ only documents Rowenta Robots pairing. Smart Life / Tuya Smart do not reliably discover this product. Deleting the robot from Rowenta Robots to chase Smart Life was the wrong action.

## Correct facts (should have been the gate)

| Fact | Implication |
|------|-------------|
| Control plane is Tuya Wi‑Fi under OEM firmware | Some Tuya tooling may apply later; SoftAP / app ownership is Rowenta Robots |
| SoftAP = `SEB_ACCESS_POINT` | Not `SmartLife-XXXX` — generic app auto-scan often finds nothing |
| iot.tuya.com Link App Account | Lists Smart Life / Tuya Smart accounts, **not** Rowenta Robots OEM |
| Specs cannot speak Tuya TCP | A bridge or cloud relay is still needed for glasses — but that does **not** justify wiping the OEM pairing first |

## Harm caused

1. User spent substantial time on iot.tuya.com / Smart Life / Tuya Smart with **0 devices found** every attempt.  
2. Robot was disconnected from the only supported app.  
3. User now blocked from normal phone control until Rowenta Robots re-pairing succeeds on iPhone.  
4. Specs live-demo work was delayed behind a false dependency.

## Correct recovery priority

1. **Restore Rowenta Robots pairing** (phone control first). See recovery checklist below.  
2. Keep Specs UI / room scan / `--probe` work independent of live Tuya keys.  
3. Only after OEM pairing works: extract `local_key` **without** migrating to Smart Life (OEM capture / alternate key path).  
4. Do **not** recommend deleting Rowenta Robots again for Smart Life.

## iPhone recovery checklist (official Serie 50 FAQ)

1. Forget stale Wi‑Fi: Settings → Wi‑Fi → forget **`SEB_ACCESS_POINT`** if listed. Restart iPhone.  
2. Use a **separate visible 2.4 GHz** SSID (not a combined 2.4/5 name if the robot never sees it). Phone + robot + box close together.  
3. Full Wi‑Fi reset on robot (undocked):  
   - Hold Start **3 s** → off  
   - Hold Start **~20 s** until **double beep**  
   - Hold Start **3 s** → off again  
4. Power on. Hold Start **~5 s** until light **flashes orange**.  
5. Confirm SoftAP: in iPhone Wi‑Fi list you should see **`SEB_ACCESS_POINT`**.  
6. Open **Rowenta Robots** → Add device → follow prompts. When iOS asks to join **`SEB_ACCESS_POINT`**, tap **Join**. Stay on that network (no internet is normal).  
7. After Wi‑Fi password step, if cloud fails: turn **mobile data ON** so the phone can finish cloud registration while SoftAP handoff completes. Check phone date/time.  
8. If Join fails repeatedly: restart iPhone, re-enter orange blink, try again (Rowenta FAQ).

If SoftAP never appears: reset sequence did not stick — repeat step 3–5 before blaming the app.

## Accountability

This incident is an **agent guidance failure**: recommending OEM wipe + Smart Life without verifying Serie 50 SoftAP / app lock first. Docs in `bridge/README.md` are updated to mark that path as unsafe for RR7387.
