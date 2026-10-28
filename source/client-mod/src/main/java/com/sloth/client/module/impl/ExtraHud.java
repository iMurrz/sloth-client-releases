package com.sloth.client.module.impl;

import com.sloth.client.module.Setting;
import com.sloth.client.module.TextHudModule;
import net.minecraft.client.Minecraft;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.Items;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.LightLayer;
import java.util.List;
import java.util.Locale;

/** Independent, editable readouts. All are optional and use only ordinary client data. */
public final class ExtraHud {
    private ExtraHud() {}
    private static Minecraft mc() { return Minecraft.getInstance(); }
    private static String item(ItemStack stack) {
        if (stack.isEmpty()) return "Empty";
        String name = stack.getHoverName().getString();
        if (name.length() > 40) name = name.substring(0, 39) + "…";
        return name + " ×" + stack.getCount();
    }
    public static final class Health extends TextHudModule {
        public Health() { super("health_hud", "Health", "Health and absorption points.", false, .23f, .30f); }
        protected List<String> lines(boolean preview) { var p = mc().player; return List.of(p == null || preview ? "Health 20 / 20  +4" : String.format(Locale.ROOT, "Health %.1f / %.1f  +%.1f", p.getHealth(), p.getMaxHealth(), p.getAbsorptionAmount())); }
    }
    public static final class Hunger extends TextHudModule {
        public Hunger() { super("hunger_hud", "Hunger", "Food and saturation values.", false, .23f, .35f); }
        protected List<String> lines(boolean preview) { var p = mc().player; return List.of(p == null || preview ? "Food 18 / 20" : "Food " + p.getFoodData().getFoodLevel() + " / 20", p == null || preview ? "Saturation 6.0" : String.format(Locale.ROOT, "Saturation %.1f", p.getFoodData().getSaturationLevel())); }
    }
    public static final class Air extends TextHudModule {
        public Air() { super("air_hud", "Air Supply", "Remaining underwater air; hides when full.", false, .23f, .42f); }
        public boolean hasContent() { var p = mc().player; return p != null && p.getAirSupply() < p.getMaxAirSupply(); }
        protected List<String> lines(boolean preview) { var p = mc().player; return List.of("Air " + (p == null || preview ? 65 : Math.max(0, Math.round(100f * p.getAirSupply() / Math.max(1, p.getMaxAirSupply())))) + "%"); }
    }
    public static final class Experience extends TextHudModule {
        public Experience() { super("xp_hud", "Experience", "Level and progress toward the next level.", false, .23f, .47f); }
        protected List<String> lines(boolean preview) { var p = mc().player; return List.of(p == null || preview ? "Level 30 · 65%" : "Level " + p.experienceLevel + " · " + Math.round(p.experienceProgress * 100) + "%"); }
    }
    public static final class Held extends TextHudModule {
        public Held() { super("held_item_hud", "Held Item", "Main-hand item and remaining durability.", false, .23f, .52f); }
        protected List<String> lines(boolean preview) {
            var p = mc().player; if (p == null || preview) return List.of("Diamond Pickaxe ×1", "Durability 1200 / 1561");
            var stack = p.getMainHandItem();
            return stack.isDamageableItem() ? List.of(item(stack), "Durability " + Math.max(0, stack.getMaxDamage() - stack.getDamageValue()) + " / " + stack.getMaxDamage()) : List.of(item(stack));
        }
    }
    public static final class Offhand extends TextHudModule {
        public Offhand() { super("offhand_hud", "Offhand Item", "Your offhand item and stack count.", false, .23f, .60f); }
        protected List<String> lines(boolean preview) { var p = mc().player; return List.of("Offhand: " + (p == null || preview ? "Totem of Undying ×1" : item(p.getOffhandItem()))); }
    }
    public static final class Light extends TextHudModule {
        public Light() { super("light_hud", "Light Levels", "Block and sky light at your position.", false, .50f, .30f); }
        protected List<String> lines(boolean preview) { var p = mc().player; var l = mc().level; return List.of(p == null || l == null || preview ? "Light: block 8 · sky 15" : "Light: block " + l.getBrightness(LightLayer.BLOCK, p.blockPosition()) + " · sky " + l.getBrightness(LightLayer.SKY, p.blockPosition())); }
    }
    public static final class Biome extends TextHudModule {
        public Biome() { super("biome_hud", "Biome", "A separate biome label for your layout.", false, .50f, .35f); }
        protected List<String> lines(boolean preview) { var p = mc().player; var l = mc().level; return List.of("Biome: " + (p == null || l == null || preview ? "Cherry Grove" : l.getBiome(p.blockPosition()).unwrapKey().map(k -> InfoHud.pretty(k.identifier().getPath())).orElse("Unknown"))); }
    }
    public static final class Dimension extends TextHudModule {
        public Dimension() { super("dimension_hud", "Dimension", "Current dimension name.", false, .50f, .40f); }
        protected List<String> lines(boolean preview) { var l = mc().level; return List.of(l == null || preview ? "Dimension: Overworld" : "Dimension: " + InfoHud.pretty(l.dimension().identifier().getPath())); }
    }
    public static final class Movement extends TextHudModule {
        public Movement() { super("movement_hud", "Movement Status", "Sprint, sneak and airborne status.", false, .50f, .45f); }
        protected List<String> lines(boolean preview) { var p = mc().player; return List.of(p == null || preview ? "Sprinting · Grounded" : (p.isCrouching() ? "Sneaking" : p.isSprinting() ? "Sprinting" : "Walking") + " · " + (p.onGround() ? "Grounded" : "Airborne")); }
    }
    public static final class ItemCounter extends TextHudModule {
        private net.minecraft.client.player.LocalPlayer sampledPlayer;
        private int count;
        private final Setting.Choice type = add(new Setting.Choice("item", "Count item", "Ender Pearls", "Ender Pearls", "Arrows", "Totems", "Firework Rockets", "Golden Apples"));
        public ItemCounter() { super("item_count_hud", "Item Counter", "Count a chosen item across inventory and offhand.", false, .50f, .50f); }
        @Override public void tick(Minecraft mc) {
            Item wanted = switch (type.get()) { case "Arrows" -> Items.ARROW; case "Totems" -> Items.TOTEM_OF_UNDYING; case "Firework Rockets" -> Items.FIREWORK_ROCKET; case "Golden Apples" -> Items.GOLDEN_APPLE; default -> Items.ENDER_PEARL; };
            sampledPlayer=mc.player;count=0;
            if(sampledPlayer!=null){for(var stack:sampledPlayer.getInventory().getNonEquipmentItems())if(stack.is(wanted))count+=stack.getCount();if(sampledPlayer.getOffhandItem().is(wanted))count+=sampledPlayer.getOffhandItem().getCount();}
        }
        protected List<String> lines(boolean preview) {var p=mc().player;return List.of(type.get()+": "+(p==null||preview?16:p==sampledPlayer?count:0));}
    }
    public static final class Entities extends TextHudModule {
        private int count, ticks;
        public Entities() { super("entities_hud", "Loaded Entities", "Client-loaded entity count, refreshed once a second.", false, .50f, .55f); }
        public void tick(Minecraft mc) { if (mc.level == null) { count = ticks = 0; return; } if (++ticks % 20 == 0) { count = 0; for (var entity : mc.level.entitiesForRendering()) { if (++count >= 4096) break; } } }
        protected List<String> lines(boolean preview) { return List.of("Loaded entities: " + (preview ? "42" : count >= 4096 ? "4096+" : count)); }
    }
}
