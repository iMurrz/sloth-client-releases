package com.sloth.client.module.impl;

import com.sloth.client.screen.Ui;

import com.sloth.client.module.Setting;
import com.sloth.client.module.TextHudModule;
import net.minecraft.client.Minecraft;
import net.minecraft.client.multiplayer.PlayerInfo;
import net.minecraft.client.multiplayer.ServerData;
import net.minecraft.client.player.LocalPlayer;
import net.minecraft.core.BlockPos;
import net.minecraft.server.packs.repository.Pack;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.EntityHitResult;
import net.minecraft.world.phys.HitResult;

import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/** Small text HUD modules. Each shows sample data in the HUD editor when there's nothing live yet. */
public final class InfoHud {
    private InfoHud() {}

    private static Minecraft mc() { return Minecraft.getInstance(); }

    public static final class Fps extends TextHudModule {
        public Fps() { super("fps", "FPS", "Frames per second.", true, 0.005f, 0.64f); }
        @Override protected List<String> lines(boolean preview) { return List.of(mc().getFps() + " FPS"); }
    }

    public static final class Cps extends TextHudModule {
        private final Setting.Bool right = add(new Setting.Bool("right", "Show right clicks", true));
        public Cps() { super("cps", "CPS", "Clicks per second for left (and right) mouse.", false, 0.005f, 0.76f); }
        @Override protected List<String> lines(boolean preview) {
            return List.of(right.on() ? Tracking.leftCps() + " | " + Tracking.rightCps() + " CPS" : Tracking.leftCps() + " CPS");
        }
    }

    public static final class Ping extends TextHudModule {
        public Ping() { super("ping", "Ping", "Your latency to the server.", true, 0.005f, 0.70f); }
        private int latency() {
            LocalPlayer p = mc().player;
            if (p == null || mc().getConnection() == null || mc().isLocalServer()) return -1;
            PlayerInfo info = mc().getConnection().getPlayerInfo(p.getUUID());
            return info == null ? -1 : info.getLatency();
        }
        @Override public boolean hasContent() { return latency() >= 0; }
        @Override protected List<String> lines(boolean preview) { int l = latency(); return List.of((l < 0 ? 42 : l) + " ms"); }
    }

    public static final class Memory extends TextHudModule {
        public Memory() { super("memory", "Memory Usage", "Java memory in use.", false, 0.005f, 0.82f); }
        @Override protected List<String> lines(boolean preview) {
            Runtime rt = Runtime.getRuntime();
            long used = (rt.totalMemory() - rt.freeMemory()) / 1048576, max = rt.maxMemory() / 1048576;
            return List.of("Mem " + used * 100 / Math.max(1, max) + "% " + used + "/" + max + " MB");
        }
    }

    public static final class Clock extends TextHudModule {
        private long cachedMinute=Long.MIN_VALUE;
        private String cachedFormat="",cachedTime="";
        private static final DateTimeFormatter TWELVE=DateTimeFormatter.ofPattern("h:mm a",Locale.ROOT),TWENTY_FOUR=DateTimeFormatter.ofPattern("HH:mm",Locale.ROOT);
        private final Setting.Choice format = add(new Setting.Choice("format", "Format", "24h", "24h", "12h"));
        public Clock() { super("clock", "Clock", "Real-world time.", false, 0.005f, 0.88f); }
        @Override protected List<String> lines(boolean preview) {
            LocalTime now=LocalTime.now();long minute=now.toSecondOfDay()/60;
            if(minute!=cachedMinute||!cachedFormat.equals(format.get())){cachedMinute=minute;cachedFormat=format.get();cachedTime=now.format(format.is("12h")?TWELVE:TWENTY_FOUR);}
            return List.of(cachedTime);
        }
    }

    public static final class ServerAddress extends TextHudModule {
        public ServerAddress() { super("server_address", "Server Address", "The server you're connected to.", false, 0.2f, 0.17f); }
        @Override public boolean hasContent() { return mc().getCurrentServer() != null; }
        @Override protected List<String> lines(boolean preview) {
            ServerData s = mc().getCurrentServer();
            return List.of(s == null ? "play.sloth.example" : s.ip);
        }
    }

    public static final class Coordinates extends TextHudModule {
        private final Setting.Bool facing = add(new Setting.Bool("facing", "Show facing", true));
        private final Setting.Bool biome = add(new Setting.Bool("biome", "Show biome", false));
        public Coordinates() { super("coordinates", "Coordinates", "Your X / Y / Z position and facing.", true, 0.005f, 0.42f); }
        @Override protected List<String> lines(boolean preview) {
            LocalPlayer p = mc().player;
            List<String> out = new ArrayList<>();
            if (p == null) {
                out.add("X: 128  Y: 64  Z: -512");
                if (facing.on()) out.add("Facing: North");
                return out;
            }
            out.add("X: " + p.getBlockX() + "  Y: " + p.getBlockY() + "  Z: " + p.getBlockZ());
            if (facing.on()) {
                String dir = p.getDirection().getName();
                out.add("Facing: " + Character.toUpperCase(dir.charAt(0)) + dir.substring(1));
            }
            if (biome.on() && mc().level != null) {
                mc().level.getBiome(p.blockPosition()).unwrapKey().ifPresent(k -> out.add("Biome: " + pretty(k.identifier().getPath())));
            }
            return out;
        }
    }

    public static final class Saturation extends TextHudModule {
        public Saturation() { super("saturation", "Saturation", "Food and hidden saturation level.", false, 0.78f, 0.30f); }
        @Override protected List<String> lines(boolean preview) {
            LocalPlayer p = mc().player;
            if (p == null) return List.of("Food 20  Sat 5.0");
            return List.of(String.format(Locale.ROOT, "Food %d  Sat %.1f", p.getFoodData().getFoodLevel(), p.getFoodData().getSaturationLevel()));
        }
    }

    public static final class Speed extends TextHudModule {
        public Speed() { super("speed", "Speed", "Horizontal speed in blocks per second.", false, 0.78f, 0.36f); }
        @Override protected List<String> lines(boolean preview) { return List.of(String.format(Locale.ROOT, "%.2f b/s", Tracking.speed)); }
    }

    public static final class Reach extends TextHudModule {
        public Reach() { super("reach", "Reach Display", "Distance of your last hit.", false, 0.78f, 0.42f); }
        @Override protected List<String> lines(boolean preview) {
            boolean recent = Tracking.lastReach >= 0 && System.currentTimeMillis() - Tracking.lastReachAt < 3000;
            return List.of(recent ? String.format(Locale.ROOT, "%.2f blocks", Tracking.lastReach) : "Hasn't attacked");
        }
    }

    public static final class Combo extends TextHudModule {
        public Combo() { super("combo", "Combo Counter", "Hits in a row without getting hit.", false, 0.78f, 0.48f); }
        @Override protected List<String> lines(boolean preview) { return List.of(Tracking.combo == 0 ? "No combo" : Tracking.combo + " combo"); }
    }

    public static final class Playtime extends TextHudModule {
        public Playtime() { super("playtime", "Playtime", "Time since you joined this session.", false, 0.2f, 0.005f); }
        @Override protected List<String> lines(boolean preview) { return List.of("Session " + duration(System.currentTimeMillis() - Tracking.sessionStart)); }
    }

    public static final class Stopwatch extends TextHudModule {
        private long startedAt;
        private long elapsed;
        private boolean running;
        public Stopwatch() { super("stopwatch", "Stopwatch", "Start, stop and reset with its key (Controls > Sloth Client).", false, 0.2f, 0.05f); }
        public void press() {
            if (running) { elapsed += System.currentTimeMillis() - startedAt; running = false; }
            else if (elapsed > 0) elapsed = 0;
            else { startedAt = System.currentTimeMillis(); running = true; }
        }
        @Override protected List<String> lines(boolean preview) {
            long total = elapsed + (running ? System.currentTimeMillis() - startedAt : 0);
            return List.of((running ? "▶ " : "■ ") + duration(total) + "." + (total / 100) % 10);
        }
    }

    public static final class DayCounter extends TextHudModule {
        public DayCounter() { super("day_counter", "Day Counter", "In-game day number.", false, 0.2f, 0.09f); }
        @Override protected List<String> lines(boolean preview) {
            long day = mc().level == null ? 12 : mc().level.getDayTime() / 24000L + 1;
            return List.of("Day " + day);
        }
    }

    public static final class PackDisplay extends TextHudModule {
        public PackDisplay() { super("pack_display", "Pack Display", "Resource packs you have on.", false, 0.2f, 0.13f); }
        private List<String> packs() {
            List<String> out = new ArrayList<>();
            for (Pack pack : mc().getResourcePackRepository().getSelectedPacks()) {
                String id = pack.getId();
                if (id.startsWith("file/") || id.startsWith("server") || id.startsWith("world")) out.add(pack.getTitle().getString());
            }
            return out;
        }
        @Override public boolean hasContent() { return !packs().isEmpty(); }
        @Override protected List<String> lines(boolean preview) {
            List<String> packs = packs();
            return packs.isEmpty() ? List.of("Default") : packs;
        }
    }

    public static final class LookingAt extends TextHudModule {
        public LookingAt() { super("looking_at", "Looking At", "Name of the block or entity under your crosshair (WAILA).", false, 0.42f, 0.12f); }
        private String target() {
            HitResult hit = mc().hitResult;
            if (hit instanceof BlockHitResult b && hit.getType() == HitResult.Type.BLOCK && mc().level != null) {
                BlockPos pos = b.getBlockPos();
                return mc().level.getBlockState(pos).getBlock().getName().getString();
            }
            if (hit instanceof EntityHitResult e) {
                Entity entity = e.getEntity();
                String name = entity.getDisplayName().getString();
                if (entity instanceof LivingEntity living) name += String.format(Locale.ROOT, "  ❤ %.0f/%.0f", living.getHealth(), living.getMaxHealth());
                return name;
            }
            return null;
        }
        @Override public boolean hasContent() { return target() != null; }
        @Override protected List<String> lines(boolean preview) { String t = target(); return List.of(t == null ? "Deepslate Diamond Ore" : t); }
    }

    public static final class InventorySpace extends TextHudModule {
        private LocalPlayer sampledPlayer;
        private int freeSlots=9,heldCount;
        private String heldLabel="";
        @Override public void tick(Minecraft mc) {
            sampledPlayer=mc.player;freeSlots=9;heldCount=0;heldLabel="";
            if(sampledPlayer==null)return;
            freeSlots=0;ItemStack hand=sampledPlayer.getMainHandItem();
            if(held.on()&&!hand.isEmpty())heldLabel=hand.getHoverName().getString();
            for(ItemStack stack:sampledPlayer.getInventory().getNonEquipmentItems()){
                if(stack.isEmpty())freeSlots++;
                if(held.on()&&!hand.isEmpty()&&ItemStack.isSameItemSameComponents(stack,hand))heldCount+=stack.getCount();
            }
        }
        private final Setting.Colour fullColour = add(new Setting.Colour("full_color", "Colour when full", Ui.warm(0xFFFF5A4A)));
        private final Setting.Bool held = add(new Setting.Bool("held", "Count of held item", true));
        public InventorySpace() { super("inventory", "Item Counter", "Free inventory slots (turns red when full) and how many of the held item you carry.", true, 0.005f, 0.53f); }
        private int free() {
            LocalPlayer p = mc().player;
            if (p == null) return 9;
            return p==sampledPlayer?freeSlots:9;
        }
        @Override protected List<String> lines(boolean preview) {
            if(preview)tick(mc());
            LocalPlayer p = mc().player;
            List<String> out = new ArrayList<>();
            int free = free();
            out.add(free == 0 ? "Inventory FULL" : free + " free slots");
            if (held.on() && p != null && p==sampledPlayer && !heldLabel.isEmpty()) {
                int count = p==sampledPlayer?heldCount:0;
                out.add(heldLabel + ": " + count);
            }
            return out;
        }
        @Override protected void text(net.minecraft.client.gui.GuiGraphics g, net.minecraft.client.gui.Font font, String s, int x, int y, int lineIndex) {
            if (lineIndex == 0 && free() == 0) g.drawString(font, s, x, y, fullColour.argb(), shadow.on());
            else super.text(g, font, s, x, y, lineIndex);
        }
    }

    // ---------- helpers ----------

    static String duration(long ms) {
        long s = ms / 1000;
        return s >= 3600 ? s / 3600 + ":" + two((s / 60) % 60) + ":" + two(s % 60) : s / 60 + ":" + two(s % 60);
    }
    private static String two(long n){return n<10?"0"+n:Long.toString(n);}

    static String pretty(String path) {
        StringBuilder out = new StringBuilder();
        for (String word : path.split("_")) if (!word.isEmpty()) out.append(Character.toUpperCase(word.charAt(0))).append(word.substring(1)).append(' ');
        return out.toString().trim();
    }
}
