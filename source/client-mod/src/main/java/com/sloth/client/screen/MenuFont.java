package com.sloth.client.screen;

import com.sloth.client.mixin.FontAccessor;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.Font;
import net.minecraft.client.gui.GlyphSource;
import net.minecraft.client.gui.font.glyphs.EffectGlyph;
import net.minecraft.network.chat.FontDescription;
import net.minecraft.resources.Identifier;

/** Smooth menu typography; world HUD, chat and resource-pack text retain their own font. */
public final class MenuFont {
    private static final FontDescription UI = new FontDescription.Resource(Identifier.fromNamespaceAndPath("sloth-client", "ui"));
    private static Font font;
    private MenuFont() {}

    public static Font get() {
        if (font == null) {
            font = new Font(new Font.Provider() {
                @Override public GlyphSource glyphs(FontDescription description) {
                    return ((FontAccessor) Minecraft.getInstance().font).sloth$provider().glyphs(description.equals(FontDescription.DEFAULT) ? UI : description);
                }
                @Override public EffectGlyph effect() { return ((FontAccessor) Minecraft.getInstance().font).sloth$provider().effect(); }
            });
        }
        return font;
    }
    /** Only Sloth-owned overlays use this selection. Vanilla/server text keeps its font. */
    public static Font hud() {
        try { if(com.sloth.client.module.ModuleManager.get(com.sloth.client.module.impl.VisualModules.MenuTheme.class).hudFont.is("Resource pack")) return Minecraft.getInstance().font; }
        catch(IllegalStateException notRegistered) { return Minecraft.getInstance().font; }
        return get();
    }
}
