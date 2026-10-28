package com.sloth.client.module.impl;

import com.sloth.client.module.Module;
import com.sloth.client.module.Setting;
import com.sloth.client.module.TextHudModule;
import com.sloth.client.studio.QaAuthorization;
import net.minecraft.client.Minecraft;
import net.minecraft.core.BlockPos;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.network.chat.Component;
import net.minecraft.world.entity.*;
import net.minecraft.world.phys.Vec3;

import java.util.*;

/** Explicitly offline-only practice tools. Every active action is gated by an integrated server. */
public final class OfflineTraining {
    private OfflineTraining(){}
    private static final Set<UUID> GLOWING=new HashSet<>();
    private static boolean warned;
    public static boolean allowed(Minecraft mc){var server=mc==null?null:mc.getSingleplayerServer();return mc!=null&&mc.player!=null&&mc.level!=null&&server!=null&&!server.isPublished();}
    private static boolean gate(Minecraft mc,String capability){if(allowed(mc)||QaAuthorization.allows(capability)){warned=false;return true;}release(mc);if(mc!=null&&mc.player!=null&&!warned){warned=true;mc.player.displayClientMessage(Component.literal("Sloth Lab paused · private singleplayer or authorized QA server required"),true);}return false;}
    public static void release(Minecraft mc){if(mc!=null&&mc.options!=null)mc.options.keyAttack.setDown(false);if(mc!=null&&mc.level!=null)for(UUID id:List.copyOf(GLOWING)){Entity e=mc.level.getEntity(id);if(e!=null)e.setGlowingTag(false);}GLOWING.clear();}
    private static LivingEntity target(Minecraft mc,double range,boolean visible){LivingEntity best=null;double score=Double.MAX_VALUE;Vec3 eye=mc.player.getEyePosition(),look=mc.player.getLookAngle();for(Entity e:mc.level.entitiesForRendering()){if(!(e instanceof LivingEntity living)||e==mc.player||!living.isAlive())continue;double dist=eye.distanceTo(living.getEyePosition());if(dist>range||(visible&&!mc.player.hasLineOfSight(living)))continue;Vec3 dir=living.getEyePosition().subtract(eye).normalize();double angle=1-look.dot(dir);double candidate=angle*12+dist*.02;if(candidate<score){score=candidate;best=living;}}return best;}
    private static void face(Minecraft mc,LivingEntity e,float strength){Vec3 d=e.getEyePosition().subtract(mc.player.getEyePosition());float yaw=(float)(Math.toDegrees(Math.atan2(d.z,d.x))-90),pitch=(float)-Math.toDegrees(Math.atan2(d.y,Math.sqrt(d.x*d.x+d.z*d.z)));mc.player.setYRot(lerpAngle(mc.player.getYRot(),yaw,strength));mc.player.setXRot(Math.clamp(mc.player.getXRot()+(pitch-mc.player.getXRot())*strength,-90,90));}
    private static float lerpAngle(float a,float b,float f){float d=(b-a)%360;if(d>180)d-=360;if(d<-180)d+=360;return a+d*f;}

    public static final class AimAssist extends Module {
        private final Setting.Number range=add(new Setting.Number("range","Target range",6,2,16,.5," blocks"));
        private final Setting.Number strength=add(new Setting.Number("strength","Steering strength",20,1,100,1,"%"));
        private final Setting.Bool visible=add(new Setting.Bool("visible_only","Require line of sight",true));
        public AimAssist(){super("offline_aim_assist","Offline Aim Assist","Steers toward the closest target only while an integrated singleplayer world is running.",Category.UTILITY,false);}
        public void tick(Minecraft mc){if(!gate(mc,"aim_assist")||mc.screen!=null)return;LivingEntity e=target(mc,range.get(),visible.on());if(e!=null)face(mc,e,strength.f()/100f);}
        protected void onDisable(){release(Minecraft.getInstance());}
    }
    public static final class AutoAttack extends Module {
        private final Setting.Number range=add(new Setting.Number("range","Attack range",3,1,6,.25," blocks"));
        private final Setting.Number delay=add(new Setting.Number("delay","Delay",500,100,2000,25," ms")); private long last;
        public AutoAttack(){super("offline_auto_attack","Offline Auto Attack","Attacks the closest visible target in integrated singleplayer only.",Category.UTILITY,false);}
        public void tick(Minecraft mc){if(!gate(mc,"auto_attack")||mc.screen!=null)return;LivingEntity e=target(mc,range.get(),true);long now=System.currentTimeMillis();if(e!=null&&now-last>=delay.i()){last=now;face(mc,e,.35f);mc.gameMode.attack(mc.player,e);mc.player.swing(net.minecraft.world.InteractionHand.MAIN_HAND);}}
    }
    public static final class AutoMine extends Module {
        public AutoMine(){super("offline_auto_mine","Offline Auto Mine","Holds the normal attack control while looking at a block in integrated singleplayer only.",Category.UTILITY,false);}
        public void tick(Minecraft mc){if(!gate(mc,"auto_mine")||mc.screen!=null){if(mc.options!=null)mc.options.keyAttack.setDown(false);return;}boolean block=mc.hitResult!=null&&mc.hitResult.getType()==net.minecraft.world.phys.HitResult.Type.BLOCK;mc.options.keyAttack.setDown(block);}
        protected void onDisable(){release(Minecraft.getInstance());}
    }
    public static final class EntityEsp extends Module {
        private final Setting.Number range=add(new Setting.Number("range","Highlight range",32,4,128,1," blocks"));
        public EntityEsp(){super("offline_entity_esp","Offline Entity ESP","Applies the vanilla glow outline to nearby entities in integrated singleplayer only.",Category.VISUAL,false);}
        public void tick(Minecraft mc){if(!gate(mc,"entity_esp"))return;Set<UUID> seen=new HashSet<>();for(Entity e:mc.level.entitiesForRendering())if(e instanceof LivingEntity&&e!=mc.player&&e.distanceTo(mc.player)<=range.get()){seen.add(e.getUUID());if(!e.isCurrentlyGlowing()){e.setGlowingTag(true);GLOWING.add(e.getUUID());}}for(UUID id:List.copyOf(GLOWING))if(!seen.contains(id)){Entity e=mc.level.getEntity(id);if(e!=null)e.setGlowingTag(false);GLOWING.remove(id);}}
        protected void onDisable(){release(Minecraft.getInstance());}
    }
    public static final class OreScanner extends TextHudModule {
        private final Setting.Number radius=add(new Setting.Number("radius","Scan radius",12,4,24,1," blocks")); private List<String> found=List.of("No ores scanned");private int ticks;
        public OreScanner(){super("offline_ore_scanner","Offline Ore Scanner","Lists nearby covered ore blocks only in integrated singleplayer.",false,.68f,.62f);}
        public void tick(Minecraft mc){if(!gate(mc,"ore_scanner")){found=List.of("Sloth Lab paused");return;}if(++ticks%20!=0)return;record(mc);}
        private void record(Minecraft mc){BlockPos origin=mc.player.blockPosition();record Hit(String name,BlockPos pos,double d){}List<Hit> hits=new ArrayList<>();int r=radius.i();BlockPos.MutableBlockPos p=new BlockPos.MutableBlockPos();for(int x=-r;x<=r;x++)for(int y=-r;y<=r;y++)for(int z=-r;z<=r;z++){p.set(origin.getX()+x,origin.getY()+y,origin.getZ()+z);String id=BuiltInRegistries.BLOCK.getKey(mc.level.getBlockState(p).getBlock()).getPath();if(id.endsWith("_ore")||id.equals("ancient_debris")){double d=Math.sqrt(x*x+y*y+z*z);hits.add(new Hit(id.replace('_',' '),p.immutable(),d));}}hits.sort(Comparator.comparingDouble(Hit::d));found=hits.stream().limit(3).map(h->h.name()+" · "+Math.round(h.d())+"m · "+direction(origin,h.pos())).toList();if(found.isEmpty())found=List.of("No ores inside "+r+" blocks");}
        protected List<String> lines(boolean preview){return preview?List.of("diamond ore · 8m · NE ↓","redstone ore · 11m · W ↓"):found;}
        private static String direction(BlockPos a,BlockPos b){int dx=b.getX()-a.getX(),dy=b.getY()-a.getY(),dz=b.getZ()-a.getZ();String h=Math.abs(dx)>Math.abs(dz)?(dx>0?"E":"W"):(dz>0?"S":"N");return h+(dy>2?" ↑":dy<-2?" ↓":"");}
    }
}
