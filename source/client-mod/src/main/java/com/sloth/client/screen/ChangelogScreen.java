package com.sloth.client.screen;

import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.Component;
import net.minecraft.client.input.KeyEvent;
import org.lwjgl.glfw.GLFW;

/** Readable, scrollable notes for the installed client, available at every GUI scale. */
public final class ChangelogScreen extends SlothScreen {
    private final Screen parent;
    private final SmoothScroll smooth = new SmoothScroll();
    private int left, top, panelW, panelH, listY, listH, contentHeight;
    public ChangelogScreen(Screen parent) { super(Component.literal("What's new")); this.parent = parent; }

    @Override protected void init() {
        panelW = Math.min(480, width - 24);
        panelH = Math.min(420, height - 20);
        left = (width - panelW) / 2;
        top = (height - panelH) / 2;
        listY = top + 72;
        listH = panelH - 116;
        primary(left + panelW - 104, top + panelH - 34, 90, 22, "Done", b -> onClose());
    }
    @Override public void renderBackground(GuiGraphics g, int mx, int my, float tick) {
        super.renderBackground(g, mx, my, tick);
        Ui.panel(g, left, top, panelW, panelH, Ui.BG);
    }
    @Override public void render(GuiGraphics g, int mx, int my, float tick) {
        super.render(g, mx, my, tick);
        g.drawString(font, "WHAT'S NEW", left + 16, top + 14, Ui.ACCENT_SOFT, false);
        g.drawString(font, ClientUpdates.TITLE, left + 16, top + 32, Ui.TEXT, false);
        g.drawString(font, "Client interface · " + ClientUpdates.DATE, left + 16, top + 49, Ui.MUTED, false);
        g.fill(left + 16, top + 62, left + panelW - 16, top + 63, Ui.LINE);
        smooth.clamp(Math.max(0, contentHeight - listH));
        int scroll = smooth.get(), y = listY - scroll;
        g.enableScissor(left + 14, listY, left + panelW - 14, listY + listH);
        for (ClientUpdates.Entry entry : ClientUpdates.ENTRIES) {
            var lines = font.split(Component.literal(entry.detail()), panelW - 52);
            int h = 28 + lines.size() * 12;
            Ui.rounded(g, left + 16, y, panelW - 36, h, Ui.PANEL);
            g.drawString(font, entry.title(), left + 26, y + 9, Ui.TEXT, false);
            int ly = y + 25;
            for (var line : lines) { g.drawString(font, line, left + 26, ly, Ui.MUTED, false); ly += 12; }
            y += h + 8;
        }
        g.disableScissor();
        contentHeight = y + scroll - listY;
        Ui.scrollbar(g, left + panelW - 9, listY, listH, scroll, Math.max(0, contentHeight - listH));
        g.drawString(font, "Notes for the installed build", left + 16, top + panelH - 27, Ui.DIM, false);
    }
    @Override public boolean mouseScrolled(double mx, double my, double dx, double dy) {
        if (!Ui.inside(mx, my, left, listY, panelW, listH)) return super.mouseScrolled(mx, my, dx, dy);
        smooth.by(-dy * 32, Math.max(0, contentHeight - listH));
        return true;
    }
    @Override public boolean keyPressed(KeyEvent event) {
        int max = Math.max(0, contentHeight - listH);
        switch (event.key()) {
            case GLFW.GLFW_KEY_PAGE_DOWN -> smooth.by(listH * 0.8, max);
            case GLFW.GLFW_KEY_PAGE_UP -> smooth.by(-listH * 0.8, max);
            case GLFW.GLFW_KEY_HOME -> smooth.by(-max, max);
            case GLFW.GLFW_KEY_END -> smooth.by(max, max);
            default -> { return super.keyPressed(event); }
        }
        return true;
    }
    @Override public void onClose() { minecraft.setScreen(parent); }
}
