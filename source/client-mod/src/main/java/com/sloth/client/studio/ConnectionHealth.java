package com.sloth.client.studio;
import net.minecraft.client.Minecraft;
import java.util.*;
/** Passive, bounded observations. No extra packets or retained addresses/log text. */
public final class ConnectionHealth {
 private static final Deque<Integer> latency=new ArrayDeque<>();
 private static final Deque<String> events=new ArrayDeque<>();
 private static long sampled;private static volatile String clue="";
 public static void join(){latency.clear();sampled=0;clue="";}
 public static void tick(Minecraft mc){if(mc.player==null||mc.getConnection()==null||System.currentTimeMillis()-sampled<1000)return;sampled=System.currentTimeMillis();var info=mc.getConnection().getPlayerInfo(mc.player.getUUID());if(info==null||info.getLatency()<0)return;latency.addLast(info.getLatency());while(latency.size()>120)latency.removeFirst();}
 public static void observe(String logger,String message){if(message==null||logger==null||!(logger.toLowerCase(Locale.ROOT).contains("connection")||logger.toLowerCase(Locale.ROOT).contains("network")))return;String s=message.toLowerCase(Locale.ROOT);if(s.contains("timed out")||s.contains("timeout"))clue="Timeout observed";else if(s.contains("connection reset"))clue="Connection reset observed";else if(s.contains("disconnected"))clue="Disconnect observed";}
 public static void leave(){events.addFirst(java.time.LocalTime.now().withNano(0)+" · "+(clue.isBlank()?"Session ended; no classified network error":clue));while(events.size()>8)events.removeLast();clue="";}
 public static List<String> report(){var out=new ArrayList<String>();var sorted=latency.stream().mapToInt(Integer::intValue).sorted().toArray();out.add("Passive samples: "+sorted.length+" / 120 (roughly once per second)");if(sorted.length>0){int median=sorted[sorted.length/2],p95=sorted[Math.min(sorted.length-1,(int)Math.ceil(sorted.length*.95)-1)];out.add("Latest: "+latency.getLast()+" ms · median: "+median+" ms · p95: "+p95+" ms");out.add("Observed range: "+sorted[0]+"–"+sorted[sorted.length-1]+" ms");}var frames=FrameStats.read();out.add("Gameplay frame median / p95: "+String.format(Locale.ROOT,"%.1f / %.1f ms",frames.median(),frames.p95()));out.add("Latency is server-reported; it can stay unchanged between samples.");out.add("This does not measure packet loss, server TPS or identify a root cause.");out.add("High frame times suggest rendering pressure; high latency suggests a network/server delay.");out.add("Recent session endings (this game run only):");out.addAll(events);return out;}
}
