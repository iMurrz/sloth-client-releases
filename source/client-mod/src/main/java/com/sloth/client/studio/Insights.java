package com.sloth.client.studio;

import com.sloth.client.module.ModuleManager;
import com.google.gson.*;
import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.client.Minecraft;
import java.nio.file.*;
import java.util.*;

/** Bounded local observations. Never records chat, tokens, coordinates or server addresses. */
public final class Insights {
    private static JsonArray sessions=new JsonArray(), traces=new JsonArray();
    public static boolean armed;
    private static long lastTrace;
    private static Path dir() { return FabricLoader.getInstance().getConfigDir().resolve("sloth-client"); }
    public static void load() {sessions=read("performance-sessions.json");traces=read("performance-traces.json");while(sessions.size()>20)sessions.remove(0);while(traces.size()>10)traces.remove(0);}
    private static JsonArray read(String name) {try {Path p=dir().resolve(name);if(!Files.isSymbolicLink(p)&&Files.isRegularFile(p)&&Files.size(p)<1_000_000)return JsonParser.parseString(Files.readString(p)).getAsJsonArray();}catch(Exception ignored){} return new JsonArray();}
    public static List<JsonObject> sessions() {return objects(sessions);}
    public static List<JsonObject> traces() {return objects(traces);}
    private static List<JsonObject> objects(JsonArray a) {List<JsonObject> out=new ArrayList<>();for(JsonElement e:a)if(e.isJsonObject()&&e.getAsJsonObject().has("median")&&e.getAsJsonObject().has("p95"))out.add(e.getAsJsonObject());return out;}
    private static JsonObject summary() {
        var s=FrameStats.read();var mc=Minecraft.getInstance();Runtime r=Runtime.getRuntime();JsonObject o=new JsonObject();
        o.addProperty("time",System.currentTimeMillis());o.addProperty("count",s.count());o.addProperty("median",s.median());o.addProperty("p95",s.p95());o.addProperty("stalls",s.stalls());
        o.addProperty("heapMb",(r.totalMemory()-r.freeMemory())/1048576);o.addProperty("renderDistance",mc.options.renderDistance().get());o.addProperty("fpsLimit",mc.options.framerateLimit().get());o.addProperty("vsync",mc.options.enableVsync().get());
        JsonArray mods=new JsonArray();ModuleManager.all().stream().filter(m->m.isActive()).forEach(m->mods.add(m.id));o.add("modules",mods);return o;
    }
    public static String saveSession() {if(FrameStats.read().count()<60)return "Play with Studio closed to collect at least 60 frames first.";sessions.add(summary());while(sessions.size()>20)sessions.remove(0);return save("performance-sessions.json",sessions)?"Session sample queued for local saving.":"Saving is busy or unavailable. Try again.";}
    public static String trace() {
        if(FrameStats.read().count()<2)return "No gameplay sample yet. Close Studio and play first.";
        JsonObject o=summary();JsonArray a=new JsonArray();for(double n:FrameStats.read().graph())a.add(n);o.add("intervals",a);traces.add(o);while(traces.size()>10)traces.remove(0);
        lastTrace=System.currentTimeMillis();return save("performance-traces.json",traces)?"Timing trace queued for local saving (latest 90 frame intervals).":"Saving is busy or unavailable. Try again.";
    }
    public static void frame(double interval) {if(armed && interval>=100 && System.currentTimeMillis()-lastTrace>60000)trace();}
    private static boolean save(String name,JsonArray array) {
        // Capture on the client thread; only immutable text crosses to the I/O worker.
        var pending=LocalSnapshotWriter.write(dir().resolve(name),array.toString());
        pending.whenComplete((v,e)->{if(e!=null)com.sloth.client.SlothClient.LOG.warn("Could not save local performance snapshot");});
        return !pending.isCompletedExceptionally();
    }
    public static String compare(JsonObject a,JsonObject b) {
        try {return String.format(Locale.ROOT,"Median %.1f → %.1f ms · p95 %.1f → %.1f ms · render %s → %s · FPS cap %s → %s",a.get("median").getAsDouble(),b.get("median").getAsDouble(),a.get("p95").getAsDouble(),b.get("p95").getAsDouble(),a.get("renderDistance"),b.get("renderDistance"),a.get("fpsLimit"),b.get("fpsLimit"));}catch(Exception e){return "This saved sample could not be compared.";}
    }
}
