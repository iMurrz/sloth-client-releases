package com.sloth.client.studio;

import com.sloth.client.module.ModuleManager;
import com.google.gson.*;
import net.fabricmc.loader.api.FabricLoader;
import java.nio.file.*;

/** Explicit local recovery baseline; keybinds and account information are excluded. */
public final class WorkingSetup {
    private static Path file() { return FabricLoader.getInstance().getConfigDir().resolve("sloth-client/working-setup.json"); }
    public static JsonObject read() {
        try {
            if (Files.isSymbolicLink(file()) || !Files.isRegularFile(file()) || Files.size(file()) > 4_000_000) return null;
            var state = JsonParser.parseString(Files.readString(file())).getAsJsonObject();
            return state.has("modules") && state.get("modules").isJsonObject() ? state : null;
        } catch (Exception e) { return null; }
    }
    public static boolean mark() {
        Path temp = file().resolveSibling("working-setup.json.partial");
        try {
            Files.createDirectories(file().getParent());
            if (Files.isSymbolicLink(file()) || Files.isSymbolicLink(temp)) return false;
            Files.writeString(temp, ModuleManager.snapshot().toString());
            try { Files.move(temp, file(), StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE); }
            catch (AtomicMoveNotSupportedException e) { Files.move(temp, file(), StandardCopyOption.REPLACE_EXISTING); }
            return true;
        } catch (Exception e) { return false; }
    }
}
