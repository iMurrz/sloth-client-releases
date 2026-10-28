package com.sloth.client.module;

import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;

import java.util.Map;
import java.util.Set;

/** Card icons: the game's own items, so every module gets a crisp, recognisable picture. */
public final class ModuleIcons {
    private static final Map<String, Item> ICONS = Map.ofEntries(
        Map.entry("coordinates", Items.COMPASS), Map.entry("inventory", Items.CHEST), Map.entry("fps", Items.REDSTONE_TORCH),
        Map.entry("ping", Items.LIGHTNING_ROD), Map.entry("cps", Items.STONE_BUTTON), Map.entry("memory", Items.REDSTONE),
        Map.entry("clock", Items.CLOCK), Map.entry("server_address", Items.NAME_TAG), Map.entry("armor_status", Items.DIAMOND_CHESTPLATE),
        Map.entry("potion_effects", Items.POTION), Map.entry("keystrokes", Items.LEVER), Map.entry("direction", Items.RECOVERY_COMPASS),
        Map.entry("saturation", Items.COOKED_BEEF), Map.entry("speed", Items.SUGAR), Map.entry("reach", Items.IRON_SWORD),
        Map.entry("combo", Items.BLAZE_POWDER), Map.entry("playtime", Items.EXPERIENCE_BOTTLE), Map.entry("stopwatch", Items.COMPARATOR),
        Map.entry("day_counter", Items.DAYLIGHT_DETECTOR), Map.entry("pack_display", Items.PAINTING), Map.entry("looking_at", Items.ITEM_FRAME),
        Map.entry("main_menu", Items.NETHER_STAR), Map.entry("menu_theme", Items.FIRE_CHARGE), Map.entry("zoom", Items.SPYGLASS), Map.entry("freelook", Items.ENDER_EYE),
        Map.entry("fullbright", Items.GLOWSTONE), Map.entry("crosshair", Items.TARGET), Map.entry("time_changer", Items.SUNFLOWER),
        Map.entry("weather_changer", Items.WATER_BUCKET), Map.entry("particles", Items.FIREWORK_STAR), Map.entry("sprint", Items.FEATHER),
        Map.entry("sneak", Items.LEATHER_BOOTS), Map.entry("hotkeys", Items.WRITABLE_BOOK), Map.entry("chat_timestamps", Items.PAPER), Map.entry("smooth_chat", Items.OAK_SIGN),
        Map.entry("smart_disconnect", Items.BARRIER), Map.entry("mining_sync", Items.IRON_PICKAXE), Map.entry("cooldowns", Items.ENDER_PEARL),
        Map.entry("better_sounds", Items.NOTE_BLOCK), Map.entry("auto_text_actions", Items.WRITABLE_BOOK),
        Map.entry("streamer_mode", Items.SHIELD), Map.entry("chat_hub", Items.ECHO_SHARD), Map.entry("nether_coordinates", Items.CRYING_OBSIDIAN),
        Map.entry("health_hud", Items.GLISTERING_MELON_SLICE), Map.entry("hunger_hud", Items.COOKED_BEEF), Map.entry("air_hud", Items.BUCKET), Map.entry("xp_hud", Items.EXPERIENCE_BOTTLE),
        Map.entry("held_item_hud", Items.DIAMOND_PICKAXE), Map.entry("offhand_hud", Items.TOTEM_OF_UNDYING), Map.entry("light_hud", Items.TORCH), Map.entry("biome_hud", Items.CHERRY_SAPLING),
        Map.entry("dimension_hud", Items.OBSIDIAN), Map.entry("movement_hud", Items.LEATHER_BOOTS), Map.entry("item_count_hud", Items.ENDER_PEARL), Map.entry("entities_hud", Items.ARMOR_STAND));

    /** Shown under the NEW filter. */
    public static final Set<String> NEW = Set.of("cooldowns", "main_menu", "menu_theme", "smooth_chat", "looking_at", "mining_sync", "better_sounds", "auto_text_actions", "health_hud", "hunger_hud", "air_hud", "xp_hud", "held_item_hud", "offhand_hud", "light_hud", "biome_hud", "dimension_hud", "movement_hud", "item_count_hud", "entities_hud");

    private ModuleIcons() {}

    public static ItemStack icon(String id) {
        return new ItemStack(ICONS.getOrDefault(id, Items.BOOK));
    }
}
