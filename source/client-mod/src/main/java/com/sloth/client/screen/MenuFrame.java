package com.sloth.client.screen;

import com.sloth.client.SlothClient;
import com.sloth.client.module.ModuleManager;
import com.sloth.client.screen.widget.SlothButton;
import net.minecraft.ChatFormatting;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.EditBox;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.input.KeyEvent;
import net.minecraft.client.input.MouseButtonEvent;
import net.minecraft.client.renderer.RenderPipelines;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.Identifier;

/**
 * The Sloth menu window: logo, MODS / SETTINGS / STUDIO tabs, close button, and the profile
 * sidebar (Save as new profile, Edit HUD layout). Each tab is its own screen drawn inside this frame.
 *
 * Motion: the window slides and fades in when opened and out when closed; the tab underline glides between
 * tabs; switching tabs fades the new content in.
 */
public abstract class MenuFrame extends SlothScreen {
    public enum Tab { MODS, SETTINGS, STUDIO }

    private static final Identifier EMBLEM = Identifier.fromNamespaceAndPath("sloth-client", "textures/gui/pink-sloth-emblem.png");
    private static final Identifier WORKSPACE_BACKGROUND = Identifier.fromNamespaceAndPath("sloth-client", "textures/gui/pink-workspace-background.png");
    private static final float OPEN_MS = 240f, CLOSE_MS = 150f, CONTENT_MS = 200f;
    protected final Screen parent;
    protected int panelX, panelY, panelW, panelH;
    protected int contentX, contentY, contentW, contentH;
    protected int sidebarW;
    private boolean railNavigation;
    private int sidebarOffset;
    /** Set while switching tabs, so only a fresh open plays the window entrance. */
    private static boolean switchingTab;
    /** The sliding tab underline, shared across tab screens so it can glide from the old tab to the new one. */
    private static float lineX = -1, lineW;
    private static long lineTime;
    private int targetLineX, targetLineW;
    private long openedAt, contentShownAt, closingAt;

    protected MenuFrame(Screen parent, String title) {
        super(Component.literal(title));
        this.parent = parent;
    }

    /** 0 → 1 as the window opens, 1 → 0 as it closes. */
    private float windowProgress() {
        if (closingAt > 0) return 1f - Motion.out(closingAt, CLOSE_MS);
        return openedAt > 0 ? Motion.out(openedAt, OPEN_MS) : 1f;
    }

    /** When the current content appeared (fresh open or tab switch), for staggered entrances in subclasses. */
    protected long contentShownAt() { return contentShownAt; }

    /** Restarts the content entrance (e.g. after a filter change). */
    protected void replayContentEntrance() { contentShownAt = System.currentTimeMillis(); }

    protected abstract Tab tab();
    /** Optional secondary workspace page. When set, the matching rail item is selected instead of a top section. */
    protected String railPage() { return null; }
    protected String workspaceTitle() { return sectionTitle(tab()).toUpperCase(java.util.Locale.ROOT); }
    protected String workspaceSubtitle() {
        return switch (tab()) {
            case MODS -> "Build your own play style.";
            case SETTINGS -> "Tune the details. Make it yours.";
            case STUDIO -> "Your tools, in one place.";
        };
    }
    protected boolean showSidebar() { return true; }
    protected abstract void initContent();
    protected void renderContent(GuiGraphics g, int mouseX, int mouseY, float partialTick) {}
    protected void renderContentBackground(GuiGraphics g, int mouseX, int mouseY) {}

    @Override
    protected final void init() {
        if (openedAt == 0) {
            long now = System.currentTimeMillis();
            openedAt = switchingTab ? -1 : now;
            contentShownAt = now;
            if (!switchingTab) lineX = -1; // fresh open: the underline starts under the current tab
            switchingTab = false;
        }
        // The old 560x330 window made the controls feel compressed at normal UI scales.
        // Use the screen's available space while retaining a small-screen margin.
        panelW = Math.min(width - 36, 540);
        panelH = Math.min(height - 34, 350);
        panelX = (width - panelW) / 2;
        panelY = (height - panelH) / 2;
        sidebarW = showSidebar() ? Math.min(104, Math.max(92, panelW / 5)) : 0;
        railNavigation = showSidebar() && panelW >= 500 && panelH >= 320;
        sidebarOffset = railNavigation ? 95 : 0;
        contentX = panelX + sidebarW + 16;
        contentY = panelY + (railNavigation ? 65 : 48);
        contentW = panelW - sidebarW - 26;
        contentH = panelH - (railNavigation ? 100 : 58);

        // Tabs, centred in the header.
        Tab[] tabs = Tab.values();
        int total = 0;
        for (Tab t : tabs) total += font.width(tabLabel(t)) + 18;
        int tabAreaX = showSidebar() ? panelX + sidebarW : panelX;
        int tabAreaW = panelW - (showSidebar() ? sidebarW : 0) - 34;
        int tx = tabAreaX + (tabAreaW - total) / 2;
        int navIndex = 0;
        for (Tab t : tabs) {
            if (railNavigation && t != Tab.MODS) continue;
            int w = railNavigation ? sidebarW - 20 : font.width(tabLabel(t)) + 14;
            int nx = railNavigation ? panelX + 10 : tx;
            int ny = railNavigation ? panelY + 112 + navIndex++ * 32 : panelY + 9;
            SlothButton b = chip(nx, ny, w, railNavigation ? 22 : 20, railNavigation ? sectionTitle(t) : tabLabel(t), btn -> switchTo(t));
            b.selected = railPage() == null && t == tab();
            b.selectionLine = false;
            if (b.selected) { targetLineX = tx; targetLineW = w; }
            tx += w + 4;
        }
        button(panelX + panelW - 31, panelY + 13, 20, 20, "×", b -> onClose());

        if (showSidebar()) {
            int sx = panelX + 10, sw = sidebarW - 20;
            if (railNavigation) {
                railButton(sx, panelY + 80, sw, "Home", b -> minecraft.setScreen(parent));
                railButton(sx, panelY + 144, sw, "HUD", b -> minecraft.setScreen(new HudEditorScreen(this)));
                railButton(sx, panelY + 176, sw, "Gameplay", b -> minecraft.setScreen(new GameplayScreen(this)));
                railButton(sx, panelY + 208, sw, "Chat", b -> minecraft.setScreen(new ChatHubScreen(this)));
                railButton(sx, panelY + 240, sw, "Profiles", b -> minecraft.setScreen(new ProfilesScreen(this)));
                railButton(sx, panelY + 272, sw, "Settings", b -> switchTo(Tab.SETTINGS));
            } else {
                button(sx, panelY + 46, sw, 22, ModuleManager.activeProfile, b -> minecraft.setScreen(new ProfilesScreen(this)));
                button(sx, panelY + panelH - 52, sw, 20, "Profiles", b -> minecraft.setScreen(new ProfilesScreen(this)));
                primary(sx, panelY + panelH - 27, sw, 20, "EDIT HUD", b -> minecraft.setScreen(new HudEditorScreen(this)));
            }
        }
        initContent();
        setFocused(null);
    }

    private void railButton(int x, int y, int w, String label, java.util.function.Consumer<SlothButton> action) {
        SlothButton b = chip(x, y, w, 20, label, action);
        b.selected = label.equalsIgnoreCase(railPage()) || (label.equals("Settings") && railPage() == null && tab() == Tab.SETTINGS);
        b.selectionLine = false;
    }

    private String sectionTitle(Tab t) {
        return switch (t) { case MODS -> "Features"; case SETTINGS -> "Settings"; case STUDIO -> "More tools"; };
    }

    private String tabLabel(Tab t) {
        return switch (t) { case MODS -> "MODS"; case SETTINGS -> "SETTINGS"; case STUDIO -> "TOOLS"; };
    }

    /** A search box in the sidebar, under the profile button (keeps the content row free for filters). */
    protected EditBox sidebarSearch(String value, java.util.function.Consumer<String> onChange) {
        int searchW = railNavigation ? Math.min(165, Math.max(130, contentW / 3)) : sidebarW - 20;
        int searchX = railNavigation ? contentX + contentW - searchW : panelX + 10;
        int searchY = railNavigation ? panelY + 27 : panelY + 74 + sidebarOffset;
        EditBox box = new EditBox(font, searchX, searchY, searchW, 20, Component.literal("Search"));
        box.setHint(Component.literal("Search features...").withStyle(ChatFormatting.DARK_GRAY));
        box.setValue(value);
        box.setResponder(onChange);
        return addRenderableWidget(box);
    }

    protected void switchTo(Tab t) {
        if (t == tab() || closingAt > 0) return;
        ModuleManager.save();
        switchingTab = t != Tab.STUDIO;
        minecraft.setScreen(switch (t) {
            case MODS -> new ModMenuScreen(parent);
            case SETTINGS -> new SettingsScreen(parent);
            case STUDIO -> new StudioScreen(this,StudioScreen.Page.ADVANCED);
        });
    }

    @Override
    public void renderBackground(GuiGraphics g, int mouseX, int mouseY, float partialTick) {
        if (minecraft.level == null) {
            g.blit(RenderPipelines.GUI_TEXTURED, WORKSPACE_BACKGROUND, 0, 0, 0, 0, width, height, 1672, 941, 1672, 941);
            g.fill(0, 0, width, height, 0x3A100B14);
        } else {
            super.renderBackground(g, mouseX, mouseY, partialTick);
        }
        float p = windowProgress();
        g.pose().pushMatrix();
        g.pose().translate(0, (1f - p) * 12f);
        drawFrame(g, mouseX, mouseY);
        g.pose().popMatrix();
    }

    private void drawFrame(GuiGraphics g, int mouseX, int mouseY) {
        Ui.rounded(g, panelX - 3, panelY + 4, panelW + 6, panelH + 3, 0x50000000);
        Ui.roundedOutline(g,panelX-1,panelY-1,panelW+2,panelH+2,(Ui.ACCENT&0xFFFFFF)|0x40000000);
        Ui.rounded(g,panelX,panelY,panelW,panelH,0xE8120610);
        Ui.roundedOutline(g,panelX,panelY,panelW,panelH,(Ui.ACCENT&0xFFFFFF)|0xCC000000);
        Ui.rounded(g,panelX + 1,panelY + 1,sidebarW - 1,panelH - 2,0xD60D040B);
        g.fill(panelX + sidebarW, panelY + 1, panelX + sidebarW + 1, panelY + panelH - 1, Ui.LINE);
        g.blit(RenderPipelines.GUI_TEXTURED, EMBLEM, panelX + (sidebarW - 54) / 2, panelY + 12, 0, 0, 54, 54, 1254, 1254, 1254, 1254);
        int brandX = panelX + (sidebarW - font.width("SLOTH CLIENT")) / 2;
        g.drawString(font, "SLOTH", brandX, panelY + 68, Ui.TEXT, false);
        g.drawString(font, "CLIENT", brandX + font.width("SLOTH "), panelY + 68, Ui.ACCENT_SOFT, false);
        if (railNavigation) {
            g.pose().pushMatrix();
            g.pose().translate(contentX, panelY + 16);
            g.pose().scale(1.5f, 1.5f);
            g.drawString(font, workspaceTitle(), -1, 0, Ui.ACCENT_SOFT, false);
            g.drawString(font, workspaceTitle(), 1, 0, Ui.ACCENT, false);
            g.drawString(font, workspaceTitle(), 0, 0, Ui.TEXT, false);
            g.pose().popMatrix();
        }
        if (showSidebar()) {
            if (railNavigation) {
                long active = ModuleManager.all().stream().filter(m -> m.isEnabled()).count();
                g.fill(panelX + sidebarW + 1, panelY + panelH - 31, panelX + panelW - 1, panelY + panelH - 30, Ui.LINE);
                g.drawString(font, active + " modules  ·  Profile: " + ModuleManager.activeProfile + "  ·", contentX, panelY + panelH - 19, Ui.MUTED, false);
                Ui.rounded(g, contentX + font.width(active + " modules  ·  Profile: " + ModuleManager.activeProfile + "  ·") + 7, panelY + panelH - 18, 6, 6, Ui.GOOD);
                g.drawString(font, "Saved locally", contentX + font.width(active + " modules  ·  Profile: " + ModuleManager.activeProfile + "  ·") + 18, panelY + panelH - 19, Ui.MUTED, false);
            } else if (panelH >= 260) {
                int sy = panelY + sidebarOffset;
                g.drawString(font, "Your features", panelX + 10, sy + 106, Ui.DIM, false);
                long active = ModuleManager.all().stream().filter(m -> m.isEnabled()).count();
                g.drawString(font, active + " enabled", panelX + 10, sy + 120, Ui.ACCENT_SOFT, false);
            }
        }
        renderContentBackground(g, mouseX, mouseY);
    }

    /** The shared tab underline glides toward the selected tab. */
    private void drawTabLine(GuiGraphics g) {
        if (railNavigation) return;
        long now = System.nanoTime();
        if (lineX < 0 || !SlothTheme.animated()) { lineX = targetLineX; lineW = targetLineW; }
        else {
            long dt = now - lineTime;
            lineX = SlothTheme.ease(lineX, targetLineX, dt, 18f);
            lineW = SlothTheme.ease(lineW, targetLineW, dt, 18f);
        }
        lineTime = now;
        int x = Math.round(lineX), w = Math.round(lineW);
        g.fill(x, panelY + 35, x + w, panelY + 37, Ui.ACCENT);
    }

    @Override
    public void render(GuiGraphics g, int mouseX, int mouseY, float partialTick) {
        float p = windowProgress();
        boolean frozen = closingAt > 0;
        g.pose().pushMatrix();
        g.pose().translate(0, (1f - p) * 12f);
        super.render(g, frozen ? -1 : mouseX, frozen ? -1 : mouseY, partialTick);
        drawTabLine(g);
        renderContent(g, frozen ? -1 : mouseX, frozen ? -1 : mouseY, partialTick);
        // A tab switch fades the new content in.
        float c = Motion.out(contentShownAt, CONTENT_MS);
        if (c < 1f && openedAt < 0) g.fill(contentX - 2, contentY - 2, contentX + contentW + 2, contentY + contentH + 2, (int) ((1f - c) * 230) << 24 | 0x121216);
        // Fade the whole window in (or out) from the backdrop.
        if (p < 1f) g.fill(panelX - 1, panelY - 1, panelX + panelW + 1, panelY + panelH + 1, (int) ((1f - p) * 235) << 24 | 0x0C0B10);
        g.pose().popMatrix();
        if (frozen && p <= 0f) finishClose();
    }

    @Override
    public boolean keyPressed(KeyEvent event) {
        if (closingAt > 0) return true;
        if ((event.modifiers() & org.lwjgl.glfw.GLFW.GLFW_MOD_CONTROL) != 0 && event.key() == org.lwjgl.glfw.GLFW.GLFW_KEY_K) {
            minecraft.setScreen(new StudioScreen(this, StudioScreen.Page.SEARCH)); return true;
        }
        boolean typing = getFocused() instanceof EditBox box && box.isFocused();
        if (!typing && (SlothClient.MOD_MENU.matches(event) || SlothClient.STUDIO.matches(event))) { onClose(); return true; }
        return super.keyPressed(event);
    }

    @Override
    public boolean mouseClicked(MouseButtonEvent event, boolean doubleClick) {
        return closingAt > 0 || super.mouseClicked(event, doubleClick);
    }

    /** Plays the exit animation, then returns to the previous screen. */
    @Override
    public void onClose() {
        if (closingAt > 0) return;
        ModuleManager.save();
        if (!SlothTheme.animated()) { finishClose(); return; }
        closingAt = System.currentTimeMillis();
    }

    private void finishClose() {
        closingAt = -1;
        minecraft.setScreen(parent);
    }
}
