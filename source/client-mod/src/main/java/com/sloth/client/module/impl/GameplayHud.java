package com.sloth.client.module.impl;

import com.sloth.client.module.Setting;
import com.sloth.client.module.TextHudModule;
import com.sloth.client.studio.GameplayTracker;
import java.util.*;

/** Goal, recovery, planner and session readouts backed by the bounded local gameplay tracker. */
public final class GameplayHud {
    private GameplayHud(){}
    public static final class Session extends TextHudModule {
        public final Setting.Number blockGoal=add(new Setting.Number("block_goal","Blocks goal",1000,10,1000000,10,""));
        public final Setting.Number minuteGoal=add(new Setting.Number("minute_goal","Minutes goal",60,5,1440,5," min"));
        private final Setting.Bool notices=add(new Setting.Bool("goal_notices","Notify when goals are reached",true));
        private boolean blockNotice,timeNotice;
        public Session(){super("session_goals","Session Goals","Track mining, time, distance, items and deaths for this session.",false,.35f,.20f);}
        protected List<String> lines(boolean preview){if(preview)return List.of("Blocks 420 / 1,000","Time 24 / 60 min","Distance 3,240 m · Items +86");long b=GameplayTracker.blocks(),minutes=GameplayTracker.elapsedSeconds()/60;return List.of("Blocks "+b+" / "+blockGoal.i(),"Time "+minutes+" / "+minuteGoal.i()+" min","Distance "+Math.round(GameplayTracker.distance())+" m · Items +"+GameplayTracker.itemsGained());}
        @Override public void tick(net.minecraft.client.Minecraft mc){if(mc.player==null){blockNotice=timeNotice=false;return;}if(notices.on()&&!blockNotice&&GameplayTracker.blocks()>=blockGoal.i()){blockNotice=true;mc.player.displayClientMessage(net.minecraft.network.chat.Component.literal("Sloth goal reached · "+blockGoal.i()+" blocks mined"),false);}if(notices.on()&&!timeNotice&&GameplayTracker.elapsedSeconds()>=minuteGoal.i()*60L){timeNotice=true;mc.player.displayClientMessage(net.minecraft.network.chat.Component.literal("Sloth goal reached · "+minuteGoal.i()+" minutes played"),false);}}
    }
    public static final class Recovery extends TextHudModule {
        public Recovery(){super("recovery_hud","Death & Bookmarks","Show the latest saved death or gameplay bookmark.",false,.35f,.32f);}
        public boolean hasContent(){return GameplayTracker.lastPoint()!=null;}
        protected List<String> lines(boolean preview){var p=GameplayTracker.lastPoint();return List.of(preview?"Death: 120, 64, -340 · overworld":(p==null?"No saved locations":p.label()+": "+GameplayTracker.coords(p)));}
    }
    public static final class Planner extends TextHudModule {
        public final Setting.Text itemId=add(new Setting.Text("item_id","Target item ID","minecraft:cobblestone",80));
        public final Setting.Number target=add(new Setting.Number("target","Target amount",64,1,1000000,1,""));
        public final Setting.Bool durability=add(new Setting.Bool("durability_warning","Warn below 10% durability",true));
        public final Setting.Number durabilityAt=add(new Setting.Number("durability_at","Durability warning threshold",10,1,75,1,"%"));
        private boolean targetNotice,durabilityNotice;
        public Planner(){super("inventory_planner","Inventory Planner","Track a material target and warn about low tool durability.",false,.35f,.42f);durabilityAt.visibleWhen(durability::on);}
        protected List<String> lines(boolean preview){int count=preview?32:GameplayTracker.inventoryCount(itemId.get());List<String> out=new ArrayList<>();out.add("Target "+itemId.get().replace("minecraft:","")+" "+count+" / "+target.i());var p=net.minecraft.client.Minecraft.getInstance().player;if(!preview&&durability.on()&&p!=null&&p.getMainHandItem().isDamageableItem()){var s=p.getMainHandItem();int left=s.getMaxDamage()-s.getDamageValue();if(left*100<=s.getMaxDamage()*durabilityAt.i())out.add("Tool durability low: "+left); }return out;}
        @Override public void tick(net.minecraft.client.Minecraft mc){if(mc.player==null){targetNotice=durabilityNotice=false;return;}int count=GameplayTracker.inventoryCount(itemId.get());if(count<target.i())targetNotice=false;else if(!targetNotice){targetNotice=true;mc.player.displayClientMessage(net.minecraft.network.chat.Component.literal("Sloth material target reached · "+itemId.get()+" "+count+" / "+target.i()),false);}var s=mc.player.getMainHandItem();boolean low=durability.on()&&s.isDamageableItem()&&(s.getMaxDamage()-s.getDamageValue())*100<=s.getMaxDamage()*durabilityAt.i();if(!low)durabilityNotice=false;else if(!durabilityNotice){durabilityNotice=true;mc.player.displayClientMessage(net.minecraft.network.chat.Component.literal("Sloth durability warning · "+s.getHoverName().getString()),false);}}
    }
    public static final class Builder extends TextHudModule {
        public Builder(){super("builder_measure","Builder Measure","Measure distance and dimensions from a saved build anchor.",false,.35f,.52f);}
        protected List<String> lines(boolean preview){if(preview)return List.of("Build 12 × 5 × 18 · 22 blocks","Chunk 7, -4 · inside 8, 11");var p=net.minecraft.client.Minecraft.getInstance().player;if(p==null)return List.of(GameplayTracker.buildMeasure());return List.of(GameplayTracker.buildMeasure(),"Chunk "+Math.floorDiv(p.getBlockX(),16)+", "+Math.floorDiv(p.getBlockZ(),16)+" · inside "+Math.floorMod(p.getBlockX(),16)+", "+Math.floorMod(p.getBlockZ(),16));}
    }
    public static final class Combat extends TextHudModule {
        public Combat(){super("combat_recap","Combat Practice","Local attack, hit, damage and recent frame-pacing counters.",false,.68f,.55f);}
        protected List<String> lines(boolean preview){int a=preview?24:GameplayTracker.attacks();return List.of("Attack events "+a+" · Damage alerts "+(preview?8:GameplayTracker.damageTaken()),"Pair with CPS, Reach and Combo HUDs for practice");}
    }
}
