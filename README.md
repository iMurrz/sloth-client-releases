# Sloth Client

[![Release integrity](https://github.com/iMurrz/sloth-client-releases/actions/workflows/release-integrity.yml/badge.svg)](https://github.com/iMurrz/sloth-client-releases/actions/workflows/release-integrity.yml)

GitHub checks published installer, feed and inventory signatures and download hashes. Open the badge for the verified version and evidence. This check verifies file integrity and authenticity; Windows publisher signing and gameplay validation are separate.

Sloth Client is an independent Windows Minecraft launcher and in-game client with original pink sloth artwork. Choose your own worlds and multiplayer servers.

## 0.0.46 Mod inspection repair

Mod Manager inspection now defaults to the bundled Java 21 runtime, fixing `javaVersion is not defined`. Explicit Java-version compatibility checks are preserved. The narrow paired AppleSkin optional JEI warning fix remains in place; genuine missing-class errors remain visible.

## Gameplay efficiency

The 0.0.29 audit removes render-thread performance-file writes, unnecessary Zoom saves and a damaged-mod inspection crash. Fresh Sloth instances use Unlimited FPS, VSync off and minimized-only idle limiting; existing settings and modpacks are preserved. All nine performance mods are enabled by default. HUD and rendering efficiency changes apply automatically.


## Download

**[Download Sloth Client 0.0.46 for Windows](https://github.com/iMurrz/sloth-client-releases/releases/download/v0.0.46/Sloth-Client-Setup-0.0.46.exe)**

[Release notes and integrity signatures](https://github.com/iMurrz/sloth-client-releases/releases/tag/v0.0.46)

**Unsigned development release:** trusted Windows publisher signing is postponed. Windows may display an unknown-publisher or SmartScreen warning. Separate Ed25519 integrity signatures do not replace Windows publisher trust. Install this version manually once to replace older builds with failing update checks. This development build checks for newer releases, downloads and verifies the signed Sloth update feed and installer, then offers Install and restart inside the client. Installation requires explicit confirmation and Minecraft must be closed. Production updates still require trusted Windows publisher signing.

Close Minecraft before installing. This release preserves the existing Sloth installer identity and keeps your accounts, worlds and profiles. Back up important instances before changing versions.

## Resource packs and review

No personal texture pack is included or enabled automatically. Existing Murful copies and selections in Sloth instances are removed on startup with Minecraft closed; unrelated packs are preserved. Older installers that included the pack are retired after this release is verified.

The 0.0.21 reliability review included focused Undo and SVG motion checks, isolated launcher captures and five offline native menu captures. The 0.0.23 update received syntax/native build checks, isolated launcher visual review and package integrity checks. No new automated test suites, live multiplayer exercise or installer execution were performed for 0.0.23.

The 0.0.29 audit passed over 100 automated checks, isolated launcher UI flows, native Minecraft startup/mixin checks and a synthetic offline world stress exercise with 34 HUD modules enabled. The latest 600 focused stress intervals had median 1.5741 ms, p95 2.2448 ms and zero intervals over 50 ms on the test PC. This stationary scene is not a Lunar comparison or a guarantee for other systems or servers. No installer execution or user-world changes were performed.

## Features

- Always-on text-HUD sample/width reuse within each render, cached HUD registry and clock formatters, lighter coordinate formatting and once-per-frame Focus mode evaluation, with no refresh-rate reduction.
- Launcher decoration animations pause during gameplay and while hidden/unfocused.
- Backed-up managed mod cleanup reconciles obsolete renderer dependency builds while preserving tracked player imports.

- In-game Appearance Studio: smooth Sloth HUD typography or resource-pack font, live sample, menu density, motion pace and reviewed Glass/Focused/Minimal HUD styles.
- Matching HUD font measurements across editing and previews, visually eased sliders and clearer keyboard focus. Chat, Tab and server resource-pack glyphs keep their own rendering.

- Nine HUD screen-position presets with adjustable edge spacing, plus a 1 px / 10 px movement toggle. Presets prepare fields for explicit Apply.

- Manual HUD placement: typed pixel coordinates and size, one-pixel nudges, centering, defaults, Revert and explicit Apply; integrated with HUD editor Undo.
- Minecraft launch repair for the uninitialized startup-timeline status error.

- Session Planner with reviewed Mining, PvP, Building and Casual setups, up to 30 saved local profiles per instance, inspectable proposals and guarded Undo.
- Cancellable verified file/update downloads, dependency version/conflict advice and a local startup timeline.
- Exact support-report preview with section selection before saving; nothing is uploaded automatically.
- HUD aspect previews and spacing snaps, saved profile keybindings, optional crosshair context colours, passive Connection Health and active-pack reload controls.
- Verify preserved previous-launcher files before opening recovery.

- Safer preset Undo preserves unrelated settings and refuses to overwrite later conflicting edits. Setup reviews use readable labels and responsive controls.
- HUD safe-zone guides, corrected group movement/resizing, compact Quick Wheel layouts and direct searchable shortcut rebinding.
- Resource-pack failure notices with classified guidance and a Game Log folder shortcut.
- Optional Haunted/Nightmare jumpscares: six original animated creatures with moving jaws, eyes, bodies and spider legs, plus lunging entrances. Separate saved opt-in and cycling preview; suppressed during gameplay, dialogs, reduced motion and loss of focus.

- HUD grouping, overlap warnings, realistic armour previews, Crosshair Studio and a configurable hold-to-open quick wheel.
- Select individual setup changes before applying presets, profiles, history restores or preference imports. In-game review includes Undo.
- Accessibility setup reviews, server resource-pack display help, launch-readiness checks and clearer recovery scopes.

- Optional Halloween launcher theme in Settings: a blinking sharp-toothed Sloth, corner webs, crawling spiders, flying bats, embers and layered fog. Choose Subtle, Haunted or Nightmare atmosphere intensity. Theme and animation choices are saved. Reduced motion takes priority; turning Halloween off restores your selected accent.

- Download Center: Activity, Discover Mods, Mod Manager, Modpacks and Saved Projects.
- Toolbox: Overview, Game Care, Trust Center and Recovery.
- Client Studio: Client Tools and Setup Studio tabs, including presets, setup checks, storage and support reports.
- World Manager removed; Minecraft worlds and existing backups are preserved.

- Custom Crosshair can match the ore you look at, including deepslate variants and optional mineral blocks. Enable it in Right Shift > Visual > Custom Crosshair.
- Permanent modern Sloth title screen and themed Minecraft menus; profile imports and resets cannot disable core appearance.
- Sloth Client launcher and native menus, editable HUDs and utility settings. Home banner uses the original pink Sloth logo and Sloth wording.
- Mod and instance management, resource-pack support, launch history and recovery tools.
- ViaFabricPlus is included and on by default for supported server versions; select a protocol in Multiplayer.
- Local saved friends, favorites and current-server activity.
- Optional Minecraft Services friends lookup; real-account operation remains unverified.
- CurseForge website browsing and pack ZIP inspection. API downloads require an approved API key and compatible pack versions.

Minecraft is pinned to 1.21.11/Fabric. No server is bundled, promoted, monitored or automatically joined. The server bridge, prison HUD, server alerts and command menu are removed. Your own multiplayer list remains available. Waypoints are completely removed. Legacy branded entries in existing instances are removed with a backup on startup when Minecraft is closed.

Third-party mod combinations, live gameplay, installation and authenticated service flows have not all been verified.

- Direction HUD now uses separate cardinal and degree rows, font-aware spacing and bounds checks to prevent overlapping labels.

## Integrity and status

Source checks, native compilation, package/source comparison, resource-pack/native-JAR equality, detached Ed25519 signatures and full inventory verification are checked locally. This does not guarantee the absence of unknown vulnerabilities. Public-trust signing, own Microsoft application registration, distribution/privacy reviews and managed runtime maintenance remain work in progress.

This repository distributes compiled artifacts and documentation. Private development source, account data and private signing keys are not uploaded.

Sloth Client is not an official Minecraft product and is not approved by or associated with Mojang, Microsoft or CurseForge.

