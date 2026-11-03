# Sloth Client

[![Release integrity](https://github.com/iMurrz/sloth-client-releases/actions/workflows/release-integrity.yml/badge.svg)](https://github.com/iMurrz/sloth-client-releases/actions/workflows/release-integrity.yml)

Sloth Client is an independent Windows Minecraft launcher and in-game client. It is not an official Minecraft product and is not approved by or associated with Mojang or Microsoft.

## Latest version: 1.2.1

**[Download Sloth Client 1.2.1 for Windows](https://github.com/iMurrz/sloth-client-releases/releases/download/v1.2.1/Sloth-Client-Setup-1.2.1.exe)**

[Current release notes and integrity signatures](https://github.com/iMurrz/sloth-client-releases/releases/tag/v1.2.1)

This release adds a Skins & Account section that links to NameMC, previews imported skin PNGs, saves skin loadouts, and applies a chosen loadout to your signed-in Minecraft Java account. The cape collection contains only the 14 selected Sloth capes. An optional visual add-on for nearby entity outlines, tracers and information labels starts disabled. Cape ownership and progression are local to each account and instance; the prepared online backend is not hosted or connected.

Only the latest release is retained in this repository.

## Updates and verification

The launcher can discover, download and verify the signed development update, then offer **Install and restart**. Close Minecraft before installing. Accounts, worlds and profiles are preserved; keep backups of important instances.

GitHub's Release integrity workflow checks the published installer, update metadata and file-inventory signatures and hashes. Ed25519 signatures verify Sloth release authenticity and are separate from Windows publisher trust.

**Windows trusted-publisher signing remains pending.** Windows may show an unknown-publisher or SmartScreen warning. Installer execution and update restart were not tested for this release.
