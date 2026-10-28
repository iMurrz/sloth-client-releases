package com.sloth.client.studio;

import com.sloth.client.SlothClient;
import com.google.gson.*;
import net.fabricmc.loader.api.FabricLoader;
import java.nio.file.*;
import java.util.*;

/** Local, bounded undo history. Rapid edits are grouped; account data is never read. */
public final class SettingsHistory {
    public record Entry(long time, JsonObject setup) {}
    private static final List<Entry> entries = new ArrayList<>();
    private static JsonObject previous;
    private static long last;
    private static Path file() { return FabricLoader.getInstance().getConfigDir().resolve("sloth-client/settings-history.json"); }
    public static List<Entry> entries() { return List.copyOf(entries); }
    public static void checkpoint() { last = 0; }
    public static void initialize(JsonObject state) {
        entries.clear();
        try {
            if (!Files.isSymbolicLink(file()) && Files.isRegularFile(file()) && Files.size(file()) <= 4_000_000) {
                for (JsonElement e : JsonParser.parseString(Files.readString(file())).getAsJsonArray()) {
                    JsonObject o = e.getAsJsonObject();
                    JsonObject setup = o.getAsJsonObject("setup");
                    if (setup == null || !setup.has("modules") || !setup.get("modules").isJsonObject()) throw new IllegalArgumentException("Invalid history entry");
                    entries.add(new Entry(o.get("time").getAsLong(), setup));
                    if (entries.size() == 24) break;
                }
            }
        } catch (Exception e) { entries.clear(); SlothClient.LOG.warn("Could not read settings history"); }
        previous = state.deepCopy();
    }
    public static void record(JsonObject state) {
        if (previous == null) { previous = state.deepCopy(); return; }
        if (previous.equals(state)) return;
        long now = System.currentTimeMillis();
        if (now - last > 2000) {
            entries.addFirst(new Entry(now, previous.deepCopy()));
            while (entries.size() > 24) entries.removeLast();
            last = now;
            persist();
        }
        previous = state.deepCopy();
    }
    private static void persist() {
        try {
            JsonArray out = new JsonArray();
            for (Entry e : entries) { JsonObject o = new JsonObject(); o.addProperty("time", e.time()); o.add("setup", e.setup()); out.add(o); }
            Files.createDirectories(file().getParent());
            Path tmp = file().resolveSibling("settings-history.json.tmp");
            if(Files.isSymbolicLink(file())||Files.isSymbolicLink(tmp))throw new java.io.IOException("Linked history files");
            Files.writeString(tmp, out.toString());
            Files.move(tmp, file(), StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
        } catch (Exception e) { SlothClient.LOG.warn("Could not save settings history"); }
    }
}
