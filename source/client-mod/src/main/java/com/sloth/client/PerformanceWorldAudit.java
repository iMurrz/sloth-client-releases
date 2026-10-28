package com.sloth.client;

import com.sloth.client.module.ModuleManager;
import com.sloth.client.studio.FrameStats;
import net.minecraft.client.Minecraft;
import net.minecraft.server.MinecraftServer;
import net.minecraft.world.level.GameType;
import net.minecraft.world.level.levelgen.WorldOptions;
import net.minecraft.world.level.levelgen.presets.WorldPresets;
import java.nio.file.*;
import com.google.gson.JsonObject;

/** Opt-in offline developer fixture; ordinary launches never enter this path. */
final class PerformanceWorldAudit {
    private static int phase,ticks;
    private static long started;
    private static FrameStats.Stats baseline,stress;
    private static final int STRESS_TICKS=Math.max(600,Math.min(12000,Integer.getInteger("sloth.devCheckSoakTicks",600)));
    private static final com.google.gson.JsonArray windows=new com.google.gson.JsonArray();
    private static boolean inputChecks;
    private static net.minecraft.client.CameraType originalCamera;
    private static float originalYaw,originalPitch;
    private static double originalZoom;
    private static void require(boolean condition,String message){if(!condition)throw new IllegalStateException("DEVCHECK input FAILED "+message);}
    private static void inputCheck(Minecraft mc,int tick){
        if(STRESS_TICKS==600)return;
        var free=ModuleManager.get(com.sloth.client.module.impl.CameraModules.Freelook.class);
        var zoom=ModuleManager.get(com.sloth.client.module.impl.CameraModules.Zoom.class);
        if(tick==40){require(mc.isWindowActive(),"window not focused");originalCamera=mc.options.getCameraType();originalYaw=mc.player.getYRot();originalPitch=mc.player.getXRot();free.setEnabled(true);free.resetSettings();SlothClient.FREELOOK.setDown(true);free.tick(mc);require(free.capturing(),"Freelook hold activation");}
        if(tick==42){free.turn(80,30);require(Math.abs(mc.player.getYRot()-originalYaw)<0.01f&&Math.abs(mc.player.getXRot()-originalPitch)<0.01f,"Freelook changed player aim");require(Math.abs(free.yaw()-originalYaw)>1,"Freelook camera rotation");}
        if(tick==44){SlothClient.FREELOOK.setDown(false);free.tick(mc);require(!free.capturing(),"Freelook release");}
        if(tick==64){free.tick(mc);require(!free.looking()&&mc.options.getCameraType()==originalCamera,"Freelook return restored view");}
        if(tick==66){SlothClient.FREELOOK.setDown(true);free.tick(mc);require(free.capturing(),"Freelook repeated activation");mc.setScreen(new net.minecraft.client.gui.screens.TitleScreen());free.tick(mc);require(!free.looking()&&mc.options.getCameraType()==originalCamera,"Freelook screen cleanup");SlothClient.FREELOOK.setDown(false);mc.setScreen(null);}
        if(tick==70){zoom.setEnabled(true);zoom.resetSettings();originalZoom=zoom.level.get();SlothClient.ZOOM.setDown(true);zoom.tick(mc);require(zoom.zooming(),"Zoom hold activation");require(zoom.onScroll(1)&&zoom.level.get()>originalZoom,"Zoom scroll adjustment");}
        if(tick==74){SlothClient.ZOOM.setDown(false);zoom.tick(mc);require(!zoom.zooming()&&!zoom.onScroll(1),"Zoom release/scroll isolation");zoom.level.set(originalZoom);}
        if(tick==100){require(Math.abs(zoom.factor()-1)<0.01f,"Zoom FOV return");inputChecks=true;SlothClient.LOG.info("DEVCHECK synthetic Freelook and Zoom checks passed");}
    }
    static void tick(Minecraft mc){
        if(!Boolean.getBoolean("sloth.devCheckPerformanceWorld"))return;
        if(phase==0){phase=1;started=System.nanoTime();mc.createWorldOpenFlows().createFreshLevel("Sloth_Performance_Audit",MinecraftServer.DEMO_SETTINGS.withGameType(GameType.CREATIVE),WorldOptions.DEMO_OPTIONS,WorldPresets::createNormalWorldDimensions,mc.screen);return;}
        if(System.nanoTime()-started>600_000_000_000L){SlothClient.LOG.error("DEVCHECK world audit FAILED timeout");mc.stop();return;}
        if(mc.level==null||mc.player==null||mc.screen!=null)return;
        if(Boolean.getBoolean("sloth.devCheckNameTags")){NameTagAudit.tick(mc);return;}
        if(phase==1){++ticks;try{inputCheck(mc,ticks);}catch(Exception e){SlothClient.LOG.error("DEVCHECK input FAILED",e);mc.stop();phase=5;return;}if(ticks<160)return;ticks=0;ModuleManager.hudHidden=true;FrameStats.clear();phase=2;return;}
        if(phase==2){if(++ticks<600)return;baseline=FrameStats.read();ModuleManager.hudHidden=false;for(var h:ModuleManager.hudModules())h.setEnabled(true);FrameStats.clear();ticks=0;phase=3;return;}
        if(phase==3){if(++ticks==40){
            mc.player.getInventory().setItem(0,new net.minecraft.world.item.ItemStack(net.minecraft.world.item.Items.ENDER_PEARL,16));
            mc.player.getInventory().setItem(1,new net.minecraft.world.item.ItemStack(net.minecraft.world.item.Items.DIAMOND_PICKAXE));
            mc.player.addEffect(new net.minecraft.world.effect.MobEffectInstance(net.minecraft.world.effect.MobEffects.HASTE,2400,1));
        }
            if(ticks%600==0){var sample=FrameStats.read();JsonObject window=new JsonObject();window.addProperty("tick",ticks);window.addProperty("frames",sample.count());window.addProperty("medianMs",sample.median());window.addProperty("p95Ms",sample.p95());window.addProperty("stalls",sample.stalls());window.addProperty("focused",mc.isWindowActive());window.addProperty("usedHeapBytes",Runtime.getRuntime().totalMemory()-Runtime.getRuntime().freeMemory());windows.add(window);SlothClient.LOG.info("DEVCHECK soak progress {} / {}",ticks,STRESS_TICKS);}
            if(ticks<STRESS_TICKS)return;stress=FrameStats.read();phase=4;ticks=600;
            java.io.File base=new java.io.File(mc.gameDirectory,"sloth-devcheck");new java.io.File(base,"screenshots").mkdirs();net.minecraft.client.Screenshot.grab(base,"devcheck-world-stress.png",mc.getMainRenderTarget(),1,msg->SlothClient.LOG.info("DEVCHECK world capture"));
            JsonObject out=new JsonObject();out.addProperty("baselineFrames",baseline.count());out.addProperty("baselineMedianMs",baseline.median());out.addProperty("baselineP95Ms",baseline.p95());out.addProperty("stressFrames",stress.count());out.addProperty("stressMedianMs",stress.median());out.addProperty("stressP95Ms",stress.p95());out.addProperty("stressStalls",stress.stalls());out.addProperty("hudModules",ModuleManager.hudModules().size());out.addProperty("focusedAtEnd",mc.isWindowActive());out.addProperty("scope","Synthetic offline creative world, stationary camera, last 600 focused gameplay intervals. No comparison with other clients or live multiplayer.");
            out.addProperty("stressTicks",STRESS_TICKS);out.addProperty("syntheticInputChecksPassed",inputChecks);out.add("periodicWindows",windows);
            try{Files.writeString(mc.gameDirectory.toPath().resolve("sloth-devcheck/world-performance.json"),out.toString());}catch(Exception e){SlothClient.LOG.error("DEVCHECK world report FAILED");}
            SlothClient.LOG.info("DEVCHECK world audit complete");
        }
        if(phase==4&&++ticks>640){phase=5;mc.stop();}
    }
}
