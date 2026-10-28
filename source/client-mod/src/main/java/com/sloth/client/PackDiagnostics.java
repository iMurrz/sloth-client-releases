package com.sloth.client;

import java.util.Locale;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;

/** Classifies pack failures without retaining log lines, URLs, account details or exception text. */
public final class PackDiagnostics {
 private static volatile String issue="";private static volatile long observed,notified;
 private static final java.util.LinkedHashSet<String> notices=new java.util.LinkedHashSet<>();
 public static synchronized java.util.List<String> notices(){return java.util.List.copyOf(notices);}
 public static void observe(String logger,String message,boolean warning){
  if(!warning||message==null)return;var finding=com.sloth.client.studio.PackClues.classify(logger,message);if(finding==null)return;String next=finding.advice();synchronized(PackDiagnostics.class){notices.add(next);while(notices.size()>6)notices.remove(notices.iterator().next());}if(!finding.failure())return;
  if(!next.equals(issue)||System.currentTimeMillis()-observed>30000){issue=next;observed=System.currentTimeMillis();}
 }
 public static String issue(){return issue;}
 public static synchronized void clear(){issue="";observed=0;notified=0;notices.clear();}
 public static void tick(Minecraft mc){if(observed>notified&&mc.player!=null){notified=observed;mc.player.displayClientMessage(net.minecraft.network.chat.Component.literal("Sloth: "+issue+" Studio → Server display help."),false);}}
 public static void render(GuiGraphics g){if(issue.isEmpty()||System.currentTimeMillis()-observed>12000)return;Minecraft mc=Minecraft.getInstance();if(mc.screen!=null)return;int w=Math.min(300,g.guiWidth()-12);g.fill(g.guiWidth()-w-6,6,g.guiWidth()-6,38,0xE0201727);g.drawString(mc.font,"Resource-pack problem · Open Studio",g.guiWidth()-w,10,0xFFFFBA70,false);g.drawString(mc.font,mc.font.plainSubstrByWidth(issue,w-12),g.guiWidth()-w,24,0xFFFFFFFF,false);}
}
