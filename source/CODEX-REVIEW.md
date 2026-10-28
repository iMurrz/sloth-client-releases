# For review

This is the full Sloth Client source (launcher, Fabric mod, launchwrapper, QA plugin, scripts). Build outputs, node_modules, signing keys and personal paths are excluded; `HANDOFF.md` has the local username replaced with `<you>`.

Recent changes to review (also listed in `../redesign-update/README.md`):
- Launcher redesign: `src/redesign.css`, `src/index.html`, frameless window in `src/main.js` (`titleBarStyle: 'hidden'` plus overlay).
- In-game look: `client-mod/.../screen/Ui.java` (cut corners, palette), `MenuFrame.java`, `SlothButton.java` (PIXEL style), `SlothScreen.java` (`pixel()`), `HudEditorScreen.java`, `QuickWheelScreen.java`.
- New title screen: `SlothTitleScreen.java` (layered petals, wordmark, cream menu, loaded bar, swaying sloths).
- Earlier fixes: semver runtime dependency, stale installer pruning, bounded `.sig` read, rotated refresh token persistence, corrupt accounts file handling, TokenWrapper missing-token error.
- Version bumped to 1.1.0.

Known: the in-game changes were syntax-checked only; `gradlew build` and a visual pass on the title screen are still needed. `pose().rotate(...)` in SlothTitleScreen is new to this code base.
