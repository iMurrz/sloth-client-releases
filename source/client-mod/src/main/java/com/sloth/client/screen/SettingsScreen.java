package com.sloth.client.screen;

import com.sloth.client.SlothClient;
import com.sloth.client.module.Module;
import com.sloth.client.module.ModuleManager;
import com.sloth.client.module.impl.VisualModules;
import com.sloth.client.screen.widget.SlothButton;
import com.mojang.blaze3d.platform.InputConstants;
import net.minecraft.ChatFormatting;
import net.minecraft.client.KeyMapping;
import net.minecraft.client.OptionInstance;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.EditBox;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.input.KeyEvent;
import net.minecraft.client.input.MouseButtonEvent;
import net.minecraft.network.chat.Component;
import net.minecraft.util.Mth;
import org.lwjgl.glfw.GLFW;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Locale;
import java.util.function.BooleanSupplier;
import java.util.function.Consumer;
import java.util.function.DoubleConsumer;
import java.util.function.DoubleSupplier;
import java.util.function.Function;
import java.util.function.Supplier;

/** SETTINGS tab: General, Performance (video options) and Controls (click a key to rebind it). */
public final class SettingsScreen extends MenuFrame {
    private enum Sub { GENERAL, PERFORMANCE, CONTROLS }

    private sealed interface Row permits Section, Toggle, Slider, Choice, Bind {}
    private record Section(String label) implements Row {}
    private record Toggle(String label, BooleanSupplier get, Consumer<Boolean> set) implements Row {}
    private record Slider(String label, double min, double max, double step, DoubleSupplier get, DoubleConsumer set, Function<Double, String> fmt) implements Row {}
    private record Choice(String label, List<String> options, Supplier<String> get, Consumer<String> set) implements Row {}
    private record Bind(KeyMapping key) implements Row {}

    private record Hit(Row row, int x, int y, int w, int h) {}

    private static Sub sub = Sub.GENERAL;
    private static String query = "";
    private static boolean advanced;
    private EditBox search;
    private final List<Hit> hits = new ArrayList<>();
    private int scroll;
    private final SmoothScroll smooth = new SmoothScroll();
    private int listY, listH;
    private Slider dragging;
    private Hit draggingHit;
    private KeyMapping listening;
    // Motion: switches slide, rows highlight, slider fills glide, choice values slide in, rows cascade in.
    private final Motion.Tracker toggleAnim = new Motion.Tracker(14f);
    private final Motion.Tracker hoverAnim = new Motion.Tracker(16f);
    private final Map<String, float[]> sliderShown = new HashMap<>();
    private final Map<String, long[]> choiceChanged = new HashMap<>();
    private long lastFrame = System.nanoTime(), frameDt;
    private int rowIndex;

    public SettingsScreen(Screen parent) { super(parent, "Sloth Settings"); }
    public record SearchEntry(String label, Runnable open) {}
    public static SettingsScreen openSearch(Screen parent, String category, String term) {
        sub = Sub.valueOf(category); query = term; return new SettingsScreen(parent);
    }
    public static List<SearchEntry> searchEntries(Screen parent) {
        Sub old = sub; String oldQuery = query; boolean oldAdvanced=advanced; List<SearchEntry> entries = new ArrayList<>();
        try {
            SettingsScreen screen = new SettingsScreen(parent); query = ""; advanced=true;
            for (Sub s : Sub.values()) {
                sub = s;
                for (Row r : screen.rows()) if (!(r instanceof Section)) {
                    String label = screen.label(r);
                    entries.add(new SearchEntry(label, () -> net.minecraft.client.Minecraft.getInstance().setScreen(openSearch(parent, s.name(), label))));
                }
            }
        } finally { sub = old; query = oldQuery; advanced=oldAdvanced; }
        return entries;
    }

    @Override protected Tab tab() { return Tab.SETTINGS; }

    @Override
    protected void initContent() {
        int x = contentX, toolbarY = contentY;
        for (Sub s : Sub.values()) {
            int w = font.width(s.name()) + 14;
            if (x + w > contentX + contentW) { x = contentX; toolbarY += 22; }
            SlothButton b = chip(x, toolbarY, w, 18, s.name(), btn -> { sub = s; listening = null; dragging = null; smooth.reset(); scroll = 0; rebuildWidgets(); });
            b.selected = sub == s;
            x += w + 4;
        }
        search = sidebarSearch(query, s -> { query = s; smooth.reset(); scroll = 0; });
        search.setHint(Component.literal("Search settings...").withStyle(ChatFormatting.GRAY));
        button(contentX,toolbarY+24,112,18,advanced?"Fewer options":"More options",b->{advanced=!advanced;listening=null;dragging=null;smooth.reset();scroll=0;rebuildWidgets();});
        listY = toolbarY + 50;
        listH = contentY + contentH - listY;
    }

    // ---------- rows ----------

    private static Toggle module(String label, Class<? extends Module> type) {
        return new Toggle(label, () -> ModuleManager.get(type).isEnabled(), v -> ModuleManager.get(type).setEnabled(v));
    }

    private static <T> Choice enumChoice(String label, OptionInstance<T> option, T[] values) {
        return new Choice(label, Arrays.stream(values).map(SettingsScreen::caption).toList(), () -> caption(option.get()),
            v -> { for (T t : values) if (caption(t).equals(v)) option.set(t); });
    }

    private static String caption(Object value) {
        if (value instanceof net.minecraft.server.level.ParticleStatus p) return p.caption().getString();
        if (value instanceof Enum<?> e) { String n = e.name().toLowerCase(Locale.ROOT); return Character.toUpperCase(n.charAt(0)) + n.substring(1); }
        return String.valueOf(value);
    }

    private List<Row> rows() {
        var o = minecraft.options;
        List<Row> rows = new ArrayList<>();
        switch (sub) {
            case GENERAL -> {
                VisualModules.MainMenu menu = ModuleManager.get(VisualModules.MainMenu.class);
                rows.add(new Section("SLOTH APPEARANCE · ALWAYS ON"));
                rows.add(new Toggle("Menu parallax", menu.parallax::on, menu.parallax::set));
                rows.add(new Toggle("Ambient particles", menu.particles::on, menu.particles::set));
                VisualModules.MenuTheme theme = ModuleManager.get(VisualModules.MenuTheme.class);
                rows.add(new Toggle("Smooth animations", theme.animations::on, theme.animations::set));
                rows.add(new Section("GAMEPLAY"));
                rows.add(module("Smart Disconnect", com.sloth.client.module.impl.UtilityModules.SmartDisconnect.class));
                rows.add(module("Chat Timestamps", com.sloth.client.module.impl.UtilityModules.ChatTimestamps.class));
                rows.add(module("Toggle Sprint", com.sloth.client.module.impl.UtilityModules.Sprint.class));
                rows.add(module("Toggle Sneak", com.sloth.client.module.impl.UtilityModules.Sneak.class));
                rows.add(new Section("HUD OPTIONS"));
                rows.add(new Toggle("Show Sloth HUD", () -> !ModuleManager.hudHidden, v -> ModuleManager.hudHidden = !v));
                rows.add(new Toggle("Show HUD with F3 open", () -> ModuleManager.hudInF3, v -> ModuleManager.hudInF3 = v));
                rows.add(new Section("NOTIFICATIONS"));
            }
            case PERFORMANCE -> {
                rows.add(new Section("WORLD DETAIL"));
                rows.add(new Slider("Render Distance", 2, 32, 1, () -> o.renderDistance().get(), v -> o.renderDistance().set((int) v), v -> Math.round(v) + " chunks"));
                rows.add(new Slider("Simulation Distance", 5, 32, 1, () -> o.simulationDistance().get(), v -> o.simulationDistance().set((int) v), v -> Math.round(v) + " chunks"));
                rows.add(new Section("FRAME RATE"));
                rows.add(new Slider("Max FPS", 10, 260, 10, () -> o.framerateLimit().get(), v -> o.framerateLimit().set((int) v), v -> v >= 260 ? "Unlimited" : Math.round(v) + " fps"));
                rows.add(new Toggle("VSync", () -> o.enableVsync().get(), v -> o.enableVsync().set(v)));
                rows.add(new Section("EFFECTS & ENTITIES"));
                rows.add(new Toggle("Entity Shadows", () -> o.entityShadows().get(), v -> o.entityShadows().set(v)));
                rows.add(new Slider("Entity Distance", 0.5, 5.0, 0.25, () -> o.entityDistanceScaling().get(), v -> o.entityDistanceScaling().set(v), v -> Math.round(v * 100) + "%"));
                rows.add(enumChoice("Particles", o.particles(), net.minecraft.server.level.ParticleStatus.values()));
                rows.add(enumChoice("Clouds", o.cloudStatus(), net.minecraft.client.CloudStatus.values()));
                rows.add(new Slider("Biome Blend", 0, 7, 1, () -> o.biomeBlendRadius().get(), v -> o.biomeBlendRadius().set((int) v), v -> Math.round(v) == 0 ? "Off" : (Math.round(v) * 2 + 1) + "x" + (Math.round(v) * 2 + 1)));
                rows.add(new Section("SLOTH"));
                rows.add(module("Particle Changer", VisualModules.Particles.class));
                rows.add(module("Fullbright", VisualModules.Fullbright.class));
            }
            case CONTROLS -> {
                rows.add(new Section("SLOTH CLIENT"));
                for (KeyMapping k : new KeyMapping[] {SlothClient.MOD_MENU, SlothClient.STUDIO, SlothClient.QUICK_CONTROLS, SlothClient.QUICK_WHEEL, SlothClient.HOLD_QUIET, SlothClient.HOLD_CLEAN, SlothClient.ZOOM, SlothClient.FREELOOK, SlothClient.TOGGLE_HUD, SlothClient.STOPWATCH}) rows.add(new Bind(k));
                rows.add(new Section("TEXT HOTKEYS"));
                for (KeyMapping k : SlothClient.HOTKEYS) rows.add(new Bind(k));
                rows.add(new Section("MOVEMENT"));
                for (KeyMapping k : new KeyMapping[] {o.keySprint, o.keyShift, o.keyJump}) rows.add(new Bind(k));
            }
        }
        String q = query.trim().toLowerCase(Locale.ROOT);
        if (q.isEmpty() && advanced) return rows;
        List<Row> filtered = new ArrayList<>();
        Section section = null;
        boolean included = false;
        for (Row row : rows) {
            if (row instanceof Section s) { section = s; included = false; continue; }
            if (q.isEmpty() ? !common(row) : !label(row).toLowerCase(Locale.ROOT).contains(q)) continue;
            if (!included && section != null) filtered.add(section);
            filtered.add(row);
            included = true;
        }
        return filtered;
    }

    private boolean common(Row row) {
        if(row instanceof Bind b)return java.util.Set.of(SlothClient.MOD_MENU,SlothClient.STUDIO,SlothClient.ZOOM,SlothClient.FREELOOK,minecraft.options.keySprint,minecraft.options.keyShift,minecraft.options.keyJump).contains(b.key());
        return java.util.Set.of("Smooth animations","Toggle Sprint","Toggle Sneak","Show Sloth HUD","Render Distance","Max FPS","VSync").contains(label(row));
    }

    private String label(Row r) {
        return switch (r) {
            case Section s -> s.label();
            case Toggle t -> t.label();
            case Slider s -> s.label();
            case Choice c -> c.label();
            case Bind b -> Component.translatable(b.key().getName()).getString();
        };
    }

    // ---------- layout + draw ----------

    @Override
    protected void renderContent(GuiGraphics g, int mouseX, int mouseY, float partialTick) {
        smooth.clamp(Math.max(0, contentHeight - listH));
        scroll = smooth.get();
        long now = System.nanoTime();
        frameDt = now - lastFrame;
        lastFrame = now;
        rowIndex = 0;
        hits.clear();
        List<Row> rows = rows();
        int cols = contentW >= 460 ? 2 : 1;
        int colW = (contentW - 10) / cols;
        int y = listY - scroll, col = 0;
        g.enableScissor(contentX, listY, contentX + contentW, listY + listH);
        for (Row r : rows) {
            if (r instanceof Toggle t) {
                int x = contentX + col * (colW + 10);
                draw(g, t, x, y, colW, mouseX, mouseY);
                entrance(g, x, y, colW);
                hits.add(new Hit(t, x, y, colW, 22));
                col++;
                if (col == cols) { col = 0; y += 28; }
                continue;
            }
            if (col == 1) { col = 0; y += 28; }
            switch (r) {
                case Section s -> {
                    y += 4;
                    g.drawString(font, Component.literal(s.label()).withStyle(ChatFormatting.BOLD), contentX, y + 3, Ui.MUTED, false);
                    g.fill(contentX + font.width(s.label()) + 14, y + 7, contentX + contentW - 6, y + 8, Ui.LINE);
                    y += 24;
                }
                case Slider s -> { draw(g, s, contentX, y, contentW - 6, mouseX, mouseY); entrance(g, contentX, y, contentW - 6); hits.add(new Hit(s, contentX, y, contentW - 6, 22)); y += 28; }
                case Choice c -> { draw(g, c, contentX, y, contentW - 6, mouseX, mouseY); entrance(g, contentX, y, contentW - 6); hits.add(new Hit(c, contentX, y, contentW - 6, 22)); y += 28; }
                case Bind b -> { draw(g, b, contentX, y, contentW - 6, mouseX, mouseY); entrance(g, contentX, y, contentW - 6); hits.add(new Hit(b, contentX, y, contentW - 6, 22)); y += 28; }
                default -> { }
            }
        }
        if (col == 1) y += 28;
        g.disableScissor();
        contentHeight = y + scroll - listY;
        Ui.scrollbar(g, contentX + contentW - 3, listY, listH, scroll, Math.max(0, contentHeight - listH));
        if (rows.isEmpty()) Ui.centered(g, font, "No settings match this search.", contentX + contentW / 2, listY + 20, Ui.MUTED);
    }

    private int contentHeight;

    /** Rows fade up out of the panel one after another when the tab opens. */
    private void entrance(GuiGraphics g, int x, int y, int w) {
        float p = Motion.out(contentShownAt() + Math.min(rowIndex++, 16) * 22L, 240f);
        if (p < 1f) g.fill(x - 3, y - 1, x + w + 1, y + 17, (int) ((1f - p) * 255) << 24 | 0x121216);
    }

    /** A soft highlight behind the row under the mouse. */
    private float rowHover(GuiGraphics g, String key, boolean hover, int x, int y, int w) {
        float hv = hoverAnim.get(key, hover);
        Ui.rounded(g, x, y - 2, w, 24, SlothTheme.lerp(Ui.PANEL, Ui.PANEL_HOVER, hv));
        return hv;
    }

    private static int alpha(int rgb, float a) { return Math.max(0, Math.min(255, Math.round(a * 255))) << 24 | (rgb & 0xFFFFFF); }

    private void draw(GuiGraphics g, Toggle t, int x, int y, int w, int mx, int my) {
        boolean on = t.get().getAsBoolean();
        float hv = rowHover(g, "t:" + t.label(), Ui.inside(mx, my, x, y, w, 16), x, y, w);
        float k = toggleAnim.get(t.label(), on);
        int off = SlothTheme.lerp(0xFF424450, 0xFF555763, hv), onColour = SlothTheme.lerp(Ui.ACCENT, Ui.ACCENT_SOFT, hv);
        g.fill(x, y + 2, x + 38, y + 14, SlothTheme.lerp(off, onColour, k));
        int knob = x + 2 + Math.round(25 * k);
        g.fill(knob, y + 4, knob + 9, y + 12, 0xFFF4F1F4);
        if (k > 0.03f) g.drawString(font, Component.literal("ON").withStyle(ChatFormatting.BOLD), x + 5, y + 4, alpha(0xFFFFFF, k), false);
        if (k < 0.97f) g.drawString(font, Component.literal("OFF").withStyle(ChatFormatting.BOLD), x + 14, y + 4, alpha(0xFFFFFF, 1f - k), false);
        g.drawString(font, Ui.ellipsize(font, t.label(), w - 46), x + 44, y + 4, SlothTheme.lerp(Ui.TEXT, 0xFFFFFFFF, hv), false);
    }

    private void draw(GuiGraphics g, Slider s, int x, int y, int w, int mx, int my) {
        int tx = x + w / 2, tw = w / 2 - 50;
        boolean isDragging = dragging != null && dragging.label().equals(s.label());
        boolean onTrack = Ui.inside(mx, my, tx - 4, y, tw + 8, 16) || isDragging;
        float hv = rowHover(g, "s:" + s.label(), Ui.inside(mx, my, x, y, w, 16), x, y, w);
        g.drawString(font, Ui.ellipsize(font, s.label(), w / 2 - 12), x + 6, y + 4, Ui.TEXT, false);
        float f = (float) ((s.get().getAsDouble() - s.min()) / (s.max() - s.min()));
        float[] shown = sliderShown.computeIfAbsent(s.label(), k -> new float[] {f});
        shown[0] = isDragging || !SlothTheme.animated() ? f : SlothTheme.ease(shown[0], f, frameDt, 16f);
        g.fill(tx, y + 7, tx + tw, y + 9, 0xFF2E2C35);
        g.fill(tx, y + 7, tx + Math.round(tw * shown[0]), y + 9, Ui.warm(0xFFFF8A4D));
        int knob = tx + Math.round(tw * shown[0]);
        int grow = onTrack ? 1 : 0;
        g.fill(knob - 3 - grow, y + 3 - grow, knob + 3 + grow, y + 13 + grow, onTrack ? Ui.warm(0xFFFFB07A) : Ui.warm(0xFFFF8A4D));
        String value = s.fmt().apply(s.get().getAsDouble());
        g.drawString(font, value, x + w - font.width(value) - 4, y + 4, Ui.ACCENT_SOFT, false);
    }

    private void draw(GuiGraphics g, Choice c, int x, int y, int w, int mx, int my) {
        float hv = rowHover(g, "c:" + c.label(), Ui.inside(mx, my, x, y, w, 16), x, y, w);
        g.drawString(font, Ui.ellipsize(font, c.label(), w / 2 - 12), x + 6, y + 4, Ui.TEXT, false);
        String value = c.get().get();
        int cx = x + w * 3 / 4;
        g.drawString(font, "‹", x + w / 2, y + 4, Ui.inside(mx, my, x + w / 2 - 4, y, 14, 16) ? Ui.ACCENT_SOFT : Ui.MUTED, false);
        g.drawString(font, "›", x + w - 10, y + 4, Ui.inside(mx, my, x + w - 14, y, 14, 16) ? Ui.ACCENT_SOFT : Ui.MUTED, false);
        // A new value slides in from the side you clicked.
        long[] changed = choiceChanged.get(c.label());
        float p = changed == null ? 1f : Motion.out(changed[0], 200f);
        int offset = changed == null ? 0 : Math.round((1f - p) * 10f * changed[1]);
        g.drawString(font, value, cx - font.width(value) / 2 + offset, y + 4, alpha(Ui.TEXT, 0.25f + 0.75f * p), false);
    }

    private void draw(GuiGraphics g, Bind b, int x, int y, int w, int mx, int my) {
        float hv = rowHover(g, "b:" + b.key().getName(), Ui.inside(mx, my, x, y, w, 16), x, y, w);
        g.drawString(font, Ui.ellipsize(font, Component.translatable(b.key().getName()).getString(), w - 106), x + 6, y + 4, Ui.TEXT, false);
        int bw = 90, bx = x + w - bw;
        float bh = hoverAnim.get("bb:" + b.key().getName(), Ui.inside(mx, my, bx, y, bw, 16));
        boolean waiting = listening == b.key();
        g.fill(bx, y, bx + bw, y + 16, waiting ? Ui.warm(0xFF5A2E1C) : SlothTheme.lerp(0xFF1D1C23, 0xFF2C2A34, bh));
        g.renderOutline(bx, y, bw, 16, waiting ? Ui.ACCENT : SlothTheme.lerp(0xFF33313A, Ui.warm(0xFF6A4432), bh));
        String label = waiting ? "> press a key <" : b.key().isUnbound() ? "NONE" : b.key().getTranslatedKeyMessage().getString().toUpperCase(Locale.ROOT);
        Ui.centered(g, font, Ui.ellipsize(font, label, bw - 6), bx + bw / 2, y + 4, waiting ? Ui.ACCENT_SOFT : b.key().isUnbound() ? Ui.DIM : 0xFFE6E2E8);
    }

    // ---------- input ----------

    @Override
    public boolean mouseClicked(MouseButtonEvent event, boolean doubleClick) {
        if (super.mouseClicked(event, doubleClick)) return true;
        double mx = event.x(), my = event.y();
        if (!Ui.inside(mx, my, contentX, listY, contentW, listH)) return false;
        for (Hit h : hits) {
            if (!Ui.inside(mx, my, h.x(), h.y(), h.w(), h.h())) continue;
            switch (h.row()) {
                case Toggle t -> t.set().accept(!t.get().getAsBoolean());
                case Slider s -> {
                    if (mx < h.x() + h.w() / 2 - 4 || mx > h.x() + h.w() - 46) return true;
                    dragging = s; draggingHit = h; applySlider(s, h, mx);
                }
                case Choice c -> {
                    int i = c.options().indexOf(c.get().get());
                    int dir = mx < h.x() + h.w() * 3 / 4 ? -1 : 1;
                    c.set().accept(c.options().get(Math.floorMod(i + dir, c.options().size())));
                    choiceChanged.put(c.label(), new long[] {System.currentTimeMillis(), dir});
                }
                case Bind b -> listening = b.key();
                default -> { }
            }
            ModuleManager.save();
            minecraft.options.save();
            return true;
        }
        return false;
    }

    private void applySlider(Slider s, Hit h, double mx) {
        int tx = h.x() + h.w() / 2, tw = h.w() / 2 - 50;
        double f = Mth.clamp((mx - tx) / tw, 0, 1);
        double v = s.min() + f * (s.max() - s.min());
        v = Math.round(v / s.step()) * s.step();
        s.set().accept(Mth.clamp(v, s.min(), s.max()));
    }

    @Override
    public boolean mouseDragged(MouseButtonEvent event, double dx, double dy) {
        if (dragging != null) { applySlider(dragging, draggingHit, event.x()); return true; }
        return super.mouseDragged(event, dx, dy);
    }

    @Override
    public boolean mouseReleased(MouseButtonEvent event) {
        if (dragging != null) { dragging = null; minecraft.options.save(); ModuleManager.save(); return true; }
        return super.mouseReleased(event);
    }

    @Override
    public boolean mouseScrolled(double mouseX, double mouseY, double scrollX, double scrollY) {
        if (!Ui.inside(mouseX, mouseY, contentX, listY, contentW, listH)) return super.mouseScrolled(mouseX, mouseY, scrollX, scrollY);
        smooth.by(-scrollY * 28, Math.max(0, contentHeight - listH));
        return true;
    }

    @Override
    public boolean keyPressed(KeyEvent event) {
        if (listening != null) {
            if (event.key() == GLFW.GLFW_KEY_ESCAPE) { listening = null; return true; }
            listening.setKey(event.key() == GLFW.GLFW_KEY_BACKSPACE || event.key() == GLFW.GLFW_KEY_DELETE ? InputConstants.UNKNOWN : InputConstants.getKey(event));
            KeyMapping.resetMapping();
            minecraft.options.save();
            listening = null;
            return true;
        }
        return super.keyPressed(event);
    }
}
