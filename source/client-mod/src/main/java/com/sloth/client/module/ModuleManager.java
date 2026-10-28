package com.sloth.client.module;

import com.sloth.client.SlothClient;
import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.Font;
import net.minecraft.client.gui.GuiGraphics;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;
import java.util.stream.Stream;

/** Registry, persistence, profiles and server rules for every module. */
public final class ModuleManager {
    private static final Gson GSON = new GsonBuilder().setPrettyPrinting().create();
    private static final Pattern PROFILE_NAME = Pattern.compile("[A-Za-z0-9 _-]{1,24}");
    private static final Map<String, Module> MODULES = new LinkedHashMap<>();
    private static final Map<Class<?>, Module> TYPE_LOOKUPS = new java.util.HashMap<>();
    private static List<Module> moduleRegistry = List.of();
    private static List<HudModule> hudRegistry = List.of();
    private static Set<String> serverBlocked = Set.of();
    public static boolean hudHidden;
    public static boolean hudInF3;
    public static String activeProfile = "Default";
    private static String storageError = "";
    public static String saveStatus() { return storageError.isEmpty() ? "Saved locally · changes apply immediately" : storageError; }

    private ModuleManager() {}

    public static void register(Module... modules) {
        for (Module m : modules) MODULES.put(m.id, m);
        TYPE_LOOKUPS.clear();
        moduleRegistry = List.copyOf(MODULES.values());
        hudRegistry = MODULES.values().stream().filter(HudModule.class::isInstance).map(HudModule.class::cast).toList();
    }

    public static List<Module> all() { return moduleRegistry; }
    public static Module get(String id) { return MODULES.get(id); }

    @SuppressWarnings("unchecked")
    public static <T extends Module> T get(Class<T> type) {
        Module cached=TYPE_LOOKUPS.get(type);
        if(cached!=null)return (T)cached;
        for (Module m : moduleRegistry) if (type.isInstance(m)) {TYPE_LOOKUPS.put(type,m);return (T) m;}
        throw new IllegalStateException("Module not registered: " + type.getSimpleName());
    }

    public static List<HudModule> hudModules() {
        return hudRegistry;
    }

    // ---------- server rules ----------

    public static boolean isServerBlocked(String id) {
        Module module = MODULES.get(id);
        return serverBlocked.contains(id) && (module == null || !module.isAlwaysEnabled());
    }

    /** Optional module restrictions disable features and release their temporary state. */
    public static void setServerBlocked(Set<String> ids) {
        Set<String> previous = serverBlocked;
        serverBlocked = Set.copyOf(ids);
        for (Module m : MODULES.values()) {
            if (!m.isAlwaysEnabled() && m.isEnabled() && serverBlocked.contains(m.id) && !previous.contains(m.id)) m.onServerBlocked();
        }
    }

    // ---------- lifecycle ----------

    public static void tick(Minecraft mc) {
        for (Module m : MODULES.values()) if (m.isActive()) m.tick(mc);
    }

    public static void renderHud(GuiGraphics g) {
        Minecraft mc = Minecraft.getInstance();
        if (hudHidden || mc.options.hideGui || (!hudInF3 && mc.getDebugOverlay().showDebugScreen()) || mc.screen instanceof com.sloth.client.screen.HudEditorScreen) return;
        if(com.sloth.client.studio.TemporaryControls.clean)return;
        List<String> focusHidden=com.sloth.client.studio.TemporaryControls.focus?com.sloth.client.studio.Preferences.ids("focusHud"):List.of();
        Font font = com.sloth.client.screen.MenuFont.hud();
        for (HudModule h : hudModules()) if (h.isActive() && h.hasContent() && !focusHidden.contains(h.id) && !com.sloth.client.module.impl.ReferenceFeatures.Streamer.hideHud(h.id)) h.render(g, font, false);
    }

    // ---------- persistence ----------

    private static Path dir() { return FabricLoader.getInstance().getConfigDir().resolve("sloth-client"); }
    private static Path configFile() { return dir().resolve("modules.json"); }
    private static Path profileDir() { return dir().resolve("profiles"); }

    public static JsonObject snapshot() {
        JsonObject root = new JsonObject();
        JsonObject modules = new JsonObject();
        for (Module m : MODULES.values()) {
            JsonObject o = new JsonObject();
            o.addProperty("enabled", m.isEnabled());
            o.addProperty("favorite", m.favorite);
            if (m instanceof HudModule h) { o.addProperty("x", h.x); o.addProperty("y", h.y); }
            JsonObject settings = new JsonObject();
            for (Setting<?> s : m.settings()) settings.add(s.id, s.toJson());
            o.add("settings", settings);
            modules.add(m.id, o);
        }
        root.add("modules", modules);
        root.addProperty("hudHidden", hudHidden);
        root.addProperty("hudInF3", hudInF3);
        root.addProperty("activeProfile", activeProfile);
        var options = Minecraft.getInstance().options;
        // Early callers can capture module state without inventing video defaults.
        if (options == null) return root;
        JsonObject video = new JsonObject();
        video.addProperty("renderDistance", options.renderDistance().get());
        video.addProperty("simulationDistance", options.simulationDistance().get());
        video.addProperty("fpsLimit", options.framerateLimit().get());
        video.addProperty("vsync", options.enableVsync().get());
        video.addProperty("shadows", options.entityShadows().get());
        video.addProperty("entityDistance", options.entityDistanceScaling().get());
        root.add("video", video);
        JsonObject bindings=new JsonObject();
        for(var key:options.keyMappings) bindings.addProperty(key.getName(),net.fabricmc.fabric.api.client.keybinding.v1.KeyBindingHelper.getBoundKeyOf(key).getName());
        root.add("keybindings",bindings);
        return root;
    }

    private static void apply(JsonObject root) {
        JsonObject modules = root.has("modules") && root.get("modules").isJsonObject() ? root.getAsJsonObject("modules") : new JsonObject();
        for (Module m : MODULES.values()) {
            JsonElement el = modules.get(m.id);
            if (el == null || !el.isJsonObject()) continue;
            JsonObject o = el.getAsJsonObject();
            if (o.has("favorite")) m.favorite = o.get("favorite").getAsBoolean();
            if (m instanceof HudModule h) {
                if (o.has("x")) h.x = clamp01(o.get("x").getAsFloat());
                if (o.has("y")) h.y = clamp01(o.get("y").getAsFloat());
            }
            JsonObject settings = o.has("settings") && o.get("settings").isJsonObject() ? o.getAsJsonObject("settings") : new JsonObject();
            for (Setting<?> s : m.settings()) s.fromJson(settings.get(s.id));
            if (o.has("enabled")) m.setEnabled(o.get("enabled").getAsBoolean());
        }
        if (root.has("hudHidden")) hudHidden = root.get("hudHidden").getAsBoolean();
        if (root.has("hudInF3")) hudInF3 = root.get("hudInF3").getAsBoolean();
        if (root.has("activeProfile") && validProfileName(root.get("activeProfile").getAsString())) activeProfile = root.get("activeProfile").getAsString();
        if(root.has("keybindings")&&root.get("keybindings").isJsonObject()){
            var bindings=root.getAsJsonObject("keybindings");var options=Minecraft.getInstance().options;
            for(var key:options.keyMappings)if(bindings.has(key.getName())){String name=bindings.get(key.getName()).getAsString();if(name.length()>100||!name.matches("key\\.(keyboard|mouse|scancode)\\.[a-zA-Z0-9_.-]+"))throw new IllegalArgumentException("Invalid saved key");key.setKey(com.mojang.blaze3d.platform.InputConstants.getKey(name));}
            net.minecraft.client.KeyMapping.resetMapping();
        }
        if (root.has("video") && root.get("video").isJsonObject()) {
            var o = Minecraft.getInstance().options;
            var v = root.getAsJsonObject("video");
            if (v.has("renderDistance")) o.renderDistance().set(Math.clamp(v.get("renderDistance").getAsInt(), 2, 32));
            if (v.has("simulationDistance")) o.simulationDistance().set(Math.clamp(v.get("simulationDistance").getAsInt(), 5, 32));
            if (v.has("fpsLimit")) o.framerateLimit().set(Math.clamp(v.get("fpsLimit").getAsInt(), 10, 260));
            if (v.has("vsync")) o.enableVsync().set(v.get("vsync").getAsBoolean());
            if (v.has("shadows")) o.entityShadows().set(v.get("shadows").getAsBoolean());
            if (v.has("entityDistance")) { double d = v.get("entityDistance").getAsDouble(); if (Double.isFinite(d)) o.entityDistanceScaling().set(Math.clamp(d, 0.5, 5.0)); }
        }
    }

    private static float clamp01(float v) { return Float.isFinite(v) ? Math.max(0f, Math.min(1f, v)) : 0f; }

    public static void load() {
        JsonObject before=snapshot();
        before.remove("video"); before.remove("keybindings");
        try {
            if (Files.exists(configFile())) {
                if(Files.isSymbolicLink(configFile()) || Files.size(configFile())>512_000) throw new IOException("Invalid module config file");
                JsonObject saved = JsonParser.parseString(Files.readString(configFile())).getAsJsonObject();
                saved.remove("video"); // Minecraft owns its options at startup; histories/profiles restore them only on request.
                saved.remove("keybindings"); // Keep options.txt authoritative at startup.
                apply(saved);
            }
        } catch (Exception e) {
            apply(before);
            SlothClient.LOG.warn("Could not read Sloth Client module config; using defaults", e);
            try {
                if(!Files.isSymbolicLink(configFile())&&Files.isRegularFile(configFile())&&Files.size(configFile())<=4_000_000)Files.copy(configFile(),configFile().resolveSibling("modules-unreadable-"+System.currentTimeMillis()+".json"));
                Path backup=configFile().resolveSibling("modules.previous.json");
                if(!Files.isSymbolicLink(backup)&&Files.isRegularFile(backup)&&Files.size(backup)<=512_000) {
                    JsonObject recovered=JsonParser.parseString(Files.readString(backup)).getAsJsonObject();
                    recovered.remove("video");recovered.remove("keybindings");apply(recovered);
                    SlothClient.LOG.info("Recovered Sloth modules from the previous saved configuration");
                }
            }catch(Exception recoveryError){apply(before);SlothClient.LOG.warn("Previous module settings could not be recovered",recoveryError);}
        }
        com.sloth.client.studio.SettingsHistory.initialize(snapshot());
    }

    public static boolean save() {
        JsonObject state=snapshot();
        com.sloth.client.studio.SettingsHistory.record(state);
        return write(configFile(), state);
    }

    /** Transactional restore: a malformed snapshot cannot leave half a setup applied. */
    public static boolean restore(JsonObject root) {
        JsonObject before = snapshot();
        try { apply(root); if(!save()) {apply(before);return false;} Minecraft.getInstance().options.save(); return true; }
        catch (Exception e) { apply(before); SlothClient.LOG.warn("Rejected invalid settings snapshot", e); return false; }
    }

    private static boolean write(Path file, JsonObject json) {
        try {
            Files.createDirectories(file.getParent());
            Path tmp = file.resolveSibling(file.getFileName() + ".tmp");
            if(Files.isSymbolicLink(file) || Files.isSymbolicLink(tmp)) throw new IOException("Linked configuration files are unsupported");
            if(file.equals(configFile())&&Files.isRegularFile(file)&&Files.size(file)<=512_000) {
                try {
                    JsonObject previous=JsonParser.parseString(Files.readString(file)).getAsJsonObject();
                    if(previous.has("modules")&&previous.get("modules").isJsonObject()) {
                        Path backup=file.resolveSibling("modules.previous.json"),backupTmp=file.resolveSibling("modules.previous.json.tmp");
                        if(Files.isSymbolicLink(backup)||Files.isSymbolicLink(backupTmp))throw new IOException("Linked configuration backup");
                        Files.writeString(backupTmp,previous.toString());
                        Files.move(backupTmp,backup,StandardCopyOption.REPLACE_EXISTING);
                    }
                }catch(com.google.gson.JsonParseException | IllegalStateException invalid){SlothClient.LOG.warn("Preserved unreadable settings; previous backup unchanged");}
            }
            Files.writeString(tmp, GSON.toJson(json));
            try { Files.move(tmp, file, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE); }
            catch (java.nio.file.AtomicMoveNotSupportedException e) { Files.move(tmp, file, StandardCopyOption.REPLACE_EXISTING); }
            storageError="";return true;
        } catch (IOException e) {
            SlothClient.LOG.warn("Could not save {}", file.getFileName(), e);
            storageError="Could not save. Check free space and folder permissions.";return false;
        }
    }

    // ---------- profiles ----------

    public static boolean validProfileName(String name) { return name != null && PROFILE_NAME.matcher(name).matches(); }

    public static List<String> profiles() {
        List<String> names = new ArrayList<>();
        try (Stream<Path> files = Files.exists(profileDir()) ? Files.list(profileDir()) : Stream.empty()) {
            files.map(p -> p.getFileName().toString()).filter(n -> n.endsWith(".json")).map(n -> n.substring(0, n.length() - 5))
                .filter(ModuleManager::validProfileName).forEach(names::add);
        } catch (IOException ignored) {
            // no profiles yet
        }
        Collections.sort(names, String.CASE_INSENSITIVE_ORDER);
        return names;
    }

    public static boolean saveProfile(String name) {
        if (!validProfileName(name)) return false;
        if(!write(profileDir().resolve(name + ".json"), snapshot())) return false;
        activeProfile = name;
        return true;
    }

    public static JsonObject previewProfile(String name) {
        if(!validProfileName(name))return null;try{Path file=profileDir().resolve(name+".json");if(Files.isSymbolicLink(file)||Files.size(file)>512000)return null;return JsonParser.parseString(Files.readString(file)).getAsJsonObject();}catch(Exception e){return null;}
    }
    public static boolean loadProfile(String name) {
        if (!validProfileName(name)) return false;
        try {
            Path file = profileDir().resolve(name + ".json");
            if (Files.isSymbolicLink(file)) return false;
            if (Files.size(file) > 512_000) return false;
            JsonObject state = JsonParser.parseString(Files.readString(file)).getAsJsonObject();
            state.addProperty("activeProfile", name);
            return restore(state);
        } catch (Exception e) {
            SlothClient.LOG.warn("Could not load profile {}", name, e);
            return false;
        }
    }

    public static void deleteProfile(String name) {
        if (!validProfileName(name)) return;
        try { Files.deleteIfExists(profileDir().resolve(name + ".json")); } catch (IOException ignored) { }
    }

    /** Back to factory defaults (keeps profiles on disk). */
    public static void resetAll() {
        for (Module m : MODULES.values()) {
            m.setEnabled(m.defaultEnabled);
            m.favorite = false;
            m.resetSettings();
            if (m instanceof HudModule h) h.resetPosition();
        }
        save();
    }
}
