package com.sloth.client.screen;

import com.mojang.blaze3d.platform.NativeImage;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.Font;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.renderer.texture.DynamicTexture;
import net.minecraft.resources.Identifier;

import java.io.InputStream;
import java.util.HashMap;
import java.util.Map;

/**
 * Shared Sloth look for the in-game screens. Accent colours follow the launcher's accent (pink by default,
 * passed as -Dsloth.accentHue): every orange-family colour in the menus is re-hued through {@link #warm}, keeping
 * its brightness and saturation, while reds (errors), greens (on) and greys stay as they are.
 */
public final class Ui {
    /** Hue of the original ember orange the menus were designed in. */
    private static final float BASE_HUE = 18f;
    /** Accent hue for this session: 330 pink, 275 violet, 200 ocean, 18 ember. */
    public static final float ACCENT_HUE = accentHue();
    private static final Map<Integer, Integer> WARM = new HashMap<>();
    private static final Map<Identifier, Identifier> ART = new HashMap<>();

    public static final int BG = 0xC0120610;
    public static final int PANEL = 0xD01A0A16;
    public static final int PANEL_HOVER = 0xE02E1229;
    public static final int LINE = 0xFF6A2A52;
    public static final int TEXT = 0xFFFFF8FD;
    public static final int MUTED = 0xFFD1C2D2;
    public static final int DIM = 0xFF948198;
    public static final int ACCENT = warm(0xFFFF6A2A);
    public static final int ACCENT_SOFT = warm(0xFFFFA36E);
    public static final int GOOD = 0xFF59D595;
    public static final int BAD = 0xFFED7A62;

    private Ui() {}

    private static float accentHue() {
        try {
            float hue = Float.parseFloat(System.getProperty("sloth.accentHue", "330"));
            return hue >= 0 && hue < 360 ? hue : 330f;
        } catch (NumberFormatException e) {
            return 330f;
        }
    }

    /** An ARGB colour re-hued to the accent if it's one of the orange-family accent colours. */
    public static int warm(int argb) {
        if (Math.abs(ACCENT_HUE - BASE_HUE) < 0.5f) return argb;
        Integer cached = WARM.get(argb);
        if (cached != null) return cached;
        int out = shift(argb);
        if (WARM.size() < 4096) WARM.put(argb, out);
        return out;
    }

    /** {@link #warm} for a colour without alpha (0xRRGGBB), e.g. one combined with a computed alpha later. */
    public static int warmRgb(int rgb) {
        return warm(0xFF000000 | rgb) & 0xFFFFFF;
    }

    private static int shift(int argb) {
        // Semantic reds keep their meaning.
        if (argb == BAD || argb == 0xFFF19A86) return argb;
        float r = (argb >> 16 & 255) / 255f, g = (argb >> 8 & 255) / 255f, b = (argb & 255) / 255f;
        float max = Math.max(r, Math.max(g, b)), min = Math.min(r, Math.min(g, b)), l = (max + min) / 2f;
        if (max == min) return argb;
        float d = max - min, s = l > 0.5f ? d / (2f - max - min) : d / (max + min);
        float h = max == r ? (g - b) / d + (g < b ? 6 : 0) : max == g ? (b - r) / d + 2 : (r - g) / d + 4;
        h *= 60f;
        if (h < 5f || h > 45f || s < 0.12f) return argb;
        float nh = ((ACCENT_HUE + (h - BASE_HUE)) % 360f + 360f) % 360f;
        return (argb & 0xFF000000) | hslToRgb(nh / 360f, s, l);
    }

    private static int hslToRgb(float h, float s, float l) {
        float q = l < 0.5f ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
        int r = Math.round(hue(p, q, h + 1f / 3) * 255), g = Math.round(hue(p, q, h) * 255), b = Math.round(hue(p, q, h - 1f / 3) * 255);
        return r << 16 | g << 8 | b;
    }

    private static float hue(float p, float q, float t) {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1f / 6) return p + (q - p) * 6 * t;
        if (t < 1f / 2) return q;
        if (t < 2f / 3) return p + (q - p) * (2f / 3 - t) * 6;
        return p;
    }

    /**
     * The given menu artwork re-hued to the accent (made once, on the render thread, the first time it's drawn).
     * Falls back to the original if anything goes wrong.
     */
    public static Identifier art(Identifier source) {
        if (Math.abs(ACCENT_HUE - BASE_HUE) < 0.5f) return source;
        Identifier done = ART.get(source);
        if (done != null) return done;
        Identifier result = source;
        Minecraft mc = Minecraft.getInstance();
        try (InputStream in = mc.getResourceManager().getResourceOrThrow(source).open()) {
            NativeImage image = NativeImage.read(in);
            for (int y = 0; y < image.getHeight(); y++) {
                for (int x = 0; x < image.getWidth(); x++) image.setPixel(x, y, shift(image.getPixel(x, y)));
            }
            result = Identifier.fromNamespaceAndPath(source.getNamespace(), "accent/" + source.getPath());
            mc.getTextureManager().register(result, new DynamicTexture(() -> "Sloth accent " + source, image));
        } catch (Exception e) {
            com.sloth.client.SlothClient.LOG.warn("Could not re-colour {}", source, e);
            result = source;
        }
        ART.put(source, result);
        return result;
    }

    public static void panel(GuiGraphics g, int x, int y, int w, int h, int fill) {
        rounded(g, x, y, w, h, fill);
        roundedOutline(g, x, y, w, h, LINE);
    }

    /** Angular holographic panels: top-right and bottom-left corners are cut at 45 degrees instead of rounded. */
    private static int cut(int w, int h) { return Math.max(0, Math.min(6, Math.min(w, h) / 3)); }

    public static void rounded(GuiGraphics g, int x, int y, int w, int h, int colour) {
        if (w <= 0 || h <= 0) return;
        int c = cut(w, h);
        if (c == 0) { g.fill(x, y, x + w, y + h, colour); return; }
        g.fill(x, y + c, x + w, y + h - c, colour);
        for (int i = 0; i < c; i++) {
            g.fill(x, y + i, x + w - (c - i), y + i + 1, colour);
            g.fill(x + (c - i), y + h - 1 - i, x + w, y + h - i, colour);
        }
    }

    public static void roundedOutline(GuiGraphics g, int x, int y, int w, int h, int colour) {
        if (w < 2 || h < 2) return;
        int c = cut(w, h);
        if (c == 0) { g.renderOutline(x, y, w, h, colour); return; }
        g.fill(x, y, x + w - c, y + 1, colour);
        g.fill(x + c, y + h - 1, x + w, y + h, colour);
        g.fill(x, y, x + 1, y + h - c, colour);
        g.fill(x + w - 1, y + c, x + w, y + h, colour);
        for (int i = 0; i < c; i++) {
            g.fill(x + w - c + i - 1, y + i, x + w - c + i, y + i + 1, colour);
            g.fill(x + i, y + h - c + i, x + i + 1, y + h - c + i + 1, colour);
        }
    }

    public static void scrollbar(GuiGraphics g, int x, int y, int h, int scroll, int max) {
        if (max <= 0 || h <= 0) return;
        int thumb = Math.min(h, Math.max(18, h * h / (h + max)));
        int top = y + Math.round((h - thumb) * Math.min(1f, Math.max(0f, scroll / (float) max)));
        rounded(g, x, y, 3, h, LINE);
        rounded(g, x, top, 3, thumb, ACCENT_SOFT);
    }

    public static int hoverColour(boolean hover) { return hover ? ACCENT_SOFT : DIM; }

    public static boolean inside(double mx, double my, int x, int y, int w, int h) {
        return mx >= x && my >= y && mx < x + w && my < y + h;
    }

    /** A small on/off pill like the launcher's switches. */
    public static void toggle(GuiGraphics g, int x, int y, boolean on, boolean locked) {
        rounded(g, x, y, 18, 9, locked ? 0xFF2A2A30 : on ? warm(0xFF5A2E1C) : 0xFF2C2A33);
        int knob = on ? x + 10 : x + 2;
        rounded(g, knob, y + 2, 6, 5, locked ? DIM : on ? warm(0xFFFF8A4D) : 0xFF8D8994);
    }

    public static String ellipsize(Font font, String text, int width) {
        if (font.width(text) <= width) return text;
        String dots = "...";
        String out = text;
        while (!out.isEmpty() && font.width(out + dots) > width) out = out.substring(0, out.length() - 1);
        return out + dots;
    }

    /** Centered Sloth text without Minecraft's automatic dark drop shadow. */
    public static void centered(GuiGraphics g, Font font, String text, int centerX, int y, int colour) {
        g.drawString(font, text, centerX - font.width(text) / 2, y, colour, false);
    }
}
