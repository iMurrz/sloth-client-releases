package com.sloth.client.module.impl;

import com.sloth.client.screen.Ui;

import com.sloth.client.module.HudModule;
import com.sloth.client.module.ModuleManager;
import com.sloth.client.module.Setting;
import net.minecraft.client.Camera;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.Font;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.player.LocalPlayer;
import net.minecraft.resources.Identifier;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.phys.Vec3;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/** HUD modules that read the world: item cooldowns. */
public final class WorldHud {
    private WorldHud() {}

    private static Minecraft mc() { return Minecraft.getInstance(); }

    /** Exact cooldown durations, recorded when the server starts a cooldown (ItemCooldowns mixin). */
    public static final Map<Identifier, long[]> COOLDOWN_STARTED = new HashMap<>();

    public static void cooldownStarted(Identifier group, int ticks) {
        COOLDOWN_STARTED.put(group, new long[] {System.currentTimeMillis(), ticks * 50L});
    }

    // ---------- Cooldowns ----------
    public static final class Cooldowns extends HudModule {
        private static final int[] RING_X = new int[60], RING_Y = new int[60];
        static { for(int i=0;i<60;i++){double rad=Math.toRadians(i*6-90);RING_X[i]=(int)Math.round(Math.cos(rad)*11);RING_Y[i]=(int)Math.round(Math.sin(rad)*11);} }
        private final Map<Identifier, ItemStack> inventoryGroups = new LinkedHashMap<>();
        private LocalPlayer sampledPlayer;
        private List<Entry> renderEntries;
        @Override public void tick(Minecraft mc) {
            inventoryGroups.clear();sampledPlayer=mc.player;
            if(sampledPlayer==null)return;
            for(ItemStack stack:sampledPlayer.getInventory().getNonEquipmentItems()) addGroup(stack);
            addGroup(sampledPlayer.getOffhandItem());
            long now=System.currentTimeMillis();
            COOLDOWN_STARTED.entrySet().removeIf(e -> now-e.getValue()[0]>e.getValue()[1]+1000);
        }
        private void addGroup(ItemStack stack){if(!stack.isEmpty()&&sampledPlayer.getCooldowns().isOnCooldown(stack))inventoryGroups.putIfAbsent(sampledPlayer.getCooldowns().getCooldownGroup(stack),stack);}
        @Override protected void beginRender(boolean preview){renderEntries=collectEntries(preview);}
        @Override protected void endRender(){renderEntries=null;}
        private final Setting.Colour ring = add(new Setting.Colour("ring", "Ring colour", Ui.warm(0xFFFF6A2A)));
        public Cooldowns() { super("cooldowns", "Cooldowns", "Ender pearl, chorus and other item cooldowns with seconds left.", true, 0.005f, 0.24f); background.set(false); }

        private record Entry(ItemStack stack, float fraction, double seconds) {}

        private List<Entry> entries(boolean preview) {
            return renderEntries==null?collectEntries(preview):renderEntries;
        }
        private List<Entry> collectEntries(boolean preview) {
            List<Entry> out = new ArrayList<>();
            LocalPlayer p = mc().player;
            long now=System.currentTimeMillis();
            if (p != null && p==sampledPlayer) {
                for (var e : inventoryGroups.entrySet()) {
                    if(e.getValue().isEmpty()||!p.getCooldowns().isOnCooldown(e.getValue()))continue;
                    float fraction = p.getCooldowns().getCooldownPercent(e.getValue(), 0f);
                    long[] started = COOLDOWN_STARTED.get(e.getKey());
                    double seconds = started == null ? -1 : Math.max(0, (started[1] - (now - started[0])) / 1000.0);
                    out.add(new Entry(e.getValue(), fraction, seconds));
                }
            }
            if (out.isEmpty() && preview) {
                out.add(new Entry(new ItemStack(Items.ENDER_PEARL), 0.6f, 5.4));
                out.add(new Entry(new ItemStack(Items.GOLDEN_APPLE), 0.3f, 23.4));
            }
            return out;
        }

        @Override public boolean hasContent() {
            LocalPlayer p=mc().player;if(p==null||p!=sampledPlayer)return false;
            for(ItemStack stack:inventoryGroups.values())if(!stack.isEmpty()&&p.getCooldowns().isOnCooldown(stack))return true;
            return false;
        }
        @Override public int contentWidth(Font font, boolean preview) { return 26 + font.width("00.0s"); }
        @Override public int contentHeight(Font font, boolean preview) { return Math.max(1, entries(preview).size()) * 26 - 2; }

        @Override public void renderContent(GuiGraphics g, Font font, int x, int y, boolean preview) {
            int cy = y;
            for (Entry e : entries(preview)) {
                int cx = x + 12, cyc = cy + 12;
                for (int i = 0; i < 60; i++) {
                    int px = cx + RING_X[i], py = cyc + RING_Y[i];
                    boolean lit = i / 60f < e.fraction();
                    g.fill(px - 1, py - 1, px + 1, py + 1, lit ? ring.argb() : 0x60FFFFFF);
                }
                g.renderItem(e.stack(), cx - 8, cyc - 8);
                String label = e.seconds() >= 0 ? String.format(Locale.ROOT, "%.1fs", e.seconds()) : Math.round(e.fraction() * 100) + "%";
                g.drawString(font, label, x + 27, cy + 8, textColor.argb(), shadow.on());
                cy += 26;
            }
        }
    }

}
