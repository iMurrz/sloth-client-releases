package com.sloth.client.screen;

import com.sloth.client.module.ModuleManager;
import com.sloth.client.module.impl.VisualModules;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.resources.Identifier;
import net.minecraft.util.ARGB;

import java.util.HashMap;
import java.util.Map;

/**
 * Restyles Minecraft's own widgets (buttons, sliders, text boxes, checkboxes, tabs, scroll bars) and menu
 * backgrounds in the Sloth look, so Options, the world and server lists, the pause menu and other mods' screens
 * match the Sloth menus. Hooked from {@code GuiGraphicsMixin}: every vanilla widget draws its sprite through
 * one method, so no per-screen code is needed. Returns false to let vanilla draw anything not handled here.
 */
public final class SlothTheme {
    private static final Identifier WORKSPACE_BACKGROUND = Identifier.fromNamespaceAndPath("sloth-client", "textures/gui/pink-workspace-background.png");
    private static VisualModules.MenuTheme module;
    private static final Map<Long, Anim> HOVER = new HashMap<>();
    private static long lastPurge;
    /** The slider track drawn just before its handle, so the handle can fill the track up to itself. */
    private static int trackX, trackY, trackW, trackH;

    private SlothTheme() {}

    private static VisualModules.MenuTheme module() {
        if (module == null) {
            try { module = ModuleManager.get(VisualModules.MenuTheme.class); } catch (IllegalStateException notYet) { return null; }
        }
        return module;
    }

    public static boolean on() {
        return true;
    }

    public static boolean backgrounds() { return true; }

    public static boolean animated() {
        VisualModules.MenuTheme m = module();
        return m == null || !m.isActive() || m.animations.on();
    }
    public static float motionSpeed(){VisualModules.MenuTheme m=module();return m==null?1:m.animationSpeed.f();}

    // ---------- widget sprites ----------

    public static boolean sprite(GuiGraphics g, Identifier id, int x, int y, int w, int h, int color) {
        if (!"minecraft".equals(id.getNamespace()) || !id.getPath().startsWith("widget/") || !on()) return false;
        int a = ARGB.alpha(color);
        String p = id.getPath();
        switch (p) {
            case "widget/button", "widget/button_highlighted" -> button(g, x, y, w, h, a, hover(x, y, w, h, p.endsWith("highlighted")));
            case "widget/button_disabled" -> {
                Ui.rounded(g, x, y, w, h, mul(0xC0141418, a));
                Ui.roundedOutline(g, x, y, w, h, mul(0xFF26252C, a));
            }
            case "widget/slider", "widget/slider_highlighted" -> {
                trackX = x; trackY = y; trackW = w; trackH = h;
                sliderBox(g, x, y, w, h, a, p.endsWith("highlighted"));
            }
            case "widget/slider_handle", "widget/slider_handle_highlighted" -> {
                boolean onTrack = trackY == y && trackH == h && x >= trackX && x + w <= trackX + trackW;
                sliderValue(g, onTrack ? trackX : x, y, onTrack ? trackW : w, h, x + w / 2, a, p.endsWith("highlighted"));
            }
            case "widget/text_field", "widget/text_field_highlighted" -> {
                Ui.rounded(g, x, y, w, h, mul(0xF0101014, a));
                Ui.roundedOutline(g, x, y, w, h, mul(p.endsWith("highlighted") ? Ui.ACCENT_SOFT : 0xFF36343D, a));
            }
            case "widget/checkbox", "widget/checkbox_highlighted", "widget/checkbox_selected", "widget/checkbox_selected_highlighted" -> {
                boolean selected = p.contains("selected"), focused = p.endsWith("highlighted");
                g.fill(x, y, x + w, y + h, mul(0xF0121217, a));
                g.renderOutline(x, y, w, h, mul(focused ? Ui.warm(0xFFA55A36) : selected ? Ui.warm(0xFF6A4432) : 0xFF3C3A44, a));
                if (selected) {
                    int in = Math.max(3, w / 4);
                    g.fill(x + in, y + in, x + w - in, y + h - in, mul(Ui.warm(0xFFFF8A4D), a));
                }
            }
            case "widget/scroller" -> g.fill(x + 1, y, x + w - 1, y + h, mul(0xFF55515E, a));
            case "widget/scroller_background" -> g.fill(x + 2, y, x + w - 2, y + h, mul(0x50000000, a));
            case "widget/tab", "widget/tab_highlighted", "widget/tab_selected", "widget/tab_selected_highlighted" -> {
                boolean selected = p.contains("selected");
                float t = hover(x, y, w, h, p.endsWith("highlighted"));
                g.fill(x, y, x + w, y + h, mul(selected ? 0xE0221C1D : lerp(0x70141418, 0xB0231F25, t), a));
                g.fill(x, y + h - (selected ? 2 : 1), x + w, y + h, mul(selected ? Ui.ACCENT : 0xFF2E2C35, a));
            }
            default -> { return false; }
        }
        return true;
    }

    /** Slider body: the same dark box as a button. */
    public static void sliderBox(GuiGraphics g, int x, int y, int w, int h, int a, boolean hot) {
        Ui.rounded(g, x, y, w, h, mul(hot ? Ui.ACCENT_SOFT : Ui.LINE, a));
        Ui.rounded(g, x + 1, y + 1, w - 2, h - 2, mul(Ui.PANEL, a));
    }

    /** Slider value: a slim ember progress line along the bottom and a bright handle at {@code handleX}. */
    public static void sliderValue(GuiGraphics g, int x, int y, int w, int h, int handleX, int a, boolean hot) {
        g.fill(x + 1, y + h - 3, x + w - 1, y + h - 1, mul(0xFF2A2830, a));
        g.fill(x + 1, y + h - 3, handleX, y + h - 1, mul(Ui.ACCENT, a));
        g.fill(handleX - 1, y + 2, handleX + 2, y + h - 1, mul(hot ? Ui.warm(0xFFFFD2AE) : Ui.warm(0xFFFF9A62), a));
    }

    /** Dark flat button; on hover the border warms up and an ember underline grows from the centre. */
    public static void button(GuiGraphics g, int x, int y, int w, int h, int a, float t) {
        Ui.rounded(g, x, y, w, h, mul(lerp(Ui.PANEL, Ui.PANEL_HOVER, t), a));
        Ui.roundedOutline(g, x, y, w, h, mul(lerp(0x60343642, Ui.ACCENT_SOFT, t), a));
    }

    // ---------- menu textures ----------

    public static boolean texture(GuiGraphics g, Identifier id, int x, int y, int w, int h) {
        if (!"minecraft".equals(id.getNamespace()) || !id.getPath().startsWith("textures/gui/") || !on()) return false;
        switch (id.getPath()) {
            case "textures/gui/menu_background.png" -> {
                g.blit(net.minecraft.client.renderer.RenderPipelines.GUI_TEXTURED, WORKSPACE_BACKGROUND, x, y, 0, 0, w, h, 1672, 941, 1672, 941);
                g.fill(x, y, x + w, y + h, 0x62100816);
            }
            case "textures/gui/inworld_menu_background.png" -> g.fill(x, y, x + w, y + h, 0x7A0C0B10);
            case "textures/gui/menu_list_background.png", "textures/gui/inworld_menu_list_background.png" -> g.fill(x, y, x + w, y + h, 0x5008070B);
            case "textures/gui/header_separator.png", "textures/gui/inworld_header_separator.png" -> g.fill(x, y + h - 1, x + w, y + h, 0xFF2E2C35);
            case "textures/gui/footer_separator.png", "textures/gui/inworld_footer_separator.png" -> g.fill(x, y, x + w, y + 1, 0xFF2E2C35);
            default -> { return false; }
        }
        return true;
    }

    // ---------- animation ----------

    /**
     * 0..1 hover amount for whatever is drawn at this rectangle, eased over about 120 ms. Widgets are identified by
     * where they are, so vanilla widgets animate without any per-widget state.
     */
    public static float hover(int x, int y, int w, int h, boolean hot) {
        float target = hot ? 1f : 0f;
        if (!animated()) return target;
        long now = System.nanoTime();
        long key = ((long) x & 0xFFFF) << 48 | ((long) y & 0xFFFF) << 32 | ((long) w & 0xFFFF) << 16 | ((long) h & 0xFFFF);
        Anim s = HOVER.get(key);
        if (s == null) {
            HOVER.put(key, new Anim(target, now));
            purge(now);
            return target;
        }
        s.value = ease(s.value, target, now - s.time, 16f);
        s.time = now;
        return s.value;
    }

    /** Moves {@code value} toward {@code target}; {@code speed} 16 settles in roughly 120 ms. */
    public static float ease(float value, float target, long elapsedNanos, float speed) {
        float dt = Math.min(0.1f, Math.max(0f, elapsedNanos / 1e9f));
        float next = target + (value - target) * (float) Math.exp(-dt * speed * motionSpeed());
        return Math.abs(next - target) < 0.01f ? target : next;
    }

    private static void purge(long now) {
        if (now - lastPurge < 5_000_000_000L) return;
        lastPurge = now;
        HOVER.values().removeIf(s -> now - s.time > 3_000_000_000L);
    }

    private static final class Anim {
        float value;
        long time;
        Anim(float value, long time) { this.value = value; this.time = time; }
    }

    /** Multiplies a colour's alpha by {@code a} (0..255), for widgets that fade in. */
    public static int mul(int argb, int a) {
        if (a >= 255) return argb;
        return ((argb >>> 24) * a / 255) << 24 | (argb & 0xFFFFFF);
    }

    public static int lerp(int from, int to, float t) {
        if (t <= 0f) return from;
        if (t >= 1f) return to;
        int fa = from >>> 24, fr = from >> 16 & 255, fg = from >> 8 & 255, fb = from & 255;
        int ta = to >>> 24, tr = to >> 16 & 255, tg = to >> 8 & 255, tb = to & 255;
        return Math.round(fa + (ta - fa) * t) << 24 | Math.round(fr + (tr - fr) * t) << 16 | Math.round(fg + (tg - fg) * t) << 8 | Math.round(fb + (tb - fb) * t);
    }
}
