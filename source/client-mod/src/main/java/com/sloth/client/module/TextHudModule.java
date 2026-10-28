package com.sloth.client.module;

import net.minecraft.client.gui.Font;
import net.minecraft.client.gui.GuiGraphics;

import java.util.List;

/** HUD module that shows a few lines of text (FPS, CPS, coordinates...). */
public abstract class TextHudModule extends HudModule {
    public final Setting.Bool brackets = add(new Setting.Bool("brackets", "[Brackets]", false));

    protected TextHudModule(String id, String name, String description, boolean defaultEnabled, float defaultX, float defaultY) {
        super(id, name, description, defaultEnabled, defaultX, defaultY);
    }

    protected abstract List<String> lines(boolean preview);
    private List<String> renderLines;
    private Font measuredFont;
    private int measuredWidth=-1;
    @Override protected void beginRender(boolean preview) { renderLines=sample(preview);measuredFont=null;measuredWidth=-1; }
    @Override protected void endRender() { renderLines=null;measuredFont=null;measuredWidth=-1; }

    private List<String> framed(boolean preview) {
        return renderLines==null?sample(preview):renderLines;
    }
    private List<String> sample(boolean preview) {
        List<String> lines = lines(preview);
        return brackets.on() ? lines.stream().map(l -> "[" + l + "]").toList() : lines;
    }

    @Override public int contentWidth(Font font, boolean preview) {
        if(renderLines!=null&&measuredFont==font&&measuredWidth>=0)return measuredWidth;
        int w = 0;
        for (String line : framed(preview)) w = Math.max(w, font.width(line));
        if(renderLines!=null){measuredFont=font;measuredWidth=w;}return w;
    }

    @Override public int contentHeight(Font font, boolean preview) {
        return Math.max(1, framed(preview).size()) * (font.lineHeight + 1) - 1;
    }

    @Override public void renderContent(GuiGraphics g, Font font, int x, int y, boolean preview) {
        List<String> lines = framed(preview);
        for (int i = 0; i < lines.size(); i++) text(g, font, lines.get(i), x, y + i * (font.lineHeight + 1), i);
    }
}
