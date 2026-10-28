package com.sloth.client;

import com.sloth.client.module.ModuleManager;
import com.sloth.client.module.impl.CameraModules;
import com.mojang.authlib.GameProfile;
import net.minecraft.client.Minecraft;
import net.minecraft.client.player.RemotePlayer;
import net.minecraft.network.chat.Component;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.scores.Team;
import java.nio.file.Files;
import java.util.UUID;

/** Isolated, opt-in rendering checks; never creates entities during ordinary play. */
final class NameTagAudit {
    private static int ticks;
    private static RemotePlayer other;
    private static void require(boolean value,String reason){if(!value)throw new IllegalStateException("DEVCHECK name tags FAILED: "+reason);}
    static Component tag(Minecraft mc,net.minecraft.client.player.AbstractClientPlayer player){
        return mc.getEntityRenderDispatcher().getRenderer(player).createRenderState(player,0).nameTag;
    }
    static void tick(Minecraft mc){
        if(Boolean.getBoolean("sloth.devCheckNetworkBot")){NetworkBotNameAudit.tick(mc);return;}
        try {
            ++ticks;
            if(ticks==1)org.lwjgl.glfw.GLFW.glfwFocusWindow(mc.getWindow().handle());
            if(ticks==20){
                require(mc.isWindowActive(),"fixture window lacks focus");
                other=new RemotePlayer(mc.level,new GameProfile(UUID.fromString("00000000-0000-0000-0000-000000000002"),"SlothOther"));
                other.setId(-1200);other.setPos(mc.player.getX()+2,mc.player.getY(),mc.player.getZ()+2);other.setOldPosAndRot();mc.level.addEntity(other);
                var free=ModuleManager.get(CameraModules.Freelook.class);free.setEnabled(true);free.resetSettings();
                require(tag(mc,mc.player)==null,"own name should remain vanilla outside Freelook");
                require(tag(mc,other)!=null,"other player name missing before Freelook");
                SlothClient.FREELOOK.setDown(true);free.tick(mc);
                require(free.looking(),"Freelook activation");
                require(tag(mc,mc.player)!=null,"own name missing during Freelook");
                require(tag(mc,other)!=null,"other player name missing during Freelook");
                var observation=com.sloth.client.studio.FreelookDiagnostics.snapshot(mc);
                require(observation.get("ownNameAvailable").getAsBoolean()&&observation.get("otherNamesAvailable").getAsInt()>0,"Freelook diagnostics missed available names");
                require(!observation.toString().contains("SlothOther")&&!observation.toString().contains("SlothAudit"),"Diagnostic contains player names");
                if(!com.sloth.client.studio.FreelookDiagnostics.enabled())com.sloth.client.studio.Preferences.toggle("freelookDiagnostics");
                com.sloth.client.studio.FreelookDiagnostics.tick(mc);
                com.sloth.client.studio.FreelookDiagnostics.save().join();
                var diagnosticFile=net.fabricmc.loader.api.FabricLoader.getInstance().getConfigDir().resolve("sloth-client/freelook-diagnostics.json");
                var diagnostic=com.google.gson.JsonParser.parseString(Files.readString(diagnosticFile)).getAsJsonObject();
                require(diagnostic.getAsJsonArray("samples").size()>0,"Diagnostic save omitted observations");
                for(int i=0;i<4;i++){free.turn(600,0);require(tag(mc,mc.player)!=null&&tag(mc,other)!=null,"name extraction changed with camera rotation");}
                var board=mc.level.getScoreboard();var team=board.addPlayerTeam("SlothNameAudit");
                board.addPlayerToTeam(mc.player.getScoreboardName(),team);board.addPlayerToTeam(other.getScoreboardName(),team);
                team.setNameTagVisibility(Team.Visibility.NEVER);
                require(tag(mc,mc.player)==null&&tag(mc,other)==null,"server hidden-name rule bypassed");
                team.setNameTagVisibility(Team.Visibility.ALWAYS);team.setPlayerPrefix(Component.literal("[Rank] "));
                require(tag(mc,mc.player).getString().contains("[Rank]")&&tag(mc,other).getString().contains("[Rank]"),"team prefix missing");
                board.removePlayerFromTeam(mc.player.getScoreboardName(),team);board.removePlayerFromTeam(other.getScoreboardName(),team);board.removePlayerTeam(team);
                mc.options.hideGui=true;require(tag(mc,mc.player)==null&&tag(mc,other)==null,"hidden GUI names visible");mc.options.hideGui=false;
                mc.player.setInvisible(true);other.setInvisible(true);require(tag(mc,mc.player)==null&&tag(mc,other)==null,"invisible names visible");mc.player.setInvisible(false);other.setInvisible(false);
                SlothClient.FREELOOK.setDown(false);free.tick(mc);require(!free.looking()&&tag(mc,mc.player)==null&&tag(mc,other)!=null,"release behavior");
                SlothClient.FREELOOK.setDown(true);free.tick(mc);
                SlothClient.LOG.info("DEVCHECK name tag extraction checks passed");
            }
            if(ticks==40){
                var folder=new java.io.File(mc.gameDirectory,"sloth-devcheck");new java.io.File(folder,"screenshots").mkdirs();
                net.minecraft.client.Screenshot.grab(folder,"devcheck-freelook-names.png",mc.getMainRenderTarget(),1,message->SlothClient.LOG.info("DEVCHECK name tag capture"));
            }
            if(ticks>=60&&Files.exists(mc.gameDirectory.toPath().resolve("sloth-devcheck/screenshots/devcheck-freelook-names.png"))){
                Files.writeString(mc.gameDirectory.toPath().resolve("sloth-devcheck/name-tags.json"),"{\"extractionChecksPassed\":true,\"scope\":\"Synthetic local and remote player; no live server\"}");
                SlothClient.FREELOOK.setDown(false);ModuleManager.get(CameraModules.Freelook.class).tick(mc);other.remove(Entity.RemovalReason.DISCARDED);
                SlothClient.LOG.info("DEVCHECK name tag audit complete");mc.stop();
            }
        }catch(Exception error){SlothClient.LOG.error("DEVCHECK name tags FAILED",error);mc.stop();}
    }
}
