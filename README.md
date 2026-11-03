# Sloth Client

[![Release integrity](https://github.com/iMurrz/sloth-client-releases/actions/workflows/release-integrity.yml/badge.svg)](https://github.com/iMurrz/sloth-client-releases/actions/workflows/release-integrity.yml)

Sloth Client is an independent Windows Minecraft launcher and in-game client. It is not an official Minecraft product and is not approved by or associated with Mojang or Microsoft.

## Latest version: 1.2.0

**[Download Sloth Client 1.2.0 for Windows](https://github.com/iMurrz/sloth-client-releases/releases/download/v1.2.0/Sloth-Client-Setup-1.2.0.exe)**

[Current release notes and integrity signatures](https://github.com/iMurrz/sloth-client-releases/releases/tag/v1.2.0)

This release adds a local cape collection and progression system with only the 14 selected Sloth capes, cape studios, quests, capes-only crates and a 50-tier pass. It also adds an optional visual add-on for nearby entity outlines, tracers and information labels; it starts disabled. Cape ownership and progression are local to each account and instance. The prepared online backend is not connected or hosted, so other players will not see these capes through Sloth.

Only the latest release is retained in this repository.

## Updates and verification

The launcher can discover, download and verify the signed development update, then offer **Install and restart**. Close Minecraft before installing. Accounts, worlds and profiles are preserved; keep backups of important instances.

GitHub's Release integrity workflow checks the published installer, update metadata and file-inventory signatures and hashes. Ed25519 signatures verify Sloth release authenticity and are separate from Windows publisher trust.

**Windows trusted-publisher signing remains pending.** Windows may show an unknown-publisher or SmartScreen warning. Installer execution and update restart were not tested for this release.
