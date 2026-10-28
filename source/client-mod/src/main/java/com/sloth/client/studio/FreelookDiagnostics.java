package com.sloth.client.studio;

import com.google.gson.*;
import com.sloth.client.module.ModuleManager;
import com.sloth.client.module.impl.CameraModules;
import net.minecraft.client.Minecraft;
import net.fabricmc.loader.api.FabricLoader;
import java.util.ArrayDeque;

/** Opt-in, bounded camera observations. Never records names, chat, addresses or account data. */
public final class FreelookDiagnostics {
    private static final ArrayDeque<JsonObject> samples = new ArrayDeque<>();
    private static long last;
    private static boolean wasLooking;
    private static String message = "No samples yet. Enable recording, then hold and release Freelook.";
    public static boolean enabled() { return Preferences.bool("freelookDiagnostics"); }
    public static String summary() { return message; }
    public static JsonObject snapshot(Minecraft mc) {
        JsonObject row=new JsonObject();var free=ModuleManager.get(CameraModules.Freelook.class);
        row.addProperty("time",System.currentTimeMillis());row.addProperty("freelook",free.looking());
        row.addProperty("camera",mc.options.getCameraType().name());row.addProperty("focused",mc.isWindowActive());
        row.addProperty("hudHidden",mc.options.hideGui);row.addProperty("cameraYaw",free.yaw());row.addProperty("cameraPitch",free.pitch());
        int checked=0,visible=0,hidden=0;
        if(mc.player!=null&&mc.level!=null) {
            row.addProperty("playerYaw",mc.player.getYRot());row.addProperty("playerPitch",mc.player.getXRot());
            row.addProperty("ownNameAvailable",mc.getEntityRenderDispatcher().getRenderer(mc.player).createRenderState(mc.player,0).nameTag!=null);
            row.addProperty("ownInvisible",mc.player.isInvisible());row.addProperty("ownPassenger",mc.player.isVehicle());
            row.addProperty("ownTeamVisibility",mc.player.getTeam()==null?"no-team":mc.player.getTeam().getNameTagVisibility().name());
            for(var player:mc.level.players())if(player!=mc.player&&checked<32&&player.distanceToSqr(mc.player)<4096){checked++;if(mc.getEntityRenderDispatcher().getRenderer(player).createRenderState(player,0).nameTag!=null)visible++;else hidden++;}
        }
        row.addProperty("nearbyPlayersChecked",checked);row.addProperty("otherNamesAvailable",visible);row.addProperty("otherNamesHidden",hidden);
        return row;
    }
    public static void tick(Minecraft mc) {
        if(!enabled())return;boolean looking=ModuleManager.get(CameraModules.Freelook.class).looking();long now=System.currentTimeMillis();
        if(now-last<1000&&looking==wasLooking)return;
        last=now;wasLooking=looking;
        try{var row=snapshot(mc);samples.addLast(row);while(samples.size()>120)samples.removeFirst();
            message=samples.size()+" samples · Freelook "+(looking?"active":"off")+" · nearby name tags "+row.get("otherNamesAvailable")+"/"+row.get("nearbyPlayersChecked");
        }catch(Exception e){message="Could not inspect camera state. Recording remains optional.";}
    }
    public static java.util.concurrent.CompletableFuture<Void> save() {
        JsonObject report=new JsonObject();report.addProperty("schema",1);report.addProperty("scope","Local camera and name availability; extraction does not prove visibility through blocks or server behavior.");
        JsonArray out=new JsonArray();for(var row:samples)out.add(row.deepCopy());report.add("samples",out);
        return LocalSnapshotWriter.write(FabricLoader.getInstance().getConfigDir().resolve("sloth-client/freelook-diagnostics.json"),report.toString());
    }
    public static void clear() { samples.clear();last=0;wasLooking=false;message="Recording cleared."; }
}
