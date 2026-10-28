package com.sloth.client.studio;

import com.google.gson.*;
import com.sloth.client.SlothClient;
import net.fabricmc.loader.api.FabricLoader;
import java.nio.file.*;
import java.util.*;

/** Data-driven workspaces for the broader Cosmic companion. Only visible messages and manual entries are stored. */
public final class CosmicSuite {
    public enum Tool {
        EVENTS("Event & Competition Center","/events"), MIDAS("Midas Vault Assistant","/midas"), ANOMALY("Anomaly & Flashpoint Tracker","/events"),
        BLIZZARD("Blizzard & Surge Panel","/events"), BANDITS("Bandit & Moon Progression","/banditlevels"), ELEMENTALS("Elemental Warrior Assistant","/events"),
        LOCKBOXES("Lockbox Task Dashboard","/library"), SATCHELS("Satchel Manager","/extract "), GEAR("Gear Protection Audit","/inventory"),
        WORMHOLE("Wormhole Planner","/wormhole"), RATIONS("Ration & Perk Tracker","/toggles"), AUCTION("Auction Notebook 2.0","/ah"),
        BUILDS("Gear Build Library","/customsets"), CLUES("Clue Scroll Workspace","/clues"), COOLDOWNS("Teleport & Cooldown Board","/help"),
        DANGER("Safe-Zone & Danger Check","/spawn"), REPORTS("Session Reports","/stats"),
        PROGRESSION("Player Progression Planner","/stats"), PRESTIGE("Prestige Planner","/prestige"), LEVELCAP("Level-Cap Roadmap","/levelcap"),
        ROUTINES("Daily & Weekly Checklist","/daily"), RESET("Reset & Schedule Clock","/events"), GZ_CASES("Ground Zero Case Timers","/groundzero"),
        PETS("Pet Training Tracker","/pets"), GENERATORS("Generator & Fuel Ledger","/gens"), CELL_DEFENSE("Cell Defense & Raid Audit","/cells"),
        GANG_BOOSTERS("Gang Booster Tracker","/gang"), BOSSES("Boss Loadout & Attempt Log","/events"), DEATHBANS("Deathban Board","/events"),
        MERCHANTS("Merchant & Black Market Log","/market"), STASH("Stash & Claim Safety","/stash"), LOOT("Loot Collection Journal","/library"),
        GEAR_COMPARE("Gear Comparison Lab","/inventory"), TOKENS("Emblem & Ascended Token Library","/enchants"),
        MINING_ROUTES("Mining Route Notebook","/mines"), ORE_LEDGER("Ore Yield Ledger","/stats"), SHARDS("Shard Collection Tracker","/extract"),
        CONTRABANDS("Contraband Opening Journal","/showcase"), GKITS("G-Kit Cooldown Board","/gkit"), RANK_KITS("Rank Kit Checklist","/kit"),
        GIFTS("Gift Milestone Tracker","/gifts"), WORLD_BOSS("World Boss Preparation","/events"), STRONGHOLD("Stronghold Workspace","/stronghold"),
        COMMISSARY("Commissary Workspace","/commissary"), PIT("PvP Pit Workspace","/pit"), SECURE_VAULT("Secure Vault Inventory","/vault"),
        BLACK_AUCTION("Black Market Auction Log","/bah"), ITEM_FLIP("Item Flip Budget","/itemflip"), COIN_FLIP("Coin Flip Budget","/coinflip"),
        COSMIC_COINS("Cosmic Coin Ledger","/coins"), SKILL_TREE("Skill Tree Planner","/skills"), QUESTS("Quest & Objective Board","/quests"),
        SHOWCASE("Showcase Catalog","/showcase"), SUPPORT("Bug Evidence & Support Report","/help");
        public final String title,command;Tool(String title,String command){this.title=title;this.command=command;}
    }
    private static final Gson GSON=new GsonBuilder().setPrettyPrinting().create();
    private static final EnumMap<Tool,String> NOTES=new EnumMap<>(Tool.class); private static final EnumMap<Tool,Integer> COUNTS=new EnumMap<>(Tool.class);
    private static final EnumMap<Tool,String> STATUS=new EnumMap<>(Tool.class); private static final Deque<String> TIMELINE=new ArrayDeque<>();
    private static long lastEvent,lastBuff,lastDanger; private CosmicSuite(){}
    static{for(Tool t:Tool.values()){NOTES.put(t,"");COUNTS.put(t,0);STATUS.put(t,"No visible update yet");}}
    private static Path file(){return FabricLoader.getInstance().getConfigDir().resolve("sloth-client/cosmic-suite.json");}
    public static void load(){try{Path p=file();if(Files.isSymbolicLink(p)||!Files.isRegularFile(p)||Files.size(p)>512_000)return;JsonObject root=JsonParser.parseString(Files.readString(p)).getAsJsonObject();for(Tool t:Tool.values()){if(root.has("notes")&&root.getAsJsonObject("notes").has(t.name()))NOTES.put(t,clean(root.getAsJsonObject("notes").get(t.name()).getAsString(),600));if(root.has("counts")&&root.getAsJsonObject("counts").has(t.name()))COUNTS.put(t,Math.max(0,root.getAsJsonObject("counts").get(t.name()).getAsInt()));}}catch(Exception e){SlothClient.LOG.warn("Could not read Cosmic companion workspaces");}}
    public static void save(){try{JsonObject root=new JsonObject(),notes=new JsonObject(),counts=new JsonObject();for(Tool t:Tool.values()){notes.addProperty(t.name(),NOTES.get(t));counts.addProperty(t.name(),COUNTS.get(t));}root.add("notes",notes);root.add("counts",counts);Files.createDirectories(file().getParent());Path tmp=file().resolveSibling("cosmic-suite.json.tmp");if(Files.isSymbolicLink(file())||Files.isSymbolicLink(tmp))return;Files.writeString(tmp,GSON.toJson(root));Files.move(tmp,file(),StandardCopyOption.REPLACE_EXISTING);}catch(Exception e){SlothClient.LOG.warn("Could not save Cosmic companion workspaces");}}
    public static void note(Tool t,String value){NOTES.put(t,clean(value,600));save();} public static String note(Tool t){return NOTES.get(t);} public static int count(Tool t){return COUNTS.get(t);} public static void bump(Tool t){COUNTS.put(t,COUNTS.get(t)+1);save();} public static void reset(Tool t){COUNTS.put(t,0);save();}
    public static String status(Tool t){return STATUS.get(t);} public static List<String> timeline(){return List.copyOf(TIMELINE);}
    public static void receive(String raw){if(raw==null)return;String s=clean(raw.replaceAll("§.",""),160);if(s.isEmpty()||s.startsWith("[SLOTH-QA]"))return;String l=s.toLowerCase(Locale.ROOT);EnumSet<Tool> hit=EnumSet.noneOf(Tool.class);
        if(any(l,"event","competition","koth","meteor","prison break","prisonbreak","reboot"))hit.add(Tool.EVENTS);
        if(any(l,"midas","golden finger","blood diamond","bloody"))hit.add(Tool.MIDAS);
        if(any(l,"anomaly","flashpoint"))hit.add(Tool.ANOMALY);
        if(any(l,"blizzard","frozen bandit","lake effect","flash freeze"))hit.add(Tool.BLIZZARD);
        if(any(l,"bandit","moon","overseer","deathban"))hit.add(Tool.BANDITS);
        if(any(l,"cinder","zephyr","elemental","ascended token","warrior"))hit.add(Tool.ELEMENTALS);
        if(any(l,"lockbox","library task"))hit.add(Tool.LOCKBOXES);
        if(any(l,"satchel","absorber","contraband","shard"))hit.add(Tool.SATCHELS);
        if(any(l,"whitescroll","white scroll","durability","broken"))hit.add(Tool.GEAR);
        if(any(l,"wormhole","success rate","levelup rate","enchant offer"))hit.add(Tool.WORMHOLE);
        if(any(l,"ration","booster","multiplier","perk","payday","momentum")){hit.add(Tool.RATIONS);lastBuff=System.currentTimeMillis();}
        if(any(l,"auction","sold","purchase","listing"))hit.add(Tool.AUCTION);
        if(any(l,"custom set","greed set","death set","glacial","brittle"))hit.add(Tool.BUILDS);
        if(any(l,"clue","scroll"))hit.add(Tool.CLUES);
        if(any(l,"cooldown","wait before","seconds before","minutes before","teleport"))hit.add(Tool.COOLDOWNS);
        if(any(l,"combat tag","ground zero","danger","safezone","safe zone","lose your points")){hit.add(Tool.DANGER);lastDanger=System.currentTimeMillis();}
        if(any(l,"level up","mining level","player level","experience required"))hit.add(Tool.PROGRESSION);
        if(any(l,"prestige","rep point","reputation"))hit.add(Tool.PRESTIGE);
        if(any(l,"level cap","levelcap","daily cap"))hit.add(Tool.LEVELCAP);
        if(any(l,"daily","weekly","claim your kit","available again"))hit.add(Tool.ROUTINES);
        if(any(l,"reset","12pm","12 pm","midnight","schedule"))hit.add(Tool.RESET);
        if(any(l,"ground zero case","keycard","arcane relic","the armory"))hit.add(Tool.GZ_CASES);
        if(any(l,"pet","leveling pet","pet training"))hit.add(Tool.PETS);
        if(any(l,"generator","gen backpack","fuel"))hit.add(Tool.GENERATORS);
        if(any(l,"cell raid","cell guard","cell defense","raiding"))hit.add(Tool.CELL_DEFENSE);
        if(any(l,"gang booster","booster mastery","gang upgrade"))hit.add(Tool.GANG_BOOSTERS);
        if(any(l,"boss","bloody mary","cinder","zephyr","terra","tideborn"))hit.add(Tool.BOSSES);
        if(any(l,"deathban","cannot re-enter","re-enter in"))hit.add(Tool.DEATHBANS);
        if(any(l,"merchant","black market","mystery man"))hit.add(Tool.MERCHANTS);
        if(any(l,"stash","claim item","claim your"))hit.add(Tool.STASH);
        if(any(l,"received","reward","loot","drop","crate"))hit.add(Tool.LOOT);
        if(any(l,"armor rating","weapon damage","gear score","equipped"))hit.add(Tool.GEAR_COMPARE);
        if(any(l,"emblem","ascended token","sunburst","tsunami","upwind","earthquake"))hit.add(Tool.TOKENS);
        if(any(l,"mine route","mine warp","planet mine","mines unlocked"))hit.add(Tool.MINING_ROUTES);
        if(any(l,"ore gained","ores mined","refined ore","ore yield"))hit.add(Tool.ORE_LEDGER);
        if(any(l,"shard","shards found","shard satchel"))hit.add(Tool.SHARDS);
        if(any(l,"contraband","contraband satchel","contraband reward"))hit.add(Tool.CONTRABANDS);
        if(any(l,"g-kit","gkit","kit cooldown"))hit.add(Tool.GKITS);
        if(any(l,"rank kit","inmate kit","warden kit"))hit.add(Tool.RANK_KITS);
        if(any(l,"gift milestone","gift top","gift reward"))hit.add(Tool.GIFTS);
        if(any(l,"world boss","boss spawned","boss coordinates"))hit.add(Tool.WORLD_BOSS);
        if(any(l,"stronghold","set deathban"))hit.add(Tool.STRONGHOLD);
        if(any(l,"commissary","commissary chest"))hit.add(Tool.COMMISSARY);
        if(any(l,"pvp pit","the pit","/pit"))hit.add(Tool.PIT);
        if(any(l,"secure vault","vault slot","vault storage"))hit.add(Tool.SECURE_VAULT);
        if(any(l,"black market auction","/bah","highest bidder"))hit.add(Tool.BLACK_AUCTION);
        if(any(l,"itemflip","item flip","flip credit"))hit.add(Tool.ITEM_FLIP);
        if(any(l,"coinflip","coin flip","won the flip","lost the flip"))hit.add(Tool.COIN_FLIP);
        if(any(l,"cosmic coin","seasonal coin","lifetime coin"))hit.add(Tool.COSMIC_COINS);
        if(any(l,"skill tree","skill point","skill token"))hit.add(Tool.SKILL_TREE);
        if(any(l,"quest","objective","task complete"))hit.add(Tool.QUESTS);
        if(any(l,"showcase","added to showcase"))hit.add(Tool.SHOWCASE);
        if(any(l,"error","exception","report this","contact support"))hit.add(Tool.SUPPORT);
        if(hit.isEmpty())return;for(Tool t:hit){STATUS.put(t,s);COUNTS.put(t,COUNTS.get(t)+1);}lastEvent=System.currentTimeMillis();TIMELINE.addLast(s);while(TIMELINE.size()>30)TIMELINE.removeFirst();
    }
    private static boolean any(String s,String... terms){for(String t:terms)if(s.contains(t))return true;return false;} private static String clean(String s,int max){s=s==null?"":s.replaceAll("[\\p{Cntrl}]","").trim();return s.length()>max?s.substring(0,max):s;}
    public static String activity(){return ago(lastEvent);} public static String buffActivity(){return ago(lastBuff);} public static String dangerActivity(){return ago(lastDanger);} private static String ago(long at){if(at==0)return "none";long s=Math.max(0,(System.currentTimeMillis()-at)/1000);return s<60?s+"s ago":s/60+"m ago";}
    public static String report(){return GameplayTracker.sessionSummary()+" · Energy +"+Math.round(CosmicPrisons.energy())+" · $"+Math.round(CosmicPrisons.money())+" · Procs "+CosmicPrisons.procs();}
}
