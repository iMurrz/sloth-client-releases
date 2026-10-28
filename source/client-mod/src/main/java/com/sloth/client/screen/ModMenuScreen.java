package com.sloth.client.screen;

import com.sloth.client.module.Module;
import com.sloth.client.module.ModuleIcons;
import com.sloth.client.module.ModuleManager;
import com.sloth.client.module.Setting;
import com.sloth.client.screen.widget.SlothButton;
import net.minecraft.ChatFormatting;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.EditBox;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.input.MouseButtonEvent;
import net.minecraft.network.chat.Component;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * MODS tab: a searchable, filterable library of Sloth features.
 *
 * Rows cascade in on open and when the filter or search changes; hover, state outlines, and row positions ease
 * between values. Right-clicking a row toggles its favourite marker.
 */
public final class ModMenuScreen extends MenuFrame {
    private static final int GAP_X = 12, GAP_Y = 10, SETTINGS_H = 26;
    private int rowH = 44;
    private static String filter = "ALL";
    private static final java.util.Set<String> COMMON = java.util.Set.of("zoom", "freelook", "crosshair", "sprint");
    private static String sort = "FAVORITES";
    private static String query = "";
    private EditBox search;
    private int scroll;
    private final SmoothScroll smooth = new SmoothScroll();
    private int gridY, gridH, columns, cardW, libraryW, inspectorX, inspectorW;
    private static String inspectedId = "chat_hub";

    private final Motion.Tracker hoverAnim = new Motion.Tracker(16f);
    private final Motion.Tracker optionsAnim = new Motion.Tracker(18f);
    private final Map<String, Long> toggledAt = new HashMap<>();
    /** Where each card is drawn, in grid space (before scrolling), easing toward its cell. */
    private final Map<String, float[]> cardPos = new HashMap<>();
    private long lastFrame = System.nanoTime();

    public ModMenuScreen(Screen parent) { super(parent, "Sloth Client"); }

    @Override protected Tab tab() { return Tab.MODS; }

    @Override
    protected void initContent() {
        rowH = 104;
        int x = contentX, filterY = contentY;
        for (String f : new String[] {"ALL", "VISUAL", "UTILITY", "SOCIAL", "PERFORMANCE"}) {
            int w = font.width(f) + 22;
            if (x + w > contentX + contentW - 6) { x = contentX; filterY += 22; }
            SlothButton b = chip(x, filterY, w, 18, f, btn -> {
                if (filter.equals(f)) return;
                filter = f;
                smooth.reset();
                scroll = 0;
                cardPos.clear();
                replayContentEntrance();
                rebuildWidgets();
            });
            b.selected = filter.equals(f);
            x += w + 2;
        }
        search = sidebarSearch(query, s -> {
            query = s;
            smooth.reset();
            scroll = 0;
            cardPos.clear();
            replayContentEntrance();
        });
        gridY = filterY + 30;
        gridH = contentY + contentH - gridY;
        inspectorW = contentW >= 340 ? Math.min(158, contentW * 39 / 100) : contentW >= 250 ? 112 : 0;
        inspectorX = contentX + contentW - inspectorW;
        libraryW = contentW - (inspectorW > 0 ? inspectorW + 12 : 4);
        columns = libraryW >= 220 ? 2 : 1;
        cardW = (libraryW - GAP_X * (columns - 1)) / columns;
        cardPos.clear();
    }

    private List<Module> visible() {
        String q = query.trim().toLowerCase(Locale.ROOT);
        List<Module> list = new ArrayList<>();
        for (Module m : ModuleManager.all()) {
            boolean match = switch (filter) {
                case "COMMON" -> !q.isEmpty() || COMMON.contains(m.id) || m.favorite;
                case "SAVED" -> m.favorite;
                case "NEW" -> ModuleIcons.NEW.contains(m.id);
                case "HUD" -> m.category == Module.Category.HUD;
                case "VISUAL" -> m.category == Module.Category.VISUAL;
                case "UTILITY" -> m.category == Module.Category.UTILITY;
                case "SOCIAL" -> m.id.contains("chat") || m.id.contains("streamer") || m.id.contains("friend") || m.id.contains("text");
                case "PERFORMANCE" -> m.id.contains("fps") || m.id.contains("memory") || m.id.contains("fullbright") || m.id.contains("particle") || m.id.contains("sound");
                default -> true;
            };
            if (!match) continue;
            if (!q.isEmpty() && !(m.name.toLowerCase(Locale.ROOT).contains(q) || m.description.toLowerCase(Locale.ROOT).contains(q))) continue;
            list.add(m);
        }
        Comparator<Module> byName = Comparator.comparing(m -> m.name, String.CASE_INSENSITIVE_ORDER);
        Comparator<Module> byCategory = Comparator.comparing((Module m) -> m.category.ordinal()).thenComparing(byName);
        list.sort(switch (sort) {
            case "A–Z" -> byName;
            case "ENABLED" -> Comparator.comparing((Module m) -> !m.isEnabled()).thenComparing(byName);
            case "CATEGORY" -> byCategory;
            default -> Comparator.comparing((Module m) -> !m.favorite).thenComparing(byName);
        });
        if (filter.equals("ALL") && q.isEmpty()) {
            Map<String,Integer> showcase = Map.of("streamer_mode",0,"chat_hub",1,"nether_coordinates",2,"freelook",3);
            list.sort(Comparator.comparingInt((Module m) -> showcase.getOrDefault(m.id, 100)).thenComparing(byName));
        }
        return list;
    }

    private int maxScroll() {
        int rows = (visible().size() + columns - 1) / columns;
        return Math.max(0, rows * (rowH + GAP_Y) - GAP_Y - gridH);
    }

    private int cellX(int i) { return contentX + (i % columns) * (cardW + GAP_X); }
    private int cellY(int i) { return (i / columns) * (rowH + GAP_Y); }

    @Override
    protected void renderContent(GuiGraphics g, int mouseX, int mouseY, float partialTick) {
        smooth.clamp(maxScroll());
        scroll = smooth.get();
        long now = System.nanoTime(), dt = now - lastFrame;
        lastFrame = now;
        List<Module> modules = visible();
        String tooltip = null;
        boolean inGrid = Ui.inside(mouseX, mouseY, contentX, gridY, libraryW, gridH);
        g.enableScissor(contentX, gridY, contentX + libraryW, gridY + gridH);
        for (int i = 0; i < modules.size(); i++) {
            Module m = modules.get(i);
            final int cell = i;
            float[] pos = cardPos.computeIfAbsent(m.id, k -> new float[] {cellX(cell), cellY(cell)});
            pos[0] = SlothTheme.animated() ? SlothTheme.ease(pos[0], cellX(i), dt, 14f) : cellX(i);
            pos[1] = SlothTheme.animated() ? SlothTheme.ease(pos[1], cellY(i), dt, 14f) : cellY(i);
            int x = Math.round(pos[0]), y = gridY + Math.round(pos[1]) - scroll;
            if (y + rowH < gridY || y > gridY + gridH) continue;

            boolean locked = ModuleManager.isServerBlocked(m.id);
            int hx = cellX(i), hy = gridY + cellY(i) - scroll;
            boolean hover = inGrid && Ui.inside(mouseX, mouseY, hx, hy, cardW, rowH);
            float h = hoverAnim.get(m.id, hover);
            boolean settingsHover = hover && mouseY >= hy + rowH - SETTINGS_H - 9;
            float optionHover = optionsAnim.get(m.id, settingsHover);
            float intro = Motion.out(contentShownAt() + Math.min(i, 14) * 16L, 220f);

            g.pose().pushMatrix();
            g.pose().translate(0, -h * 1.2f + (1f - intro) * 7f);
            boolean inspected = m.id.equals(inspectedId);
            int fill = SlothTheme.lerp(0x8A191620, 0xD02A1B2A, h);
            int outline = locked ? Ui.DIM : inspected ? Ui.ACCENT : h > 0.2f ? Ui.ACCENT_SOFT : m.isEnabled() ? 0xA0663555 : 0x50343642;
            Ui.rounded(g,x,y,cardW,rowH,fill);
            Ui.roundedOutline(g,x,y,cardW,rowH,outline);
            Ui.toggle(g, x + cardW - 48, y + 15, m.isEnabled(), locked);

            Ui.rounded(g, x + 12, y + 10, 36, 36, m.isEnabled() ? 0xCC52213E : 0xAA30283A);
            g.renderItem(ModuleIcons.icon(m.id), x + 22, y + 20);
            int labelX = x + 13;
            int labelRight = x + cardW - 14;
            String label = Ui.ellipsize(font, m.name, labelRight - labelX);
            g.drawString(font, label, labelX, y + 51, locked ? 0xFFC0B8C4 : Ui.TEXT, false);
            var description = font.split(Component.literal(m.description), cardW - 26);
            for (int line = 0; line < Math.min(2, description.size()); line++)
                g.drawString(font, description.get(line), x + 13, y + 64 + line * 9, Ui.MUTED, false);
            Ui.rounded(g, x + 12, y + rowH - 22, cardW - 24, 16, SlothTheme.lerp(0xB0211A27, 0xD0352639, optionHover));
            Ui.roundedOutline(g, x + 12, y + rowH - 22, cardW - 24, 16, 0x704E3C52);
            g.drawString(font, "⚙  Settings", x + 22, y + rowH - 18, m.settings().isEmpty() ? Ui.DIM : Ui.TEXT, false);
            g.drawString(font, "›", x + cardW - 27, y + rowH - 18, Ui.TEXT, false);

            float flash = Motion.flash(toggledAt.getOrDefault(m.id, 0L), 260f);
            if (flash > 0f && !locked) g.fill(x + 1, y + 1, x + cardW - 1, y + 2, (int) (flash * 150) << 24 | 0xFFFFFF);
            if (intro < 1f) g.fill(x, y, x + cardW, y + rowH, (int) ((1f - intro) * 255) << 24 | 0x101116);
            g.pose().popMatrix();

            if (hover) tooltip = locked ? "This server has locked " + m.name + "." : settingsHover && !m.settings().isEmpty()
                ? "Open " + m.name + " settings" : m.name + (m.isEnabled()?" · enabled":" · disabled");
        }
        g.disableScissor();
        if (modules.isEmpty()) Ui.centered(g, font, "No modules match this search.", contentX + contentW / 2, gridY + 30, Ui.MUTED);
        int max = maxScroll();
        Ui.scrollbar(g, contentX + libraryW - 3, gridY, gridH, scroll, max);
        renderInspector(g);
        if (tooltip != null) g.setTooltipForNextFrame(font, Component.literal(tooltip), mouseX, mouseY);
    }

    private Module inspected() {
        Module module = ModuleManager.get(inspectedId);
        if (module != null) return module;
        List<Module> modules = visible();
        return modules.isEmpty() ? null : modules.getFirst();
    }

    private void renderInspector(GuiGraphics g) {
        if (inspectorW <= 0) return;
        Module module = inspected();
        Ui.rounded(g, inspectorX, gridY, inspectorW, gridH, 0xB018131C);
        Ui.roundedOutline(g, inspectorX, gridY, inspectorW, gridH, 0x8056334B);
        if (module == null) return;
        g.drawString(font, "SELECTED", inspectorX + 16, gridY + 15, Ui.DIM, false);
        Ui.rounded(g, inspectorX + 16, gridY + 30, 38, 38, 0xCC52213E);
        g.renderItem(ModuleIcons.icon(module.id), inspectorX + 27, gridY + 41);
        g.drawString(font, Ui.ellipsize(font, module.name.toUpperCase(Locale.ROOT), inspectorW - 82), inspectorX + 64, gridY + 34, Ui.TEXT, false);
        g.drawString(font, module.isEnabled() ? "ENABLED" : "DISABLED", inspectorX + 64, gridY + 50, module.isEnabled() ? Ui.ACCENT_SOFT : Ui.DIM, false);
        int py = gridY + 75, descLines = 0;
        for (var line : font.split(Component.literal(module.description), inspectorW - 32)) {
            if (descLines++ >= 2) break;
            g.drawString(font, line, inspectorX + 16, py, Ui.MUTED, false);
            py += 10;
        }
        py = gridY + 101;
        g.fill(inspectorX + 16, py, inspectorX + inspectorW - 16, py + 1, Ui.LINE);
        py += 10;
        g.drawString(font, "OPTIONS", inspectorX + 16, py, Ui.DIM, false);
        py += 12;
        int shown = 0;
        for (Setting<?> setting : module.settings()) {
            if (!setting.visible() || shown++ >= 4) continue;
            if (py + 27 > gridY + gridH - 45) break;
            g.drawString(font, Ui.ellipsize(font, setting.name, inspectorW - 78), inspectorX + 16, py + 5, Ui.TEXT, false);
            if (setting instanceof Setting.Bool bool) Ui.toggle(g, inspectorX + inspectorW - 54, py + 3, bool.on(), false);
            else g.drawString(font, "›", inspectorX + inspectorW - 25, py + 5, Ui.ACCENT_SOFT, false);
            g.fill(inspectorX + 16, py + 23, inspectorX + inspectorW - 16, py + 24, 0x504A374D);
            py += 27;
        }
        if (module.settings().isEmpty()) g.drawString(font, "No extra settings", inspectorX + 16, py + 4, Ui.MUTED, false);
        Ui.rounded(g, inspectorX + 16, gridY + gridH - 42, inspectorW - 32, 28, 0xFFED278C);
        Ui.centered(g, font, module.settings().isEmpty() ? "Selected" : "Configure settings  ›", inspectorX + inspectorW / 2, gridY + gridH - 32, 0xFF190C14);
    }

    @Override
    public boolean mouseClicked(MouseButtonEvent event, boolean doubleClick) {
        if (super.mouseClicked(event, doubleClick)) return true;
        double mx = event.x(), my = event.y();
        if (event.button() == 0 && inspectorW > 0 && Ui.inside(mx, my, inspectorX, gridY, inspectorW, gridH)) {
            Module selected = inspected();
            if (selected != null) {
                int optionY = gridY + 123;
                int shown = 0;
                for (Setting<?> setting : selected.settings()) {
                    if (!setting.visible() || shown++ >= 4 || optionY + 27 > gridY + gridH - 45) continue;
                    if (Ui.inside(mx, my, inspectorX + 12, optionY, inspectorW - 24, 24)) {
                        if (setting instanceof Setting.Bool bool) { bool.toggle(); ModuleManager.save(); }
                        else minecraft.setScreen(new ModuleSettingsScreen(this, selected));
                        return true;
                    }
                    optionY += 27;
                }
            }
        }
        if (inspectorW > 0 && Ui.inside(mx, my, inspectorX + 16, gridY + gridH - 42, inspectorW - 32, 28)) {
            Module selected = inspected();
            if (selected != null && !selected.settings().isEmpty()) minecraft.setScreen(new ModuleSettingsScreen(this, selected));
            return true;
        }
        if (!Ui.inside(mx, my, contentX, gridY, contentW, gridH)) return false;
        List<Module> modules = visible();
        long now = System.currentTimeMillis();
        for (int i = 0; i < modules.size(); i++) {
            Module m = modules.get(i);
            int x = cellX(i), y = gridY + cellY(i) - scroll;
            if (!Ui.inside(mx, my, x, y, cardW, rowH)) continue;
            boolean locked = ModuleManager.isServerBlocked(m.id);
            inspectedId = m.id;
            if (event.button() == 1) {
                m.favorite = !m.favorite;
            } else if (event.button() == 0 && my >= y + rowH - 24) {
                if (!m.settings().isEmpty()) minecraft.setScreen(new ModuleSettingsScreen(this, m));
                return true;
            } else if (event.button() == 0 && mx >= x + cardW - 54 && my < y + 42 && !locked && !m.isAlwaysEnabled()) {
                m.toggle();
                toggledAt.put(m.id, now);
            }
            ModuleManager.save();
            return true;
        }
        return false;
    }

    @Override
    public boolean mouseScrolled(double mouseX, double mouseY, double scrollX, double scrollY) {
        if (!Ui.inside(mouseX, mouseY, contentX, gridY, contentW, gridH)) return super.mouseScrolled(mouseX, mouseY, scrollX, scrollY);
        smooth.by(-scrollY * 30, maxScroll());
        return true;
    }
}
