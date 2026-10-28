package com.sloth.client.studio;

import com.sloth.client.SlothClient;
import com.sloth.client.module.ModuleManager;
import com.google.gson.*;
import net.fabricmc.loader.api.FabricLoader;
import java.nio.file.*;
import java.util.*;

/** Local UI preferences, separate from gameplay profiles and shared preference documents. */
public final class Preferences {
    private static JsonObject data = new JsonObject(), committed = new JsonObject();
    private static Path file() { return FabricLoader.getInstance().getConfigDir().resolve("sloth-client/experience.json"); }
    public static void load() {
        try { if (!Files.isSymbolicLink(file()) && Files.isRegularFile(file()) && Files.size(file()) < 131072) data = JsonParser.parseString(Files.readString(file())).getAsJsonObject(); }
        catch (Exception e) { data = new JsonObject(); SlothClient.LOG.warn("Could not read experience preferences"); }
        committed = data.deepCopy();
    }
    public static boolean compact() { return bool("compact"); }
    public static boolean bool(String key) { JsonElement e=data.get(key); return e!=null && e.isJsonPrimitive() && e.getAsJsonPrimitive().isBoolean() && e.getAsBoolean(); }
    public static boolean toggle(String key) { data.addProperty(key,!bool(key)); return save(); }
    public static int budget() { try { int n=data.get("budget").getAsInt(); if (Set.of(60,90,120,144,165,240).contains(n)) return n; } catch(Exception ignored) {} return 120; }
    public static boolean nextBudget() { int[] n={60,90,120,144,165,240}; int value=budget(); for(int i=0;i<n.length;i++) if(n[i]==value) {data.addProperty("budget",n[(i+1)%n.length]);break;} return save(); }
    public static List<String> ids(String key) {
        List<String> out=new ArrayList<>();
        if(data.has(key) && data.get(key).isJsonArray()) for(JsonElement e:data.getAsJsonArray(key)) {
            if(e.isJsonPrimitive() && ModuleManager.get(e.getAsString())!=null && !out.contains(e.getAsString()) && out.size()<(key.equals("pins")?8:32)) out.add(e.getAsString());
        }
        else if(key.equals("pins")) out.addAll(List.of("fps","crosshair","zoom","better_sounds"));
        else if(key.equals("focusHud")) out.addAll(List.of("fps","clock","pack_display","item_count_hud"));
        return out;
    }
    public static boolean toggleId(String key,String id) {
        if(ModuleManager.get(id)==null) return false;
        List<String> ids=new ArrayList<>(ids(key));
        if(!ids.remove(id)) { if(ids.size()>=(key.equals("pins")?8:32)) return false; ids.add(id); }
        JsonArray a=new JsonArray(); ids.forEach(a::add); data.add(key,a); return save();
    }
    public static boolean approved(String id,String hash) { return data.has("addon_"+id) && data.get("addon_"+id).isJsonPrimitive() && hash.equals(data.get("addon_"+id).getAsString()); }
    public static boolean grant(String id,String hash) { data.addProperty("addon_"+id,hash); return save(); }
    public static boolean revoke(String id) { data.remove("addon_"+id); return save(); }
    public static boolean revokeAll() { new ArrayList<>(data.keySet()).stream().filter(k->k.startsWith("addon_")).forEach(data::remove); return save(); }
    private static boolean save() {
        try {
            Files.createDirectories(file().getParent()); Path tmp=file().resolveSibling("experience.json.tmp");
            if(Files.isSymbolicLink(file()) || Files.isSymbolicLink(tmp)) throw new java.io.IOException("Linked preferences are not supported");
            Files.writeString(tmp,data.toString());
            try { Files.move(tmp,file(),StandardCopyOption.REPLACE_EXISTING,StandardCopyOption.ATOMIC_MOVE); }
            catch(AtomicMoveNotSupportedException e) { Files.move(tmp,file(),StandardCopyOption.REPLACE_EXISTING); }
            committed=data.deepCopy(); return true;
        } catch(Exception e) { data=committed.deepCopy(); SlothClient.LOG.warn("Could not save experience preferences"); return false; }
    }
}
