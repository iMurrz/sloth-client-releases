package com.sloth.client.studio;

import com.sloth.client.SlothClient;
import com.sloth.client.module.Module;
import com.sloth.client.module.*;
import com.google.gson.*;
import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.client.Minecraft;
import net.minecraft.client.CameraType;
import net.minecraft.client.multiplayer.resolver.ServerAddress;
import net.minecraft.network.chat.Component;
import java.nio.file.*;
import java.util.*;

/** Explicit server associations and reversible starter layouts. */
public final class Studio {
    public static final Map<String, List<String>> PRESETS = new LinkedHashMap<>();
    static {
        PRESETS.put("Mining", List.of("fps", "coordinates", "inventory", "held_item_hud", "cooldowns", "direction"));
        PRESETS.put("Casual", List.of("fps", "coordinates", "clock", "biome_hud"));
        PRESETS.put("Multiplayer", List.of("fps", "ping", "coordinates", "inventory", "clock"));
        PRESETS.put("PvP", List.of("fps", "ping", "cps", "keystrokes", "armor_status", "potion_effects", "saturation"));
        PRESETS.put("Survival", List.of("fps", "coordinates", "day_counter", "held_item_hud", "hunger_hud", "biome_hud"));
        PRESETS.put("Building", List.of("fps", "coordinates", "looking_at", "light_hud", "held_item_hud", "direction"));
    }
    private static JsonObject data = new JsonObject();
    private static String connected = "";
    private static String cachedAddress="",cachedServer="";
    private static JsonObject previous;
    private static Path file() { return FabricLoader.getInstance().getConfigDir().resolve("sloth-client/studio.json"); }
    private static Path returnFile() { return file().resolveSibling("server-profile-return.json"); }
    public static void load() {
        try { if (!Files.isSymbolicLink(file()) && Files.isRegularFile(file()) && Files.size(file()) < 131072) data = JsonParser.parseString(Files.readString(file())).getAsJsonObject(); }
        catch (Exception e) { SlothClient.LOG.warn("Could not read Studio preferences"); }
        if (!data.has("servers") || !data.get("servers").isJsonObject()) data.add("servers", new JsonObject());
        // Recover the pre-server setup if the previous game stopped before disconnect could restore it.
        try {
            if (!Files.isSymbolicLink(returnFile()) && Files.isRegularFile(returnFile()) && Files.size(returnFile()) < 512_000) {
                if (ModuleManager.restore(JsonParser.parseString(Files.readString(returnFile())).getAsJsonObject())) Files.deleteIfExists(returnFile());
            }
        } catch (Exception e) { SlothClient.LOG.warn("Could not recover pre-server setup"); }
    }
    public static boolean needsSetup() { JsonElement e = data.get("setupDone"); return e == null || !e.isJsonPrimitive() || !e.getAsJsonPrimitive().isBoolean() || !e.getAsBoolean(); }
    public static void finishSetup() { data.addProperty("setupDone", true); persist(); }
    public static String server() {
        var s = Minecraft.getInstance().getCurrentServer();
        if (s == null || Minecraft.getInstance().level == null) return "";
        if(s.ip.equals(cachedAddress))return cachedServer;
        ServerAddress a = ServerAddress.parseString(s.ip);
        cachedAddress=s.ip;cachedServer=a.getHost().toLowerCase(Locale.ROOT) + ":" + a.getPort();
        return cachedServer;
    }
    public static String assigned() { JsonElement e = data.getAsJsonObject("servers").get(server()); return e != null && e.isJsonPrimitive() ? e.getAsString() : ""; }
    public static void assign(String profile) {
        String address = server();
        if (address.isEmpty()) return;
        var servers = data.getAsJsonObject("servers");
        if (profile.isEmpty()) servers.remove(address);
        else if (ModuleManager.profiles().contains(profile) && (servers.has(address) || servers.size() < 100)) servers.addProperty(address, profile);
        persist();
    }
    public static void tick(Minecraft mc) {
        if (mc.level == null) PhotoMode.stop();
        String next = server();
        if (connected.equals(next)) return;
        PhotoMode.stop();
        if(!restorePrevious())return;
        connected = next;
        if (next.isEmpty()) return;
        String profile = assigned();
        if (profile.isEmpty()) return;
        JsonObject before = ModuleManager.snapshot();
        try {
            Files.createDirectories(returnFile().getParent());
            Path tmp = returnFile().resolveSibling("server-profile-return.json.tmp");
            if(Files.isSymbolicLink(tmp)||Files.isSymbolicLink(returnFile()))throw new java.io.IOException("Linked server recovery files");
            SettingsHistory.checkpoint();
            Files.writeString(tmp, before.toString());
            Files.move(tmp, returnFile(), StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
        } catch (Exception e) { SlothClient.LOG.warn("Automatic profile loading skipped: could not preserve previous setup"); return; }
        if (ModuleManager.loadProfile(profile)) {
            previous = before;
            if (mc.player != null) mc.player.displayClientMessage(Component.literal("Sloth loaded " + profile + ". Your previous setup returns when you leave."), false);
        } else { try { Files.deleteIfExists(returnFile()); } catch (Exception ignored) {} }
    }
    public static void leave() {
        PhotoMode.stop();
        restorePrevious();
        connected = "";
    }
    private static boolean restorePrevious() {
        if (previous == null) return true;
        if (ModuleManager.restore(previous)) {
            previous = null;
            try { Files.deleteIfExists(returnFile()); } catch (Exception e) { SlothClient.LOG.warn("Could not clear pre-server recovery file"); }
            return true;
        }
        return false;
    }
    public static JsonObject previewPreset(String name) {
        var target=ModuleManager.snapshot();var modules=target.getAsJsonObject("modules");var ids=PRESETS.get(name);if(ids==null)return target;
        int left=0,right=0;for(HudModule h:ModuleManager.hudModules()){var o=modules.getAsJsonObject(h.id);o.addProperty("enabled",ids.contains(h.id));if(!ids.contains(h.id))continue;boolean compact=Set.of("fps","ping","cps","clock","day_counter").contains(h.id);o.addProperty("x",compact?.015f:.78f);o.addProperty("y",.04f+(compact?left++:right++)*.19f);o.getAsJsonObject("settings").addProperty("scale",1.0);o.getAsJsonObject("settings").addProperty("hud_group","");}target.addProperty("hudHidden",false);return target;
    }
    public static boolean preset(String name) {
        List<String> ids = PRESETS.get(name);
        if (ids == null) return false;
        int left = 0, right = 0;
        for (HudModule h : ModuleManager.hudModules()) {
            h.setEnabled(ids.contains(h.id));
            if (!ids.contains(h.id)) continue;
            boolean compact = Set.of("fps", "ping", "cps", "clock", "day_counter").contains(h.id);
            h.x = compact ? 0.015f : 0.78f;
            h.y = 0.04f + (compact ? left++ : right++) * 0.19f;
            h.scale.set(1.0);
        }
        ModuleManager.hudHidden = false;
        ModuleManager.activeProfile = name + " starter";
        ModuleManager.save(); finishSetup(); return true;
    }
    private static void persist() {
        try {
            Files.createDirectories(file().getParent());
            Path tmp = file().resolveSibling("studio.json.tmp"); if(Files.isSymbolicLink(file())||Files.isSymbolicLink(tmp))throw new java.io.IOException("Linked Studio files"); Files.writeString(tmp, data.toString());
            Files.move(tmp, file(), StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
        } catch (Exception e) { SlothClient.LOG.warn("Could not save Studio preferences"); }
    }
}
