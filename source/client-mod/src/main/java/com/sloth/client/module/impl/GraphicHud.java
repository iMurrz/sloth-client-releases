package com.sloth.client.module.impl;

import com.sloth.client.screen.Ui;

import com.sloth.client.module.HudModule;
import com.sloth.client.module.Setting;
import net.minecraft.ChatFormatting;
import net.minecraft.client.KeyMapping;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.Font;
import net.minecraft.client.gui.Gui;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.player.LocalPlayer;
import net.minecraft.client.renderer.RenderPipelines;
import net.minecraft.network.chat.Component;
import net.minecraft.util.Mth;
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.effect.MobEffectUtil;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;

import java.util.ArrayList;
import java.util.List;

/** HUD modules that draw more than plain text. */
public final class GraphicHud {
    private GraphicHud() {}

    private static Minecraft mc() { return Minecraft.getInstance(); }

    public static final class Direction extends HudModule {
        private static final String[] POINTS = {"S", "SW", "W", "NW", "N", "NE", "E", "SE"};
        private final Setting.Colour marker = add(new Setting.Colour("marker", "Marker colour", Ui.ACCENT));
        private final Setting.Bool degrees = add(new Setting.Bool("degrees", "Show degrees", true));
        public Direction() { super("direction", "Direction HUD", "A readable compass with separate direction and degree rows.", false, 0.34f, 0.005f); background.set(false); }
        @Override public boolean hasContent() { return !mc().options.keyPlayerList.isDown(); }
        private float spacing(Font font) { return Math.max(1.2f, (font.width("360") + 10) / 30f); }
        @Override public int contentWidth(Font font, boolean preview) { return Math.round(180 * spacing(font)); }
        @Override public int contentHeight(Font font, boolean preview) { return font.lineHeight * (degrees.on() ? 3 : 2) + 18; }
        @Override public void renderContent(GuiGraphics g, Font font, int x, int y, boolean preview) {
            float yaw = mc().player == null ? 180 : mc().player.getYRot();
            float heading = ((yaw % 360) + 360) % 360;
            float spacing = spacing(font);
            int w = Math.round(180 * spacing), center = x + w / 2;
            String point = POINTS[Math.floorMod(Math.round(heading / 45f), 8)];
            String title = degrees.on() ? point + "  " + (Math.round(heading) % 360) + "°" : point;
            g.drawString(font, title, center - font.width(title) / 2, y, textColor.argb(), shadow.on());
            int tickY = y + font.lineHeight + 5, directionY = tickY + 9, degreeY = directionY + font.lineHeight + 3;
            g.fill(center - 2, tickY - 4, center + 3, tickY - 3, marker.argb());
            g.fill(center - 1, tickY - 3, center + 2, tickY - 1, marker.argb());
            g.fill(x, tickY + 4, x + w, tickY + 5, 0x60FFFFFF);
            int directionRight = x - 6, degreeRight = x - 6;
            for (int unwrapped = (int)Math.floor((heading - 90) / 15) * 15; unwrapped <= heading + 90; unwrapped += 15) {
                float diff = unwrapped - heading;
                int px = center + Math.round(diff * spacing);
                if (px < x || px >= x + w) continue;
                int deg = Math.floorMod(unwrapped, 360);
                boolean cardinal = deg % 45 == 0;
                g.fill(px, tickY, px + 1, tickY + (cardinal ? 7 : 4), cardinal ? 0xDDFFFFFF : 0x80FFFFFF);
                String label = cardinal ? POINTS[deg / 45] : null;
                if (label != null) {
                    int left = px - font.width(label) / 2, right = left + font.width(label);
                    if (left >= x && right <= x + w && left >= directionRight + 6) {
                        g.drawString(font, label, left, directionY, deg == 180 ? marker.argb() : textColor.argb(), shadow.on());
                        directionRight = right;
                    }
                }
                if (degrees.on() && deg % 30 == 0) {
                    String number = String.valueOf(deg);
                    int left = px - font.width(number) / 2, right = left + font.width(number);
                    if (left >= x && right <= x + w && left >= degreeRight + 6) {
                        g.drawString(font, number, left, degreeY, 0xBFA9A5B0, shadow.on());
                        degreeRight = right;
                    }
                }
            }
        }
    }

    // ---------- Armor status ----------
    public static final class ArmorStatus extends HudModule {
        private List<ItemStack> renderItems;
        @Override protected void beginRender(boolean preview) { renderItems = collectItems(preview); }
        @Override protected void endRender() { renderItems = null; }
        private static final EquipmentSlot[] SLOTS = {EquipmentSlot.HEAD, EquipmentSlot.CHEST, EquipmentSlot.LEGS, EquipmentSlot.FEET, EquipmentSlot.MAINHAND};
        private final Setting.Choice mode = add(new Setting.Choice("mode", "Durability", "Remaining", "Remaining", "Percent", "Off"));
        public ArmorStatus() { super("armor_status", "Armor Status", "Your armour and held item with durability.", true, 0.90f, 0.62f); }
        private List<ItemStack> items(boolean preview) {
            return renderItems == null ? collectItems(preview) : renderItems;
        }
        private List<ItemStack> collectItems(boolean preview) {
            List<ItemStack> out = new ArrayList<>();
            LocalPlayer p = mc().player;
            if (p != null && !preview) for (EquipmentSlot slot : SLOTS) { ItemStack s = p.getItemBySlot(slot); if (!s.isEmpty()) out.add(s); }
            if (out.isEmpty() && preview) { for(var item:List.of(Items.DIAMOND_HELMET,Items.DIAMOND_CHESTPLATE,Items.DIAMOND_LEGGINGS,Items.DIAMOND_BOOTS,Items.NETHERITE_PICKAXE)){var stack=new ItemStack(item);stack.setDamageValue(Math.max(1,stack.getMaxDamage()/4));out.add(stack);} }
            return out;
        }
        private String label(ItemStack s) {
            if (!s.isDamageableItem() || mode.is("Off")) return s.getCount() > 1 ? String.valueOf(s.getCount()) : "";
            int left = s.getMaxDamage() - s.getDamageValue();
            return mode.is("Percent") ? left * 100 / Math.max(1, s.getMaxDamage()) + "%" : String.valueOf(left);
        }
        @Override public boolean hasContent() {
            LocalPlayer p = mc().player;
            if (p != null) for (EquipmentSlot slot : SLOTS) if (!p.getItemBySlot(slot).isEmpty()) return true;
            return false;
        }
        @Override public int contentWidth(Font font, boolean preview) {
            int w = 16;
            for (ItemStack s : items(preview)) w = Math.max(w, 18 + font.width(label(s)));
            return w;
        }
        @Override public int contentHeight(Font font, boolean preview) { return Math.max(16, items(preview).size() * 17 - 1); }
        @Override public void renderContent(GuiGraphics g, Font font, int x, int y, boolean preview) {
            int cy = y;
            for (ItemStack s : items(preview)) {
                g.renderItem(s, x, cy);
                String label = label(s);
                int colour = textColor.argb();
                if (s.isDamageableItem() && !mode.is("Off")) {
                    float f = 1f - (float) s.getDamageValue() / Math.max(1, s.getMaxDamage());
                    colour = f < 0.15f ? Ui.warm(0xFFFF5A4A) : f < 0.4f ? Ui.warm(0xFFFFC04A) : colour;
                }
                g.drawString(font, label, x + 18, cy + 4, colour, shadow.on());
                cy += 17;
            }
        }
    }

    // ---------- Potion effects ----------
    public static final class PotionEffects extends HudModule {
        private List<MobEffectInstance> renderEffects;
        private List<String> renderLabels;
        @Override protected void beginRender(boolean preview) {
            renderEffects = collectSamples(preview);
            renderLabels = renderEffects.stream().map(this::text).toList();
        }
        @Override protected void endRender() { renderEffects = null; renderLabels = null; }
        private String label(int i, MobEffectInstance e) { return renderLabels == null ? text(e) : renderLabels.get(i); }
        public final Setting.Bool hideVanilla = add(new Setting.Bool("hide_vanilla", "Hide vanilla effect icons", true));
        private final Setting.Bool names = add(new Setting.Bool("names", "Show names", true));
        public PotionEffects() { super("potion_effects", "Potion Effects", "Active effects with time left.", true, 0.88f, 0.01f); }
        private List<MobEffectInstance> effects() {
            LocalPlayer p = mc().player;
            return p == null ? List.of() : new ArrayList<>(p.getActiveEffects());
        }
        private List<MobEffectInstance> collectSamples(boolean preview){return preview?List.of(new MobEffectInstance(net.minecraft.world.effect.MobEffects.HASTE,5440,1),new MobEffectInstance(net.minecraft.world.effect.MobEffects.SPEED,1700,0)):effects();}
        private List<MobEffectInstance> samples(boolean preview){return renderEffects==null?collectSamples(preview):renderEffects;}
        private String text(MobEffectInstance e) {
            String duration = MobEffectUtil.formatDuration(e, 1f, mc().level == null ? 20f : mc().level.tickRateManager().tickrate()).getString();
            if (!names.on()) return duration;
            String level = e.getAmplifier() > 0 ? " " + (e.getAmplifier() + 1) : "";
            return Component.translatable(e.getDescriptionId()).getString() + level + "  " + duration;
        }
        @Override public boolean hasContent() { return mc().player != null && !mc().player.getActiveEffects().isEmpty(); }
        @Override public int contentWidth(Font font, boolean preview) {
            int w = 18;
            List<MobEffectInstance> list = samples(preview);
            for (int i=0;i<list.size();i++) w = Math.max(w, 20 + font.width(label(i,list.get(i))));
            return list.isEmpty() ? 20 + font.width("Haste 2  4:32") : w;
        }
        @Override public int contentHeight(Font font, boolean preview) { return Math.max(1, samples(preview).size()) * 19 - 1; }
        @Override public void renderContent(GuiGraphics g, Font font, int x, int y, boolean preview) {
            List<MobEffectInstance> list = samples(preview);
            if (list.isEmpty()) { g.drawString(font, "Haste 2  4:32", x + 20, y + 5, textColor.argb(), shadow.on()); return; }
            int cy = y;
            for (int i = 0; i < list.size(); i++) {
                MobEffectInstance e = list.get(i);
                g.blitSprite(RenderPipelines.GUI_TEXTURED, Gui.getMobEffectSprite(e.getEffect()), x, cy, 18, 18);
                g.drawString(font, label(i,e), x + 20, cy + 5, e.endsWithin(200) ? Ui.warm(0xFFFF5A4A) : textColor.argb(i * 0.08f), shadow.on());
                cy += 19;
            }
        }
    }

    // ---------- Keystrokes ----------
    public static final class Keystrokes extends HudModule {
        private final Setting.Colour pressed = add(new Setting.Colour("pressed", "Pressed colour", Ui.warm(0xC0FF6A2A)));
        private final Setting.Colour idle = add(new Setting.Colour("idle", "Key colour", 0x80101014));
        private final Setting.Bool mouse = add(new Setting.Bool("mouse", "Mouse buttons + CPS", true));
        private final Setting.Bool space = add(new Setting.Bool("space", "Space bar", true));
        private static final int K = 20, GAP = 2;
        public Keystrokes() { super("keystrokes", "Keystrokes", "Shows WASD, mouse and space presses.", false, 0.86f, 0.30f); background.set(false); }
        @Override public int contentWidth(Font font, boolean preview) { return K * 3 + GAP * 2; }
        @Override public int contentHeight(Font font, boolean preview) { return K * 2 + GAP + (mouse.on() ? K + GAP : 0) + (space.on() ? 10 + GAP : 0); }
        private void key(GuiGraphics g, Font font, int x, int y, int w, int h, String label, boolean down) {
            g.fill(x, y, x + w, y + h, down ? pressed.argb() : idle.argb());
            g.drawString(font, label, x + (w - font.width(label)) / 2, y + (h - 8) / 2, down ? 0xFFFFFFFF : textColor.argb(), shadow.on());
        }
        @Override public void renderContent(GuiGraphics g, Font font, int x, int y, boolean preview) {
            var o = mc().options;
            key(g, font, x + K + GAP, y, K, K, keyName(o.keyUp), o.keyUp.isDown());
            int row = y + K + GAP;
            key(g, font, x, row, K, K, keyName(o.keyLeft), o.keyLeft.isDown());
            key(g, font, x + K + GAP, row, K, K, keyName(o.keyDown), o.keyDown.isDown());
            key(g, font, x + (K + GAP) * 2, row, K, K, keyName(o.keyRight), o.keyRight.isDown());
            row += K + GAP;
            int half = (K * 3 + GAP * 2 - GAP) / 2;
            if (mouse.on()) {
                key(g, font, x, row, half, K, "LMB " + Tracking.leftCps(), o.keyAttack.isDown());
                key(g, font, x + half + GAP, row, half, K, "RMB " + Tracking.rightCps(), o.keyUse.isDown());
                row += K + GAP;
            }
            if (space.on()) {
                int w = K * 3 + GAP * 2;
                g.fill(x, row, x + w, row + 10, o.keyJump.isDown() ? pressed.argb() : idle.argb());
                g.fill(x + w / 2 - 12, row + 4, x + w / 2 + 12, row + 5, o.keyJump.isDown() ? 0xFFFFFFFF : textColor.argb());
            }
        }
        private static String keyName(KeyMapping key) {
            String name = key.getTranslatedKeyMessage().getString();
            return name.length() > 3 ? name.substring(0, 3) : name;
        }
    }
}
