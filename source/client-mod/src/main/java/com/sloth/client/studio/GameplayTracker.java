package com.sloth.client.studio;

import com.google.gson.*;
import com.sloth.client.SlothClient;
import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.client.Minecraft;
import net.minecraft.core.BlockPos;
import net.minecraft.resources.Identifier;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.phys.Vec3;

import java.nio.file.*;
import java.time.Instant;
import java.util.*;

/** Local, bounded gameplay history. It never stores chat, accounts, server addresses or hidden-world data. */
public final class GameplayTracker {
    public record Point(String kind,String label,String dimension,int x,int y,int z,long time) {}
    public record Recap(long started,long ended,long blocks,double distance,int deaths,int attacks,int hits,int damageTaken,int itemsGained,double medianMs,double p95Ms) {}
    private static final Gson GSON=new GsonBuilder().setPrettyPrinting().create();
    private static final Deque<Point> POINTS=new ArrayDeque<>();
    private static final Deque<Recap> RECAPS=new ArrayDeque<>();
    private static long started=System.currentTimeMillis(),blocks;
    private static double distance;
    private static int deaths,attacks,hits,damageTaken,itemsGained,lastInventory,lastHurt;
    private static Vec3 lastPos; private static boolean dead; private static BlockPos buildAnchor;
    private static long lastSave;
    private GameplayTracker(){}
    private static Path file(){return FabricLoader.getInstance().getConfigDir().resolve("sloth-client/gameplay-history.json");}
    public static void load(){
        POINTS.clear();RECAPS.clear();
        try{Path p=file();if(Files.isSymbolicLink(p)||!Files.isRegularFile(p)||Files.size(p)>1_000_000)return;JsonObject root=JsonParser.parseString(Files.readString(p)).getAsJsonObject();
            JsonArray savedPoints=root.has("points")&&root.get("points").isJsonArray()?root.getAsJsonArray("points"):new JsonArray();
            for(JsonElement e:savedPoints){if(!e.isJsonObject())continue;JsonObject o=e.getAsJsonObject();POINTS.add(new Point(text(o,"kind",20),text(o,"label",80),text(o,"dimension",80),(int)Math.clamp(n(o,"x"),-30_000_000,30_000_000),(int)Math.clamp(n(o,"y"),-2048,2048),(int)Math.clamp(n(o,"z"),-30_000_000,30_000_000),n(o,"time")));while(POINTS.size()>100)POINTS.removeFirst();}
            JsonArray savedRecaps=root.has("recaps")&&root.get("recaps").isJsonArray()?root.getAsJsonArray("recaps"):new JsonArray();
            for(JsonElement e:savedRecaps){if(!e.isJsonObject())continue;JsonObject o=e.getAsJsonObject();RECAPS.add(new Recap(n(o,"started"),n(o,"ended"),Math.max(0,n(o,"blocks")),Math.max(0,d(o,"distance")),(int)Math.max(0,n(o,"deaths")),(int)Math.max(0,n(o,"attacks")),(int)Math.max(0,n(o,"hits")),(int)Math.max(0,n(o,"damageTaken")),(int)Math.max(0,n(o,"itemsGained")),Math.max(0,d(o,"medianMs")),Math.max(0,d(o,"p95Ms"))));while(RECAPS.size()>30)RECAPS.removeFirst();}
        }catch(Exception e){SlothClient.LOG.warn("Could not read bounded gameplay history");}
        resetSession();
    }
    private static String text(JsonObject o,String key,int max){String s=o.has(key)?o.get(key).getAsString():"";return s.length()>max?s.substring(0,max):s;}
    private static long n(JsonObject o,String k){return o.has(k)?o.get(k).getAsLong():0;} private static double d(JsonObject o,String k){return o.has(k)?o.get(k).getAsDouble():0;}
    public static void tick(Minecraft mc){
        if(mc.player==null||mc.level==null){lastPos=null;return;}Vec3 pos=mc.player.position();if(lastPos!=null){double moved=pos.distanceTo(lastPos);if(moved<32)distance+=moved;}lastPos=pos;
        int inventory=0;for(ItemStack s:mc.player.getInventory().getNonEquipmentItems())inventory+=s.getCount();inventory+=mc.player.getOffhandItem().getCount();if(lastInventory>0&&inventory>lastInventory)itemsGained+=inventory-lastInventory;lastInventory=inventory;
        if(mc.player.hurtTime>lastHurt)damageTaken++;lastHurt=mc.player.hurtTime;
        boolean nowDead=mc.player.isDeadOrDying();if(nowDead&&!dead){deaths++;addPoint("death","Death",mc.player.blockPosition());mc.player.displayClientMessage(net.minecraft.network.chat.Component.literal("Sloth saved your death location: "+coords(lastPoint())),false);}dead=nowDead;
        if(System.currentTimeMillis()-lastSave>30000){lastSave=System.currentTimeMillis();save();}
    }
    public static void attacked(Entity entity){attacks++;}
    public static void blockBroken(BlockPos pos){blocks++;}
    public static Point bookmark(String label){Minecraft mc=Minecraft.getInstance();if(mc.player==null)return null;Point p=addPoint("bookmark",clean(label,"Bookmark"),mc.player.blockPosition());save();return p;}
    public static Point addDeathForTest(BlockPos pos){deaths++;return addPoint("death","Death",pos);}
    private static Point addPoint(String kind,String label,BlockPos pos){Minecraft mc=Minecraft.getInstance();String dim=mc.level==null?"unknown":mc.level.dimension().identifier().toString();Point p=new Point(kind,label,dim,pos.getX(),pos.getY(),pos.getZ(),System.currentTimeMillis());POINTS.addLast(p);while(POINTS.size()>100)POINTS.removeFirst();return p;}
    private static String clean(String value,String fallback){String s=value==null?fallback:value.replaceAll("[\\p{Cntrl}§]","").trim();if(s.isEmpty())s=fallback;return s.length()>80?s.substring(0,80):s;}
    public static void setBuildAnchor(){Minecraft mc=Minecraft.getInstance();if(mc.player!=null)buildAnchor=mc.player.blockPosition();}
    public static String buildMeasure(){Minecraft mc=Minecraft.getInstance();if(buildAnchor==null)return "No build anchor";if(mc.player==null)return "Build anchor saved";BlockPos p=mc.player.blockPosition();int dx=Math.abs(p.getX()-buildAnchor.getX()),dy=Math.abs(p.getY()-buildAnchor.getY()),dz=Math.abs(p.getZ()-buildAnchor.getZ());return "Build "+dx+" × "+dy+" × "+dz+" · "+Math.round(Math.sqrt(dx*dx+dy*dy+dz*dz))+" blocks";}
    public static void beginSession(){resetSession();}
    public static void endSession(){if(started==0)return;if(blocks==0&&distance<1&&deaths==0&&attacks==0&&itemsGained==0){resetSession();return;}var s=FrameStats.read();RECAPS.addLast(new Recap(started,System.currentTimeMillis(),blocks,distance,deaths,attacks,hits,damageTaken,itemsGained,s.median(),s.p95()));while(RECAPS.size()>30)RECAPS.removeFirst();save();resetSession();}
    private static void resetSession(){started=System.currentTimeMillis();blocks=0;distance=0;deaths=attacks=hits=damageTaken=itemsGained=lastInventory=lastHurt=0;lastPos=null;dead=false;}
    public static long blocks(){return blocks;} public static double distance(){return distance;} public static int deaths(){return deaths;} public static int attacks(){return attacks;} public static int hits(){return hits;} public static int damageTaken(){return damageTaken;} public static int itemsGained(){return itemsGained;} public static long elapsedSeconds(){return Math.max(0,(System.currentTimeMillis()-started)/1000);}
    public static List<Point> points(){return List.copyOf(POINTS);} public static List<Recap> recaps(){return List.copyOf(RECAPS);} public static Point lastPoint(){return POINTS.peekLast();}
    public static String coords(Point p){return p==null?"None":p.x+", "+p.y+", "+p.z+" · "+shortDim(p.dimension);}
    private static String shortDim(String d){int i=d.indexOf(':');return i>=0?d.substring(i+1).replace('_',' '):d;}
    public static int inventoryCount(String id){Minecraft mc=Minecraft.getInstance();if(mc.player==null)return 0;Identifier key=Identifier.tryParse(id);if(key==null)return 0;int count=0;for(ItemStack s:mc.player.getInventory().getNonEquipmentItems())if(net.minecraft.core.registries.BuiltInRegistries.ITEM.getKey(s.getItem()).equals(key))count+=s.getCount();if(net.minecraft.core.registries.BuiltInRegistries.ITEM.getKey(mc.player.getOffhandItem().getItem()).equals(key))count+=mc.player.getOffhandItem().getCount();return count;}
    public static String performanceAdvice(){var s=FrameStats.read();Minecraft mc=Minecraft.getInstance();if(s.count()<60)return "Play for a few seconds to collect a performance sample.";if(s.p95()>50)return "Frequent long frames detected. Lower render distance or disable shaders, then compare another sample.";if(s.p95()>1000.0/45)return "Frame pacing is uneven. Try one graphics change and compare p95 again.";if(mc.options.enableVsync().get()&&mc.options.framerateLimit().get()>60)return "VSync is on. Compare it off only if tearing is acceptable.";return "Frame pacing looks stable in the recent sample.";}
    public static String sessionSummary(){return "Mined "+blocks+" · "+Math.round(distance)+" m · "+itemsGained+" items · "+deaths+" deaths";}
    public static boolean save(){try{JsonObject root=new JsonObject();root.addProperty("schema",1);JsonArray points=new JsonArray();for(Point p:POINTS)points.add(GSON.toJsonTree(p));JsonArray recaps=new JsonArray();for(Recap r:RECAPS)recaps.add(GSON.toJsonTree(r));root.add("points",points);root.add("recaps",recaps);Files.createDirectories(file().getParent());if(Files.isSymbolicLink(file()))return false;Path tmp=file().resolveSibling("gameplay-history.json.tmp");if(Files.isSymbolicLink(tmp))return false;Files.writeString(tmp,GSON.toJson(root));Files.move(tmp,file(),StandardCopyOption.REPLACE_EXISTING);return true;}catch(Exception e){SlothClient.LOG.warn("Could not save gameplay history");return false;}}
}
