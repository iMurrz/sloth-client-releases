package com.sloth.client.screen.widget;

import com.sloth.client.screen.SlothTheme;
import com.sloth.client.screen.Ui;
import net.minecraft.ChatFormatting;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.Font;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.AbstractButton;
import net.minecraft.client.gui.narration.NarrationElementOutput;
import net.minecraft.client.input.InputWithModifiers;
import net.minecraft.network.chat.Component;

import java.util.function.Consumer;

/** Flat button in the Sloth Launcher style (instead of Minecraft's stone buttons), with eased hover. */
public class SlothButton extends AbstractButton {
    public enum Style { PRIMARY, NORMAL, DANGER, CHIP, TOGGLE, PIXEL }

    private final Consumer<SlothButton> action;
    private final Style style;
    public boolean selected;
    /** CHIP style: draw the accent underline when selected (menu tabs draw one shared, sliding line instead). */
    public boolean selectionLine = true;
    /** TOGGLE style: the switch position. */
    public boolean on;
    private float hover, knob = -1f;
    private long lastFrame = System.nanoTime();

    public SlothButton(int x, int y, int w, int h, Component message, Style style, Consumer<SlothButton> action) {
        super(x, y, w, h, message);
        this.style = style;
        this.action = action;
    }

    /** A sliding ON/OFF switch; {@code action} flips the setting and returns its new state. */
    public static SlothButton toggle(boolean on, java.util.function.BooleanSupplier action) {
        SlothButton b = new SlothButton(0, 0, 100, 18, Component.literal(on ? "On" : "Off"), Style.TOGGLE, btn -> {
            btn.on = action.getAsBoolean();
            btn.setMessage(Component.literal(btn.on ? "On" : "Off"));
        });
        b.on = on;
        return b;
    }

    @Override
    public void onPress(InputWithModifiers input) { action.accept(this); }

    @Override
    protected void renderContents(GuiGraphics g, int mouseX, int mouseY, float partialTick) {
        Font font = com.sloth.client.screen.MenuFont.get();
        int x = getX(), y = getY(), w = getWidth(), h = getHeight();
        long now = System.nanoTime(), elapsed = now - lastFrame;
        lastFrame = now;
        boolean hot = active && isHoveredOrFocused();
        hover = SlothTheme.animated() ? SlothTheme.ease(hover, hot ? 1f : 0f, elapsed, 16f) : hot ? 1f : 0f;
        float t = hover;
        int text;
        switch (style) {
            case PRIMARY -> {
                int fill = SlothTheme.lerp(Ui.ACCENT, Ui.ACCENT_SOFT, t);
                Ui.rounded(g, x, y, w, h, fill);
                text = 0xFF171019;
            }
            case CHIP -> {
                int selectedFill = SlothTheme.lerp(Ui.warm(0xFF492738), Ui.warm(0xFF63334B), t);
                Ui.rounded(g, x, y, w, h, selected ? selectedFill : SlothTheme.lerp(Ui.PANEL, Ui.PANEL_HOVER, t));
                if (selected && selectionLine) g.fill(x + 3, y + h - 1, x + w - 3, y + h, Ui.ACCENT);
                if (selected) Ui.roundedOutline(g, x, y, w, h, Ui.ACCENT);
                else if (t > 0.01f) {
                    int line = Math.round(w * t);
                    g.fill(x + (w - line) / 2, y + h - 1, x + (w + line) / 2, y + h, 0x99F7A8C9);
                }
                text = selected || t > 0.5f ? Ui.TEXT : Ui.MUTED;
            }
            case PIXEL -> {
                // Cream, bevelled, Minecraft-style button used on the title screen.
                g.fill(x, y, x + w, y + h, 0xFF4A2336);
                g.fill(x + 1, y + 1, x + w - 1, y + h - 1, SlothTheme.lerp(0xFFFBE3EA, 0xFFFFF4F8, t));
                g.fill(x + 1, y + 1, x + w - 1, y + 2, 0xFFFFFFFF);
                g.fill(x + 1, y + h - 3, x + w - 1, y + h - 1, 0xFFE2A9BE);
                if (t > 0.01f) g.renderOutline(x, y, w, h, SlothTheme.lerp(0xFF4A2336, 0xFFFF2E97, t));
                text = 0xFF4A2336;
            }
            case TOGGLE -> {
                knob = knob < 0 || !SlothTheme.animated() ? (on ? 1f : 0f) : SlothTheme.ease(knob, on ? 1f : 0f, elapsed, 20f);
                int py = y + (h - 12) / 2;
                int pill = SlothTheme.lerp(SlothTheme.lerp(0xFF424450, 0xFF555763, t), SlothTheme.lerp(Ui.ACCENT, Ui.ACCENT_SOFT, t), knob);
                Ui.rounded(g, x, py, 38, 12, active ? pill : 0xFF3A3A40);
                int kx = x + 2 + Math.round(25 * knob);
                Ui.rounded(g, kx, py + 2, 9, 8, 0xFFF4F1F4);
                if (w >= 62) g.drawString(font, on ? "On" : "Off", x + 43, y + (h - 8) / 2, Ui.MUTED, false);
                if(active&&isFocused()) Ui.roundedOutline(g,x,py,38,12,Ui.ACCENT_SOFT);
                return;
            }
            default -> {
                SlothTheme.button(g, x, y, w, h, 255, t);
                text = style == Style.DANGER ? 0xFFF19A86 : Ui.TEXT;
            }
        }
        if (!active) { g.fill(x, y, x + w, y + h, 0x80101014); text = Ui.DIM; }
        if(active&&isFocused()) Ui.roundedOutline(g,x,y,w,h,Ui.ACCENT_SOFT);
        String label = Ui.ellipsize(font, getMessage().getString(), w - 6);
        g.drawString(font, label, x + (w - font.width(label)) / 2, y + (h - 8) / 2, text, false);
    }

    @Override
    protected void updateWidgetNarration(NarrationElementOutput output) { defaultButtonNarrationText(output); }

    static int lerp(int a, int b, float t) {
        int ar = a >> 16 & 255, ag = a >> 8 & 255, ab = a & 255, br = b >> 16 & 255, bg = b >> 8 & 255, bb = b & 255;
        return 0xFF000000 | Math.round(ar + (br - ar) * t) << 16 | Math.round(ag + (bg - ag) * t) << 8 | Math.round(ab + (bb - ab) * t);
    }
}
