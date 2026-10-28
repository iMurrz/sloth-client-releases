# Sloth Client identity

The active launcher/native source is fully renamed, including classes, Java packages, Fabric mod ID, assets, configuration keys, instance ID, Electron application ID, IPC, helper filenames and update-signature context. Workspace: E:\Sloth-Launcher. Repository: iMurrz/sloth-client-releases. Version:0.0.2.

Local owned profile/game folders, settings filenames/default instance IDs and native configuration folders were migrated while no client/game process was detected. Original signing key retained in the renamed local release-key folder; it is never packaged. External folder-based preference sync and portable exports made by older builds require separate conversion. Historic releases and Git history are retained as history; this build does not carry their branding.

This intentionally changes internal identity. The server bridge must use sloth:hud and Sloth identifiers; it has not been updated or live-tested here. Normal Minecraft server access remains independent of the bridge. Minecraft asset/resource IDs are preserved to keep textures compatible with the game.

No trusted Windows certificate yet. Manual installation only. On other computers, migrate old profiles/instances separately before deleting any old data. The new application ID may create a separate installed application entry. No automatic downgrade, signature bypass or silent trust approval was added. Session Seal may request a new review for rebuilt native files.
