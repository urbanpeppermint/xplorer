# Spectacles 2024 handoff

The 5.15 project is `/Users/elsafz/Documents/XPLORER_15.5` (folder name is `XPLORER_15.5`).

The click-by-click guide for the other Lens Studio window is:

`/Users/elsafz/Documents/XPLORER_15.5/BUILD_IN_THIS_WINDOW.md`

The checklist that window updates, and this window reads, is:

`/Users/elsafz/Documents/XPLORER_15.5/STATUS.md`

Open both trees together with:

`/Users/elsafz/Documents/XPLORER.code-workspace`

Keep this Lens Studio on the 5.24 project. CLAD does not attach to 5.15.

Script `.ts` files and `visor_laser.wav` are symlinked into the 5.15 project. Edit them here. Do not symlink `.meta` files or copy `HudGlow.mat` / `HudGlowUnlit.mat` (empty passes). The 5.15 window creates `HudGlowLive` itself with the Unlit shader.
