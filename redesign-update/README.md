# Sloth Client redesign and fixes (source changes only)

Changed files only, with the same paths as in the Sloth Client source tree. Not a release: nothing here is built, signed or tested yet.

Launcher
- `src/redesign.css` and `src/index.html`: pink angular redesign layer (remove the `<link>` to undo).

In-game mod (`client-mod/`)
- `Ui.java`, `SlothButton.java`, `MenuFrame.java`: cut corners, deeper pink, glowing menu window.
- `SlothTitleScreen.java`: pink glow, grid floor, title glow.
- `HudEditorScreen.java`, `QuickWheelScreen.java`: pink grid and tint.

Fixes
- `package.json`, `package-lock.json`: semver declared as a runtime dependency.
- `.gitignore`: signing keys, env files and local profiles.
- `src/lib/development-update.js`, `src/main.js`: prune stale downloaded installers.
- `src/lib/updater.js`: limit the signature download size.
- `src/lib/auth/session.js`, `src/lib/auth/accounts.js`: keep rotated refresh tokens; set aside a corrupt accounts file.
- `launchwrapper/.../TokenWrapper.java`: fail clearly when the session token is missing.

Not yet done: `gradlew build` for `client-mod`, a packaged launcher run, and the signed release.
