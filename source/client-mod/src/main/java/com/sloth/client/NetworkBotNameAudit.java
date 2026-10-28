package com.sloth.client;

import com.sloth.client.module.ModuleManager;
import com.sloth.client.module.impl.CameraModules;
import net.minecraft.client.Minecraft;
import net.minecraft.client.player.AbstractClientPlayer;
import net.minecraft.core.BlockPos;
import net.minecraft.network.chat.Component;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.GameType;
import net.minecraft.world.scores.Team;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.nio.file.Files;

/** A real protocol client connects only to this opt-in fixture's loopback listener. */
final class NetworkBotNameAudit {
    private static int ticks,phase,readyTick;
    private static volatile boolean placed;
    private static volatile String failure;
    private static AbstractClientPlayer other;
    private static void require(boolean value,String message){if(!value)throw new IllegalStateException("DEVCHECK network bot FAILED: "+message);}
    static void tick(Minecraft mc){
        try {
            ++ticks;require(ticks<2400,"bot fixture timed out");if(failure!=null)throw new IllegalStateException(failure);
            var server=mc.getSingleplayerServer();
            if(phase==0){
                phase=1;org.lwjgl.glfw.GLFW.glfwFocusWindow(mc.getWindow().handle());
                server.execute(()->{try{
                    int port;try(var socket=new ServerSocket(0,1,InetAddress.getLoopbackAddress())){port=socket.getLocalPort();}
                    server.setUsesAuthentication(false);
                    server.getConnection().startTcpServerListener(InetAddress.getByName("127.0.0.1"),port);
                    var dir=mc.gameDirectory.toPath().resolve("sloth-devcheck");Files.createDirectories(dir);
                    Files.writeString(dir.resolve("bot-server.json"),"{\"host\":\"127.0.0.1\",\"port\":"+port+",\"version\":\"1.21.11\"}");
                }catch(Exception e){failure=e.toString();}});return;
            }
            if(phase==1){
                var bot=server.getPlayerList().getPlayerByName("SlothBot");if(bot==null)return;
                phase=2;var position=mc.player.blockPosition();
                server.execute(()->{try{
                    var level=server.overworld();
                    for(int x=-5;x<=5;x++)for(int z=-5;z<=5;z++)for(int y=-1;y<=5;y++)
                        level.setBlockAndUpdate(position.offset(x,y,z),y==-1?Blocks.STONE.defaultBlockState():Blocks.AIR.defaultBlockState());
                    level.setDayTime(6000);bot.setGameMode(GameType.CREATIVE);
                    bot.teleportTo(position.getX()+2.5,position.getY(),position.getZ()+3.5);
                    placed=true;
                }catch(Exception e){failure=e.toString();}});return;
            }
            if(phase==2){
                if(!placed)return;
                other=mc.level.players().stream().filter(p->p!=mc.player&&p.getGameProfile().name().equals("SlothBot")).findFirst().orElse(null);
                if(other==null||other.distanceToSqr(mc.player)>30)return;
                readyTick=ticks;phase=3;return;
            }
            if(phase==3&&ticks-readyTick>=20){
                require(mc.isWindowActive(),"test window lacks focus");
                var free=ModuleManager.get(CameraModules.Freelook.class);free.setEnabled(true);free.resetSettings();
                mc.player.setYRot(0);mc.player.setXRot(0);mc.player.setYHeadRot(0);
                require(NameTagAudit.tag(mc,mc.player)==null,"own name outside Freelook");require(NameTagAudit.tag(mc,other)!=null,"bot name outside Freelook");
                SlothClient.FREELOOK.setDown(true);free.tick(mc);require(free.looking(),"Freelook did not activate");
                require(NameTagAudit.tag(mc,mc.player)!=null&&NameTagAudit.tag(mc,other)!=null,"names missing in Freelook");
                for(int i=0;i<4;i++){free.turn(80,0);require(NameTagAudit.tag(mc,mc.player)!=null&&NameTagAudit.tag(mc,other)!=null,"names missing after rotation");}
                SlothClient.FREELOOK.setDown(false);free.tick(mc);require(NameTagAudit.tag(mc,mc.player)==null&&NameTagAudit.tag(mc,other)!=null,"release failed");
                SlothClient.FREELOOK.setDown(true);free.tick(mc);
                phase=4;readyTick=ticks;
                server.execute(()->{var board=server.overworld().getScoreboard();var team=board.addPlayerTeam("SlothBotNames");team.setNameTagVisibility(Team.Visibility.ALWAYS);team.setPlayerPrefix(Component.literal("[TEST] "));board.addPlayerToTeam(mc.player.getScoreboardName(),team);board.addPlayerToTeam("SlothBot",team);});
            }
            if(phase==4&&ticks-readyTick>=20){
                require(NameTagAudit.tag(mc,mc.player).getString().contains("[TEST]")&&NameTagAudit.tag(mc,other).getString().contains("[TEST]"),"network team prefixes missing");
                var folder=new java.io.File(mc.gameDirectory,"sloth-devcheck");new java.io.File(folder,"screenshots").mkdirs();
                net.minecraft.client.Screenshot.grab(folder,"devcheck-freelook-network-bot.png",mc.getMainRenderTarget(),1,message->SlothClient.LOG.info("DEVCHECK network bot capture"));
                phase=5;readyTick=ticks;server.execute(()->server.overworld().getScoreboard().getPlayerTeam("SlothBotNames").setNameTagVisibility(Team.Visibility.NEVER));
            }
            if(phase==5&&ticks-readyTick>=20){
                require(NameTagAudit.tag(mc,mc.player)==null&&NameTagAudit.tag(mc,other)==null,"network hidden-name rule bypassed");
                Files.writeString(mc.gameDirectory.toPath().resolve("sloth-devcheck/name-tags.json"),"{\"networkBot\":true,\"botName\":\"SlothBot\",\"serverPlayers\":"+server.getPlayerList().getPlayerCount()+",\"extractionChecksPassed\":true,\"rotationChecksPassed\":true,\"teamPrefixesPassed\":true,\"hiddenNamesPassed\":true}");
                SlothClient.LOG.info("DEVCHECK name tag audit complete");mc.stop();
            }
        }catch(Exception error){SlothClient.LOG.error("DEVCHECK network bot FAILED",error);mc.stop();}
    }
}
