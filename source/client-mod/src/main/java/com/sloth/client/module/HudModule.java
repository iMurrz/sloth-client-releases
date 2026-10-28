package com.sloth.client.module;

import net.minecraft.client.gui.Font;
import net.minecraft.client.gui.GuiGraphics;

/**
 * A module drawn on the HUD. Position is stored as a fraction of the screen so layouts survive window and GUI
 * scale changes; the HUD editor drags these around.
 */
public abstract class HudModule extends Module {
    public static final int PAD = 3;

    public final Setting.Text group = add(new Setting.Text("hud_group", "HUD group", "", 32));
    public float x;
    public float y;
    public final float defaultX;
    public final float defaultY;
    public final Setting.Number scale = add(new Setting.Number("scale", "Size", 1.0, 0.5, 2.5, 0.05, "x"));
    public final Setting.Colour textColor = add(new Setting.Colour("text_color", "Text colour", 0xFFFFFFFF));
    public final Setting.Bool background = add(new Setting.Bool("background", "Background", true));
    public final Setting.Colour backgroundColor = add(new Setting.Colour("background_color", "Background colour", 0x985D5066));
    public final Setting.Colour borderColor = add(new Setting.Colour("border_color", "Panel outline colour", 0xB8F1B6D0));
    public final Setting.Bool shadow = add(new Setting.Bool("shadow", "Text shadow", true));

    protected HudModule(String id, String name, String description, boolean defaultEnabled, float defaultX, float defaultY) {
        super(id, name, description, Category.HUD, defaultEnabled);
        this.x = this.defaultX = defaultX;
        this.y = this.defaultY = defaultY;
    }

    protected HudModule(String id, String name, String description, Category category, boolean defaultEnabled, float defaultX, float defaultY) {
        super(id, name, description, category, defaultEnabled);
        this.x = this.defaultX = defaultX;
        this.y = this.defaultY = defaultY;
    }

    /** Unscaled content size, excluding padding. */
    public abstract int contentWidth(Font font, boolean preview);
    public abstract int contentHeight(Font font, boolean preview);
    /** Draws at (x, y) in unscaled coordinates. `preview` is true in the HUD editor (show sample data). */
    public abstract void renderContent(GuiGraphics g, Font font, int x, int y, boolean preview);

    /** Whether there is anything to show right now (e.g. Ping hides in singleplayer). */
    public boolean hasContent() { return true; }

    public int width(Font font, boolean preview) { return Math.round((contentWidth(font, preview) + PAD * 2) * scale.f()); }
    public int height(Font font, boolean preview) { return Math.round((contentHeight(font, preview) + PAD * 2) * scale.f()); }

    public int screenX(Font font, int screenW, boolean preview) {
        return Math.max(0, Math.min(screenW - width(font, preview), Math.round(x * screenW)));
    }

    public int screenY(Font font, int screenH, boolean preview) {
        return Math.max(0, Math.min(screenH - height(font, preview), Math.round(y * screenH)));
    }

    public void resetPosition() { x = defaultX; y = defaultY; }

    public final void render(GuiGraphics g, Font font, boolean preview) {
        beginRender(preview);
        try {
        float s = scale.f();
        int w = contentWidth(font, preview) + PAD * 2;
        int h = contentHeight(font, preview) + PAD * 2;
        int sx = Math.max(0, Math.min(g.guiWidth() - Math.round(w * s), Math.round(x * g.guiWidth())));
        int sy = Math.max(0, Math.min(g.guiHeight() - Math.round(h * s), Math.round(y * g.guiHeight())));
        g.pose().pushMatrix();
        try {
        g.pose().translate(sx, sy);
        g.pose().scale(s, s);
        if (background.on()) {
            int fill = backgroundColor.argb();
            // Update the old built-in black default to the new soft plum glass style; custom colours are untouched.
            if (fill == 0x90101014) fill = 0x985D5066;
            g.fill(0, 0, w, h, fill);
            g.renderOutline(0, 0, w, h, borderColor.argb());
        }
        renderContent(g, font, PAD, PAD, preview);
        } finally { g.pose().popMatrix(); }
        } finally { endRender(); }
    }
    protected void beginRender(boolean preview) {}
    protected void endRender() {}

    protected void text(GuiGraphics g, Font font, String s, int x, int y, int lineIndex) {
        g.drawString(font, s, x, y, textColor.argb(lineIndex * 0.08f), shadow.on());
    }
}
