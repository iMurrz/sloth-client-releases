# Minecraft Services friends review

October 1, 2026. Mojang now has an official Java friends system; a private hosted service is not necessarily required if Sloth can obtain permitted access to that system. This corrects the earlier statement about all global friends/presence needing our own hosting.

The owner-provided https://api.minecraftservices.com/friends returned HTTP 401 without authentication. No real account token was sent during this review. A 401 does not establish third-party API permission or authenticated availability.

Primary protocol evidence: Mojang's version_manifest_v2.json resolves 26.2-snapshot-7 to package d32cc738531eea2c0a94b11d5e0dccde190e432a. Its authlib 7.0.72 artifact is 147289 bytes with SHA1 9a13a92cf8b0a00b8dd32600aade72b89d5ed15a. Downloaded library bytes matched both and were inspected locally with Java tooling in build/friends-api-review (excluded from application packaging). No Mojang implementation code or game binary is redistributed by this feature.

The library declares /friends and /presence routes. FriendsListResponse has friends/incomingRequests/outgoingRequests of FriendDto(profileId,name). PresenceResponse has presence records with profileId/status/lastUpdated and extra join metadata. Sloth returns only sanitized friend names/IDs and recognized display states, not join connection details. Read-only HTTP GETs use a Minecraft session token in the main process, fixed official HTTPS origin, no redirects, ten-second timeouts and a 256 KB response cap. Counts are bounded to 1000 per list. Refresh requests share an in-flight job and are throttled to once per minute per account. Access failures are displayed; they do not trigger a privacy bypass, synthetic friendship or fallback to guessed global activity. Partial presence failure shows unknown status.

UI: Friends > Load Minecraft friends. Manual load only; no automatic service polling or presence publishing. Incoming/outgoing requests are counted but cannot be accepted, sent or declined in this implementation. Changing the selected account clears displayed results. Saved local friends and their same-server roster indicator remain separate from official friends. The in-game panel currently uses the local list, not official global presence. Game remains pinned to 1.21.11; the newer library was inspected for protocol evidence and was not installed into the game.

No authenticated/live friends call, invitation, account modification or real-game test was performed. Syntax validation only in this turn. Official guidance does not establish Sloth API approval. Existing application registration, signing and asset review prerequisites remain.

Sources:
- https://www.minecraft.net/en-us/article/friends-list-for-java-edition (includes a correction withdrawing earlier P2P release claims)
- https://feedback.minecraft.net/hc/en-us/articles/45790287863437-Minecraft-Java-Edition-26-2-Snapshot-7
- https://piston-meta.mojang.com/mc/game/version_manifest_v2.json
- https://libraries.minecraft.net/com/mojang/authlib/7.0.72/authlib-7.0.72.jar
