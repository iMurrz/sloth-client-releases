package com.sloth.client.module.impl;

import com.sloth.client.module.Module;
import com.sloth.client.module.ModuleManager;
import com.sloth.client.module.Setting;
import com.sloth.client.module.TextHudModule;
import com.sloth.client.studio.FrameStats;
import net.minecraft.client.Minecraft;
import net.minecraft.client.multiplayer.PlayerInfo;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.entity.EquipmentSlot;
import java.util.*;

/** Clean-room quality-of-life ideas inspired by classic clients; no packet manipulation or automated combat. */
public final class ReferenceFeatures {
    private ReferenceFeatures() {}
    private static Minecraft mc(){return Minecraft.getInstance();}

    public static final class Streamer extends Module {
        public final Setting.Bool chat=add(new Setting.Bool("hide_chat","Hide chat",true));
        public final Setting.Bool locations=add(new Setting.Bool("hide_locations","Hide locations and world details",true));
        public final Setting.Bool server=add(new Setting.Bool("hide_server","Hide server address",true));
        public final Setting.Bool cape=add(new Setting.Bool("hide_local_cape","Hide local cape",false));
        public Streamer(){super("streamer_mode","Streamer Mode","Temporarily hides private on-screen details without changing saved account or cape choices.",Category.UTILITY,false);}
        private static Streamer current(){var m=ModuleManager.get("streamer_mode");return m instanceof Streamer s?s:null;}
        public static boolean hideChat(){var s=current();return s!=null&&s.isActive()&&s.chat.on();}
        public static boolean hideCape(){var s=current();return s!=null&&s.isActive()&&s.cape.on();}
        public static boolean hideHud(String id){var s=current();if(s==null||!s.isActive())return false;if(s.server.on()&&id.equals("server_address"))return true;return s.locations.on()&&Set.of("coordinates","nether_coordinates","recovery_hud","biome_hud","dimension_hud","looking_at").contains(id);}
    }

    public static final class NetherCoordinates extends TextHudModule {
        private final Setting.Bool both=add(new Setting.Bool("show_both","Show current and converted",true));
        public NetherCoordinates(){super("nether_coordinates","Portal Coordinates","Show the corresponding Overworld or Nether coordinates without changing your position.",false,.01f,.34f);}
        protected List<String> lines(boolean preview){var p=mc().player;var l=mc().level;if(p==null||l==null||preview)return List.of("Overworld 1,240  72  -856","Nether 155  72  -107");boolean nether=l.dimension().identifier().getPath().equals("the_nether");double scale=nether?8.0:0.125;long x=Math.round(p.getX()*scale),z=Math.round(p.getZ()*scale);String converted=(nether?"Overworld ":"Nether ")+x+"  "+p.getBlockY()+"  "+z;if(!both.on())return List.of(converted);return List.of((nether?"Nether ":"Overworld ")+p.getBlockX()+"  "+p.getBlockY()+"  "+p.getBlockZ(),converted);}
    }

    public static final class EquipmentHealth extends TextHudModule {
        private final Setting.Number warning=add(new Setting.Number("warning","Warning threshold",15,1,75,1,"%"));
        private final Setting.Bool armor=add(new Setting.Bool("armor","Show armor",true));
        public EquipmentHealth(){super("equipment_health","Equipment Health","Exact remaining durability for your held tool and worn armor.",false,.72f,.22f);}
        private String line(String name,ItemStack s){if(s.isEmpty())return null;if(!s.isDamageableItem())return name+" · not damageable";int left=Math.max(0,s.getMaxDamage()-s.getDamageValue()),pct=Math.round(left*100f/Math.max(1,s.getMaxDamage()));return name+" "+left+" / "+s.getMaxDamage()+" · "+pct+"%"+(pct<=warning.i()?" ⚠":"");}
        protected List<String> lines(boolean preview){if(preview)return List.of("Pickaxe 1,247 / 2,031 · 61%","Boots 38 / 481 · 8% ⚠");var p=mc().player;if(p==null)return List.of("No equipment");List<String> out=new ArrayList<>();String hand=line(p.getMainHandItem().getHoverName().getString(),p.getMainHandItem());if(hand!=null)out.add(hand);if(armor.on())for(var entry:List.of(Map.entry("Helmet",EquipmentSlot.HEAD),Map.entry("Chestplate",EquipmentSlot.CHEST),Map.entry("Leggings",EquipmentSlot.LEGS),Map.entry("Boots",EquipmentSlot.FEET))){String v=line(entry.getKey(),p.getItemBySlot(entry.getValue()));if(v!=null)out.add(v);}return out.isEmpty()?List.of("No damageable equipment"):out;}
    }

    public static final class ActiveFeatures extends TextHudModule {
        private final Setting.Number limit=add(new Setting.Number("limit","Maximum entries",8,1,20,1,""));
        private final Setting.Choice order=add(new Setting.Choice("order","Sort","Alphabetical","Alphabetical","Longest first"));
        public ActiveFeatures(){super("active_features","Active Features","A compact list of enabled optional Sloth features.",false,.78f,.04f);}
        protected List<String> lines(boolean preview){if(preview)return List.of("Freelook","Session Goals","Inventory Planner");var values=ModuleManager.all().stream().filter(m->m.isActive()&&!m.isAlwaysEnabled()&&!m.id.equals(id)&&!m.id.equals("active_features")).map(m->m.name).collect(java.util.stream.Collectors.toCollection(ArrayList::new));if(order.is("Longest first"))values.sort(Comparator.comparingInt(String::length).reversed());else values.sort(String.CASE_INSENSITIVE_ORDER);return values.stream().limit(limit.i()).toList();}
        public boolean hasContent(){return ModuleManager.all().stream().anyMatch(m->m.isActive()&&!m.isAlwaysEnabled()&&!m.id.equals(id));}
    }

    public static final class ConnectionQuality extends TextHudModule {
        public ConnectionQuality(){super("connection_quality","Connection Quality","Ping plus recent client frame pacing; it does not claim to measure server TPS.",false,.74f,.72f);}
        private int ping(){var p=mc().player;if(p==null||mc().getConnection()==null||mc().isLocalServer())return-1;PlayerInfo i=mc().getConnection().getPlayerInfo(p.getUUID());return i==null?-1:i.getLatency();}
        protected List<String> lines(boolean preview){if(preview)return List.of("Network 42 ms · Good","Frames 8.2 / 13.6 ms median / p95");int p=ping();var f=FrameStats.read();String quality=p<0?"Local":p<80?"Good":p<160?"Fair":"Slow";return List.of("Network "+(p<0?"local":p+" ms")+" · "+quality,String.format(Locale.ROOT,"Frames %.1f / %.1f ms median / p95",f.median(),f.p95()));}
    }

    public static final class ReturnPath extends TextHudModule {
        public ReturnPath(){super("return_path","Return Path","Direction and distance back to your latest local bookmark or death location.",false,.38f,.68f);}
        public boolean hasContent(){return com.sloth.client.studio.GameplayTracker.lastPoint()!=null;}
        protected List<String> lines(boolean preview){if(preview)return List.of("Return 184 m · west 120 · north 139");var p=mc().player;var point=com.sloth.client.studio.GameplayTracker.lastPoint();if(p==null||point==null)return List.of("No return point");String dim=mc().level==null?"":mc().level.dimension().identifier().toString();if(!dim.equals(point.dimension()))return List.of("Return point · "+point.dimension().replace("minecraft:",""));long dx=point.x()-p.getBlockX(),dz=point.z()-p.getBlockZ();long distance=Math.round(Math.hypot(dx,dz));String east=dx==0?"":Math.abs(dx)+" "+(dx>0?"east":"west"),south=dz==0?"":Math.abs(dz)+" "+(dz>0?"south":"north");return List.of("Return "+distance+" m",java.util.stream.Stream.of(east,south).filter(s->!s.isEmpty()).collect(java.util.stream.Collectors.joining(" · ")));}
    }
}
