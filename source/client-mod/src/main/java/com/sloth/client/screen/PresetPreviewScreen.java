package com.sloth.client.screen;

import com.sloth.client.module.ModuleManager;
import com.sloth.client.studio.*;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.Component;
import java.util.*;

public final class PresetPreviewScreen extends SlothScreen {
    private final Screen parent;
    private final String preset;
    private int x, y, w, h;
    public PresetPreviewScreen(Screen parent, String preset) { super(Component.literal("Preview " + preset)); this.parent = parent; this.preset = preset; }
    @Override protected void init() {
        w = Math.min(480, width - 24); h = Math.min(330, height - 20); x = (width - w) / 2; y = (height - h) / 2;
        primary(x + 14, y + h - 30, 140, 20, "Review changes", b -> { minecraft.setScreen(new SetupReviewScreen(this,preset+" starter setup",Studio.previewPreset(preset))); });
        button(x + w - 104, y + h - 30, 90, 20, "Back", b -> onClose());
    }
    @Override public void renderBackground(GuiGraphics g, int mx, int my, float t) { super.renderBackground(g,mx,my,t); Ui.panel(g,x,y,w,h,Ui.BG); }
    @Override public void render(GuiGraphics g, int mx, int my, float t) {
        super.render(g,mx,my,t);
        g.drawString(font, preset + " starter setup", x + 14, y + 14, Ui.TEXT, false);
        g.drawWordWrap(font, Component.literal("Replaces HUD selection and positions. Other modules stay as configured. History can restore your previous setup."), x + 14, y + 32, w - 28, Ui.MUTED);
        int px=x+14, py=y+76, pw=w-28, ph=h-120; Ui.panel(g,px,py,pw,ph,Ui.PANEL);
        Ui.centered(g,font,"LAYOUT PREVIEW",x+w/2,py+5,Ui.DIM);
        int left=0,right=0;
        for (String id : Studio.PRESETS.get(preset)) {
            var m = ModuleManager.get(id); if (m == null) continue;
            boolean compact=Set.of("fps","ping","cps","clock","day_counter").contains(id);
            int bx=compact?px+8:px+pw/2+4, by=py+22+(compact?left++:right++)*Math.max(20,(ph-40)/4);
            int bw=pw/2-16; Ui.panel(g,bx,by,bw,18,Ui.BG);
            g.drawString(font,Ui.ellipsize(font,m.name,bw-8),bx+4,by+5,Ui.ACCENT_SOFT,false);
        }
    }
    @Override public void onClose() { minecraft.setScreen(parent); }
}
