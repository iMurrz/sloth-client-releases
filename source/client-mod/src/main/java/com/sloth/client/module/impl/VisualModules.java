package com.sloth.client.module.impl;

import com.sloth.client.screen.Ui;

import com.sloth.client.module.Module;
import com.sloth.client.module.Setting;
import net.minecraft.client.CameraType;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.world.phys.HitResult;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;

import java.util.concurrent.ThreadLocalRandom;

/** Client-side visual tweaks. None of these change what the server sees. */
public final class VisualModules {
    private VisualModules() {}

    public static final class MainMenu extends Module {
        public final Setting.Bool parallax = add(new Setting.Bool("parallax", "Parallax background", true));
        public final Setting.Bool particles = add(new Setting.Bool("particles", "Ambient particles", true));
        public MainMenu() { super("main_menu", "Sloth Main Menu", "Sloth's permanent modern title screen. Customize its particles and parallax.", Category.VISUAL, true); }
        @Override public boolean isAlwaysEnabled() { return true; }
    }

    public static final class MenuTheme extends Module {
        public final Setting.Bool animations = add(new Setting.Bool("animations", "Smooth animations", true));
        public final Setting.Number animationSpeed = add(new Setting.Number("animation_speed", "Menu motion speed", 1, 0.5, 2, 0.1, "x"));
        public final Setting.Choice hudFont = add(new Setting.Choice("hud_font", "Sloth HUD font", "Sloth", "Sloth", "Resource pack"));
        public MenuTheme() { super("menu_theme", "Sloth Menu Theme", "Minecraft's own menus (options, worlds, servers, pause menu and other mods) restyled to match Sloth.", Category.VISUAL, true); }
        @Override public boolean isAlwaysEnabled() { return true; }
    }

    public static final class Fullbright extends Module {
        public final Setting.Number brightness = add(new Setting.Number("brightness", "Brightness", 10, 1, 15, 0.5, "x"));
        public Fullbright() { super("fullbright", "Fullbright", "See clearly in dark mines and caves.", Category.VISUAL, false); }
    }

    public static final class TimeChanger extends Module {
        public final Setting.Choice time = add(new Setting.Choice("time", "Time", "Day", "Day", "Noon", "Sunset", "Night", "Midnight"));
        public TimeChanger() { super("time_changer", "Time Changer", "Pick the time of day you see (only on your screen).", Category.VISUAL, false); }
        public long dayTime() {
            return switch (time.get()) { case "Noon" -> 6000L; case "Sunset" -> 12500L; case "Night" -> 14000L; case "Midnight" -> 18000L; default -> 1000L; };
        }
    }

    public static final class Weather extends Module {
        public final Setting.Choice weather = add(new Setting.Choice("weather", "Weather", "Clear", "Clear", "Rain", "Thunder"));
        public Weather() { super("weather_changer", "Weather Changer", "Pick the weather you see (only on your screen).", Category.VISUAL, false); }
        public float rain() { return weather.is("Clear") ? 0f : 1f; }
        public float thunder() { return weather.is("Thunder") ? 1f : 0f; }
    }

    public static final class Particles extends Module {
        private final Setting.Number amount = add(new Setting.Number("amount", "Particle amount", 100, 0, 100, 5, "%"));
        public final Setting.Bool blockBreaking = add(new Setting.Bool("block_breaking", "Block-breaking particles", false));
        public Particles() { super("particles", "Particle Changer", "Fewer particles and no block-breaking dust (great for mining FPS).", Category.VISUAL, true); }
        /** Randomly drops particles down to the chosen amount. */
        public boolean keep() { return amount.get() >= 100 || ThreadLocalRandom.current().nextDouble(100) < amount.get(); }
    }

    public static final class Crosshair extends Module {
        private final Setting.Choice style = add(new Setting.Choice("style", "Style", "Cross", "Cross", "Dot", "Circle", "Plus + dot", "T", "Diamond"));
        private final Setting.Bool dynamic = add(new Setting.Bool("dynamic", "Movement gap", false));
        private final Setting.Number size = add(new Setting.Number("size", "Size", 5, 1, 12, 1, "px"));
        private final Setting.Number gap = add(new Setting.Number("gap", "Gap", 2, 0, 8, 1, "px"));
        private final Setting.Number thickness = add(new Setting.Number("thickness", "Thickness", 1, 1, 4, 1, "px"));
        private final Setting.Colour colour = add(new Setting.Colour("color", "Colour", 0xFFFFFFFF));
        private final Setting.Colour targetColour = add(new Setting.Colour("target_color", "Colour on a player/mob", Ui.warm(0xFFFF5A4A)));
        private final Setting.Bool oreColours = add(new Setting.Bool("ore_colors", "Match ore colour", true));
        private final Setting.Bool mineralBlocks = add(new Setting.Bool("mineral_blocks", "Match mineral blocks too", true));
        private final Setting.Bool contextColours=add(new Setting.Bool("context_colors","Context colour rules",false));
        private final Setting.Colour friendlyColour=add(new Setting.Colour("friendly_color","Allied player colour",0xFF59D595));
        private final Setting.Colour hostileColour=add(new Setting.Colour("hostile_color","Hostile mob colour",0xFFFF6C78));
        private final Setting.Colour interactColour=add(new Setting.Colour("interact_color","Utility block colour",0xFFFFD16A));
        private final Setting.Bool centerDot = add(new Setting.Bool("center_dot", "Center dot", false));
        private final Setting.Colour outlineColour=add(new Setting.Colour("outline_color","Outline colour",0xA0000000));
        private final Setting.Bool outline = add(new Setting.Bool("outline", "Dark outline", true));
        public Crosshair() { super("crosshair", "Custom Crosshair", "Your own crosshair shape, size and colour, with automatic ore colours.", Category.VISUAL, false); }

        public void render(GuiGraphics g) {
            Minecraft mc = Minecraft.getInstance();
            if (mc.options.getCameraType() != CameraType.FIRST_PERSON || mc.options.hideGui) return;
            int cx = g.guiWidth() / 2, cy = g.guiHeight() / 2;
            boolean onEntity = mc.hitResult != null && mc.hitResult.getType() == HitResult.Type.ENTITY;
            int c = onEntity ? targetColour.argb() : colour.argb();
            if(contextColours.on()&&mc.player!=null&&mc.hitResult instanceof net.minecraft.world.phys.EntityHitResult hit){var entity=hit.getEntity();if(entity instanceof net.minecraft.world.entity.player.Player&&mc.player.isAlliedTo(entity))c=friendlyColour.argb();else if(entity instanceof net.minecraft.world.entity.monster.Enemy)c=hostileColour.argb();}
            if(contextColours.on()&&mc.level!=null&&mc.hitResult instanceof BlockHitResult hit&&hit.getType()==HitResult.Type.BLOCK){var block=mc.level.getBlockState(hit.getBlockPos()).getBlock();if(block instanceof net.minecraft.world.level.block.DoorBlock||block instanceof net.minecraft.world.level.block.TrapDoorBlock||block instanceof net.minecraft.world.level.block.FenceGateBlock||block==Blocks.CHEST||block==Blocks.TRAPPED_CHEST||block==Blocks.ENDER_CHEST||block==Blocks.BARREL||block==Blocks.CRAFTING_TABLE||block==Blocks.FURNACE||block==Blocks.BLAST_FURNACE||block==Blocks.SMOKER||block==Blocks.ANVIL||block==Blocks.ENCHANTING_TABLE)c=interactColour.argb();}
            if (oreColours.on() && mc.level != null && mc.hitResult instanceof BlockHitResult hit
                    && hit.getType() == HitResult.Type.BLOCK) {
                c = mineralColour(mc.level.getBlockState(hit.getBlockPos()).getBlock(), c);
            }
            renderPreview(g,cx,cy,c,0);
        }
        public void renderPreview(GuiGraphics g,int cx,int cy,int c,int movement) {
            Minecraft mc=Minecraft.getInstance();
            int s = size.i(), gp = gap.i()+movement, t = thickness.i();
            if (dynamic.on() && mc.player != null) gp += mc.player.isSprinting() ? 2 : mc.player.onGround() ? 0 : 3;
            switch (style.get()) {
                case "Dot" -> box(g, cx - t, cy - t, cx + t, cy + t, c);
                case "Circle" -> {
                    for (int a = 0; a < 360; a += 10) {
                        double r = Math.toRadians(a);
                        int px = cx + (int) Math.round(Math.cos(r) * s), py = cy + (int) Math.round(Math.sin(r) * s);
                        box(g, px, py, px + t, py + t, c);
                    }
                }
                case "Diamond" -> {
                    for (int i = -s; i <= s; i++) { int dy = s - Math.abs(i); box(g, cx + i, cy + dy, cx + i + t, cy + dy + t, c); if (dy != 0) box(g, cx + i, cy - dy, cx + i + t, cy - dy + t, c); }
                }
                default -> {
                    int half = t / 2;
                    box(g, cx - gp - s, cy - half, cx - gp, cy - half + t, c);
                    box(g, cx + gp + 1, cy - half, cx + gp + 1 + s, cy - half + t, c);
                    if (!style.is("T")) box(g, cx - half, cy - gp - s, cx - half + t, cy - gp, c);
                    box(g, cx - half, cy + gp + 1, cx - half + t, cy + gp + 1 + s, c);
                    if (style.is("Plus + dot") || centerDot.on()) box(g, cx - half, cy - half, cx - half + t, cy - half + t, c);
                }
            }
        }

        private int mineralColour(Block block, int fallback) {
            boolean storage = mineralBlocks.on();
            if (block == Blocks.COAL_ORE || block == Blocks.DEEPSLATE_COAL_ORE || storage && block == Blocks.COAL_BLOCK) return 0xFF707780;
            if (block == Blocks.IRON_ORE || block == Blocks.DEEPSLATE_IRON_ORE || storage && (block == Blocks.IRON_BLOCK || block == Blocks.RAW_IRON_BLOCK)) return 0xFFE3C2A5;
            if (block == Blocks.COPPER_ORE || block == Blocks.DEEPSLATE_COPPER_ORE || storage && (block == Blocks.COPPER_BLOCK || block == Blocks.RAW_COPPER_BLOCK)) return 0xFFE58B57;
            if (block == Blocks.GOLD_ORE || block == Blocks.DEEPSLATE_GOLD_ORE || block == Blocks.NETHER_GOLD_ORE || storage && (block == Blocks.GOLD_BLOCK || block == Blocks.RAW_GOLD_BLOCK)) return 0xFFFFD447;
            if (block == Blocks.REDSTONE_ORE || block == Blocks.DEEPSLATE_REDSTONE_ORE || storage && block == Blocks.REDSTONE_BLOCK) return 0xFFFF4848;
            if (block == Blocks.LAPIS_ORE || block == Blocks.DEEPSLATE_LAPIS_ORE || storage && block == Blocks.LAPIS_BLOCK) return 0xFF568CFF;
            if (block == Blocks.DIAMOND_ORE || block == Blocks.DEEPSLATE_DIAMOND_ORE || storage && block == Blocks.DIAMOND_BLOCK) return 0xFF49E8E0;
            if (block == Blocks.EMERALD_ORE || block == Blocks.DEEPSLATE_EMERALD_ORE || storage && block == Blocks.EMERALD_BLOCK) return 0xFF41E581;
            if (block == Blocks.NETHER_QUARTZ_ORE || storage && block == Blocks.QUARTZ_BLOCK) return 0xFFF5EADF;
            if (block == Blocks.ANCIENT_DEBRIS || storage && block == Blocks.NETHERITE_BLOCK) return 0xFFAC8D80;
            return fallback;
        }

        private void box(GuiGraphics g, int x1, int y1, int x2, int y2, int c) {
            if (outline.on()) g.fill(x1 - 1, y1 - 1, x2 + 1, y2 + 1, outlineColour.argb());
            g.fill(x1, y1, x2, y2, c);
        }
    }
}
