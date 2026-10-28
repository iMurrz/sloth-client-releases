package com.sloth.client.screen;

import com.sloth.client.module.ModuleManager;
import com.sloth.client.screen.widget.SlothButton;
import net.minecraft.ChatFormatting;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.EditBox;
import net.minecraft.client.gui.screens.ConfirmScreen;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.input.MouseButtonEvent;
import net.minecraft.network.chat.Component;
import java.util.ArrayList;
import java.util.List;

/** A scrollable library of complete module and HUD setups. */
public final class ProfilesScreen extends MenuFrame {
    private final SmoothScroll smooth = new SmoothScroll();
    private final List<SlothButton> actions = new ArrayList<>();
    private List<String> profiles = List.of();
    private EditBox name;
    private String message = "";
    private int listTop, listBottom, scroll;
    private static final int ROW = 38;

    public ProfilesScreen(Screen parent) { super(parent, "Profiles"); }

    @Override protected Tab tab() { return Tab.STUDIO; }
    @Override protected String railPage() { return "Profiles"; }
    @Override protected String workspaceTitle() { return "PROFILES"; }
    @Override protected String workspaceSubtitle() { return "Save complete setups and switch with confidence."; }

    @Override protected void initContent() {
        name = new EditBox(font, contentX, contentY, contentW - 116, 22, Component.literal("Profile name"));
        name.setMaxLength(24);
        name.setHint(Component.literal("Name your setup...").withStyle(ChatFormatting.GRAY));
        addRenderableWidget(name);
        primary(contentX + contentW - 108, contentY, 108, 22, "Save current", b -> {
            String n = name.getValue().trim();
            if (ModuleManager.saveProfile(n)) { message = "Saved " + n; rebuildWidgets(); }
            else message = "Use 1-24 letters, numbers, spaces, - or _.";
        });
        listTop = contentY + 36;
        listBottom = contentY + contentH - 48;
        profiles = ModuleManager.profiles();
        actions.clear();
        for (String p : profiles) {
            SlothButton load = new SlothButton(0, 0, 70, 22, Component.literal(p.equals(ModuleManager.activeProfile) ? "Active" : "Review"), SlothButton.Style.NORMAL, b -> {
                var setup=ModuleManager.previewProfile(p);if(setup!=null)minecraft.setScreen(new SetupReviewScreen(this,"Profile: "+p,setup));else {message="Could not read "+p;rebuildWidgets();}
            });
            load.active = !p.equals(ModuleManager.activeProfile);
            actions.add(load); addWidget(load);
            SlothButton delete = new SlothButton(0, 0, 54, 22, Component.literal("Delete"), SlothButton.Style.DANGER, b -> minecraft.setScreen(new ConfirmScreen(yes -> {
                if (yes) ModuleManager.deleteProfile(p);
                minecraft.setScreen(this);
            }, Component.literal("Delete profile " + p + "?"), Component.literal("This can't be undone."))));
            actions.add(delete); addWidget(delete);
        }
        button(contentX, contentY + contentH - 24, contentW - 100, 22, "Reset modules to defaults", b -> minecraft.setScreen(new ConfirmScreen(yes -> {
            if (yes) { ModuleManager.resetAll(); message = "Reset to defaults."; }
            minecraft.setScreen(this);
        }, Component.literal("Reset all modules?"), Component.literal("Saved profiles are kept."))));
        primary(contentX + contentW - 92, contentY + contentH - 24, 92, 22, "Done", b -> onClose());
        layout();
    }

    private void layout() {
        smooth.clamp(Math.max(0, profiles.size() * ROW - (listBottom - listTop)));
        scroll = smooth.get();
        for (int i = 0; i < profiles.size(); i++) {
            int y = listTop + i * ROW - scroll;
            for (int j = 0; j < 2; j++) {
                SlothButton b = actions.get(i * 2 + j);
                b.setX(contentX + contentW - (j == 0 ? 146 : 72));
                b.setY(y + 4);
                b.visible = y + ROW > listTop && y < listBottom;
            }
        }
    }

    @Override protected void renderContentBackground(GuiGraphics g, int mx, int my) {
        Ui.rounded(g, contentX, listTop, contentW, listBottom - listTop, 0x70201A27);
        Ui.roundedOutline(g, contentX, listTop, contentW, listBottom - listTop, Ui.LINE);
    }

    @Override protected void renderContent(GuiGraphics g, int mx, int my, float tick) {
        layout();
        boolean inList = Ui.inside(mx, my, contentX, listTop, contentW, listBottom - listTop);
        g.enableScissor(contentX + 2, listTop + 2, contentX + contentW - 2, listBottom - 2);
        for (int i = 0; i < profiles.size(); i++) {
            int y = listTop + i * ROW - scroll;
            if (y + ROW < listTop || y > listBottom) continue;
            String p = profiles.get(i);
            boolean active = p.equals(ModuleManager.activeProfile);
            Ui.panel(g, contentX + 6, y, contentW - 12, ROW - 6, Ui.PANEL);
            if (active) g.fill(contentX + 7, y + 5, contentX + 9, y + ROW - 11, Ui.ACCENT);
            g.drawString(font, Ui.ellipsize(font, p, contentW - 184), contentX + 16, y + 6, Ui.TEXT, false);
            g.drawString(font, active ? "Current setup" : "HUD + shortcuts + video", contentX + 16, y + 18, Ui.DIM, false);
            actions.get(i * 2).render(g, inList ? mx : -1, inList ? my : -1, tick);
            actions.get(i * 2 + 1).render(g, inList ? mx : -1, inList ? my : -1, tick);
        }
        g.disableScissor();
        Ui.scrollbar(g, contentX + contentW - 7, listTop, listBottom - listTop, scroll, Math.max(0, profiles.size() * ROW - (listBottom - listTop)));
        if (profiles.isEmpty()) Ui.centered(g, font, "Save your first setup above.", contentX + contentW / 2, listTop + 18, Ui.MUTED);
        g.drawString(font, Ui.ellipsize(font, message.isEmpty() ? "Saved setups include modules, HUD, video and shortcuts." : message, contentW), contentX, contentY + contentH - 39, Ui.MUTED, false);
    }

    @Override public boolean mouseClicked(MouseButtonEvent e, boolean twice) {
        boolean inList = Ui.inside(e.x(), e.y(), contentX, listTop, contentW, listBottom - listTop);
        for (int i = 0; i < actions.size(); i++) actions.get(i).active = inList && (i % 2 == 1 || !profiles.get(i / 2).equals(ModuleManager.activeProfile));
        boolean handled = super.mouseClicked(e, twice);
        for (int i = 0; i < actions.size(); i++) actions.get(i).active = i % 2 == 1 || !profiles.get(i / 2).equals(ModuleManager.activeProfile);
        return handled;
    }
    @Override public boolean mouseScrolled(double mx, double my, double dx, double dy) {
        if (!Ui.inside(mx, my, contentX, listTop, contentW, listBottom - listTop)) return super.mouseScrolled(mx, my, dx, dy);
        smooth.by(-dy * ROW, Math.max(0, profiles.size() * ROW - (listBottom - listTop)));
        return true;
    }
}
