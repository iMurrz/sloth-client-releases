package com.sloth.client.module.impl;

import com.sloth.client.module.TextHudModule;
import com.sloth.client.module.Setting;
import com.sloth.client.studio.CosmicPrisons;
import com.sloth.client.studio.GameplayTracker;
import java.util.*;

/** Optional, fair-play HUDs backed only by local state and visible server messages. */
public final class CosmicHud {
    private CosmicHud(){}
    public static final class Mining extends TextHudModule {
        public Mining(){super("cosmic_mining","Cosmic Mining","Mining pace, visible energy gains, momentum and payday timers.",false,.02f,.30f);}
        protected List<String> lines(boolean preview){if(preview)return List.of("Cosmic Mining · 1,240 blocks","Pace 620/hr · Energy +18,400","Momentum 42:18 · Payday 0:09");long sec=Math.max(1,GameplayTracker.elapsedSeconds());return List.of("Cosmic Mining · "+GameplayTracker.blocks()+" blocks","Pace "+Math.round(GameplayTracker.blocks()*3600d/sec)+"/hr · Energy +"+compact(CosmicPrisons.energy()),"Momentum "+CosmicPrisons.momentum()+" · Payday "+CosmicPrisons.payday());}
    }
    public static final class Events extends TextHudModule {
        public Events(){super("cosmic_events","Cosmic Events","Visible Prison Break, Executive Mine, Ground Zero and event announcements.",false,.02f,.46f);}
        protected List<String> lines(boolean preview){return preview?List.of("Prison Break · 08:42","Round and event announcements appear here"):List.of("Cosmic event · "+CosmicPrisons.eventTimer(),shorten(CosmicPrisons.lastEvent(),54));}
    }
    public static final class Safety extends TextHudModule {
        public Safety(){super("cosmic_safety","Cosmic Safety","Inventory room, held-tool durability and visible enchant procs.",false,.02f,.58f);}
        protected List<String> lines(boolean preview){return preview?List.of("Inventory 7 slots · Pickaxe 68%","Visible enchant procs 14"):List.of("Inventory "+CosmicPrisons.openSlots()+" slots · "+shorten(CosmicPrisons.toolHealth(),32),"Visible enchant procs "+CosmicPrisons.procs());}
    }
    /** Manual roll worksheet: Cosmic changes its item lore often, so values are never guessed or scraped. */
    public static final class SetCalculator extends TextHudModule {
        public final Setting.Number helmet=add(new Setting.Number("helmet_roll","Helmet roll",0,0,10000,1,""));
        public final Setting.Number chest=add(new Setting.Number("chest_roll","Chestplate roll",0,0,10000,1,""));
        public final Setting.Number legs=add(new Setting.Number("legs_roll","Leggings roll",0,0,10000,1,""));
        public final Setting.Number boots=add(new Setting.Number("boots_roll","Boots roll",0,0,10000,1,""));
        public SetCalculator(){super("cosmic_set_calculator","Cosmic Set Calculator","Add four visible custom-set rolls without interpreting hidden item data.",false,.68f,.42f);}
        protected List<String> lines(boolean preview){int total=preview?428:helmet.i()+chest.i()+legs.i()+boots.i();return List.of("Custom set total · "+total,"H "+helmet.i()+" · C "+chest.i()+" · L "+legs.i()+" · B "+boots.i());}
    }
    private static String compact(double v){if(v>=1e9)return String.format(Locale.ROOT,"%.1fb",v/1e9);if(v>=1e6)return String.format(Locale.ROOT,"%.1fm",v/1e6);if(v>=1e3)return String.format(Locale.ROOT,"%.1fk",v/1e3);return Long.toString(Math.round(v));}
    private static String shorten(String s,int n){return s.length()>n?s.substring(0,n-1)+"…":s;}
}
