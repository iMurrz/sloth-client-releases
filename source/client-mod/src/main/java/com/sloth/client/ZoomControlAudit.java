package com.sloth.client;

import net.minecraft.client.Minecraft;
import net.minecraft.server.MinecraftServer;
import net.minecraft.world.level.GameType;
import net.minecraft.world.level.levelgen.WorldOptions;
import net.minecraft.world.level.levelgen.presets.WorldPresets;
import com.sloth.client.module.ModuleManager;
import com.sloth.client.module.impl.CameraModules;

/** Explicit offline fixture; never runs on ordinary launches. */
final class ZoomControlAudit {
    private static int phase,ticks;
    static void tick(Minecraft mc) {
        if(phase==0){
            if(mc.getOverlay()!=null)return;
            org.spongepowered.asm.mixin.MixinEnvironment.getCurrentEnvironment().audit();
            SlothClient.LOG.info("DEVCHECK mixin audit passed");
            phase=1;
            mc.createWorldOpenFlows().createFreshLevel("Sloth_Control_Audit",MinecraftServer.DEMO_SETTINGS.withGameType(GameType.CREATIVE),WorldOptions.DEMO_OPTIONS,WorldPresets::createNormalWorldDimensions,mc.screen);
            return;
        }
        if(phase==1){
            if(mc.level==null||mc.player==null||mc.getOverlay()!=null)return;
            mc.setScreen(null);
            org.lwjgl.glfw.GLFW.glfwFocusWindow(mc.getWindow().handle());
            phase=2;ticks=0;return;
        }
        if(phase==2 && ++ticks==10){
            try {
                DevCheck.checkZoom(mc);
                var free=ModuleManager.get(CameraModules.Freelook.class);
                boolean enabled=free.isEnabled();double priorSpeed=free.lookSpeed.get();var type=mc.options.getCameraType();float aimYaw=mc.player.getYRot(),aimPitch=mc.player.getXRot();
                try {
                    free.setEnabled(true);SlothClient.FREELOOK.setDown(true);free.tick(mc);
                    if(mc.options.getCameraType()!=net.minecraft.client.CameraType.THIRD_PERSON_BACK)throw new IllegalStateException("Freelook did not use rear third person");
                    float yaw=free.yaw(),pitch=free.pitch();free.turn(80,30);
                    if(Math.abs(free.yaw()-yaw-80*.15f*free.lookSpeed.f())>.01f)throw new IllegalStateException("Freelook speed multiplier ignored");
                    if(Math.abs(free.pitch()-pitch-30*.15f*free.lookSpeed.f())>.01f)throw new IllegalStateException("Freelook vertical speed multiplier ignored");
                    free.turn(0,100000);if(free.pitch()>90)throw new IllegalStateException("Freelook pitch exceeds clamp");
                    if(mc.player.getYRot()!=aimYaw||mc.player.getXRot()!=aimPitch)throw new IllegalStateException("Freelook changed player aim");
                    for(double speed:new double[]{0.25,1,3}){free.lookSpeed.set(speed);float before=free.yaw();free.turn(80,0);if(Math.abs(free.yaw()-before-80*.15f*speed)>.01f)throw new IllegalStateException("Freelook adjustable speed ignored");}
                    free.lookSpeed.set(-10d);if(free.lookSpeed.get()!=.25)throw new IllegalStateException("Freelook lower bound ignored");free.lookSpeed.set(10d);if(free.lookSpeed.get()!=3)throw new IllegalStateException("Freelook upper bound ignored");free.lookSpeed.set(priorSpeed);
                    SlothClient.FREELOOK.setDown(false);free.releaseIfNeeded(mc);
                    if(free.looking()||mc.options.getCameraType()!=type)throw new IllegalStateException("Freelook release did not immediately restore previous view");
                    for(var perspective:net.minecraft.client.CameraType.values()) {
                        mc.options.setCameraType(perspective);SlothClient.FREELOOK.setDown(true);free.tick(mc);
                        if(mc.options.getCameraType()!=net.minecraft.client.CameraType.THIRD_PERSON_BACK)throw new IllegalStateException("Freelook rear view failed from "+perspective);
                        SlothClient.FREELOOK.setDown(false);free.releaseIfNeeded(mc);
                        if(free.looking()||mc.options.getCameraType()!=perspective)throw new IllegalStateException("Freelook restoration failed from "+perspective);
                    }
                    SlothClient.LOG.info("DEVCHECK Freelook rear view and immediate restoration passed from all perspectives");
                    SlothClient.LOG.info("DEVCHECK Freelook speed checks passed: {}x",free.lookSpeed.f());
                }finally{free.lookSpeed.set(priorSpeed);SlothClient.FREELOOK.setDown(false);free.tick(mc);free.setEnabled(false);free.setEnabled(enabled);mc.options.setCameraType(type);}
                SlothClient.LOG.info("DEVCHECK Zoom input and FOV checks passed");
                SlothClient.LOG.info("DEVCHECK world audit complete");
            }catch(Throwable t){SlothClient.LOG.error("DEVCHECK Zoom input and FOV FAILED",t);}
            phase=3;mc.stop();
        }
    }
}
