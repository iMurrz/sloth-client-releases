# Sloth Client

Sloth Client is an independent Windows Minecraft launcher and in-game client with original pink sloth artwork. Choose your own worlds and multiplayer servers.

## Download

**[Download Sloth Client 0.0.20 for Windows](https://github.com/iMurrz/sloth-client-releases/releases/download/v0.0.20/Sloth-Client-Setup-0.0.20.exe)**

[Release notes and integrity signatures](https://github.com/iMurrz/sloth-client-releases/releases/tag/v0.0.20)

**Unsigned development release:** trusted Windows publisher signing is postponed. Windows may display an unknown-publisher or SmartScreen warning. Separate Ed25519 integrity signatures do not replace Windows publisher trust. Install this version manually once to replace older builds with failing update checks. This development build checks for newer releases, downloads and verifies the signed Sloth update feed and installer, then offers Install and restart inside the client. Installation requires explicit confirmation and Minecraft must be closed. Production updates still require trusted Windows publisher signing.

Close Minecraft before installing. This release preserves the existing Sloth installer identity and keeps your accounts, worlds and profiles. Back up important instances before changing versions.

## Resource packs and review

No personal texture pack is included or enabled automatically. Existing Murful copies and selections in Sloth instances are removed on startup with Minecraft closed; unrelated packs are preserved. Older installers that included the pack are retired after this release is verified.

This release fixes a startup import fault, restores Toolbox initialization and improves enlarged text layouts. The 0.0.10 review captured all 21 launcher pages and 33 offline in-game screens. The later navigation and control maintenance changes have not received a new live gameplay review. Authenticated services and live server gameplay remain separate verification work.

## Features

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
