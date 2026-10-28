package com.sloth.client.studio;

import com.google.gson.*;
import com.sloth.client.SlothClient;
import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.client.Minecraft;
import net.minecraft.world.item.ItemStack;

import java.nio.file.*;
import java.util.*;
import java.util.regex.*;

/** Local Cosmic Prisons assistant. It only interprets text already delivered to the client. */
public final class CosmicPrisons {
    private static final Gson GSON=new GsonBuilder().setPrettyPrinting().create();
    private static final Pattern DURATION=Pattern.compile("(?i)(\\d+)\\s*(h|hr|hour|m|min|minute|s|sec|second)s?");
    private static final Pattern NUMBER=Pattern.compile("(?i)(?:\\$|\\+)?([0-9][0-9,.]*)([kmbt]?)");
    private static final Deque<String> JOURNAL=new ArrayDeque<>();
    private static String note="",gang="",cell="",lastEvent="Waiting for a visible server announcement";
    private static long momentumUntil,paydayUntil,eventUntil;
    private static double energyGained,moneyGained; private static int procs;
    private static long lastMessage;
    private CosmicPrisons(){}
    private static Path file(){return FabricLoader.getInstance().getConfigDir().resolve("sloth-client/cosmic-prisons.json");}
    public static void load(){
        try{Path p=file();if(Files.isSymbolicLink(p)||!Files.isRegularFile(p)||Files.size(p)>128_000)return;JsonObject o=JsonParser.parseString(Files.readString(p)).getAsJsonObject();note=text(o,"note",240);gang=text(o,"gang",80);cell=text(o,"cell",120);}
        catch(Exception e){SlothClient.LOG.warn("Could not read Cosmic Prisons notes");}
    }
    private static String text(JsonObject o,String key,int max){String s=o.has(key)?o.get(key).getAsString():"";return clean(s,max);}
    private static String clean(String s,int max){s=s==null?"":s.replaceAll("[\\p{Cntrl}§]","").trim();return s.length()>max?s.substring(0,max):s;}
    public static void save(){try{JsonObject o=new JsonObject();o.addProperty("note",note);o.addProperty("gang",gang);o.addProperty("cell",cell);Files.createDirectories(file().getParent());Path tmp=file().resolveSibling("cosmic-prisons.json.tmp");if(Files.isSymbolicLink(file())||Files.isSymbolicLink(tmp))return;Files.writeString(tmp,GSON.toJson(o));Files.move(tmp,file(),StandardCopyOption.REPLACE_EXISTING);}catch(Exception e){SlothClient.LOG.warn("Could not save Cosmic Prisons notes");}}
    public static void setNotes(String n,String g,String c){note=clean(n,240);gang=clean(g,80);cell=clean(c,120);save();}
    public static String note(){return note;} public static String gang(){return gang;} public static String cell(){return cell;}
    public static void resetSession(){momentumUntil=paydayUntil=eventUntil=0;energyGained=moneyGained=0;procs=0;lastEvent="Waiting for a visible server announcement";JOURNAL.clear();}

    public static void receive(String raw,boolean overlay){
        if(raw==null)return;String s=raw.replaceAll("§.","").replaceAll("\\s+"," ").trim();if(s.isEmpty())return;
        long now=System.currentTimeMillis();if(now-lastMessage<100&&Objects.equals(JOURNAL.peekLast(),s))return;lastMessage=now;
        String low=s.toLowerCase(Locale.ROOT);
        if(low.contains("momentum")){long ms=durationMillis(s);if(ms>0)momentumUntil=now+ms;record(s);}
        if(low.contains("payday")){paydayUntil=now+15_000;record(s);}
        if(low.contains("prison break")||low.contains("prisonbreak")){long ms=durationMillis(s);eventUntil=ms>0?now+ms:0;lastEvent=s;record(s);}
        if(low.contains("executive mine")||low.contains("ground zero")||low.contains("meteor")||low.contains("koth")){lastEvent=s;long ms=durationMillis(s);if(ms>0)eventUntil=now+ms;record(s);}
        if(low.contains("energy")){double v=firstNumber(s);if(v>0)energyGained+=v;record(s);}
        if(low.contains("$")){double v=firstNumber(s);if(v>0)moneyGained+=v;}
        if(low.contains("proc")||low.contains("activated")||low.contains("enchant triggered")){procs++;record(s);}
    }
    private static void record(String s){String v=clean(s,100);if(v.isEmpty()||v.equals(JOURNAL.peekLast()))return;JOURNAL.addLast(v);while(JOURNAL.size()>12)JOURNAL.removeFirst();}
    private static long durationMillis(String s){Matcher m=DURATION.matcher(s);long total=0;while(m.find()){long n=Long.parseLong(m.group(1));String u=m.group(2).toLowerCase(Locale.ROOT);total+=n*(u.startsWith("h")?3_600_000L:u.startsWith("m")?60_000L:1_000L);}return total;}
    private static double firstNumber(String s){Matcher m=NUMBER.matcher(s);if(!m.find())return 0;try{double v=Double.parseDouble(m.group(1).replace(",",""));return v*switch(m.group(2).toLowerCase(Locale.ROOT)){case "k"->1e3;case "m"->1e6;case "b"->1e9;case "t"->1e12;default->1;};}catch(Exception e){return 0;}}
    private static String timer(long until){long seconds=Math.max(0,(until-System.currentTimeMillis()+999)/1000);return seconds<=0?"inactive":String.format(Locale.ROOT,"%d:%02d",seconds/60,seconds%60);}
    public static String momentum(){return timer(momentumUntil);} public static String payday(){return timer(paydayUntil);} public static String eventTimer(){return timer(eventUntil);}
    public static String lastEvent(){return lastEvent;} public static int procs(){return procs;} public static double energy(){return energyGained;} public static double money(){return moneyGained;}
    public static List<String> journal(){return List.copyOf(JOURNAL);}
    public static int openSlots(){Minecraft mc=Minecraft.getInstance();if(mc.player==null)return 0;int free=0;for(ItemStack s:mc.player.getInventory().getNonEquipmentItems())if(s.isEmpty())free++;return free;}
    public static String toolHealth(){Minecraft mc=Minecraft.getInstance();if(mc.player==null)return "No tool";ItemStack s=mc.player.getMainHandItem();if(!s.isDamageableItem())return s.isEmpty()?"Empty hand":s.getHoverName().getString();int left=s.getMaxDamage()-s.getDamageValue();return s.getHoverName().getString()+" "+Math.round(left*100f/s.getMaxDamage())+"%";}
}
