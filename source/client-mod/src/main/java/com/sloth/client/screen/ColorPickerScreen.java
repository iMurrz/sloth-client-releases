package com.sloth.client.screen;

import com.sloth.client.module.ModuleManager;
import com.sloth.client.module.Setting;
import com.sloth.client.screen.widget.SlothButton;
import com.sloth.client.screen.widget.SlothSlider;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.EditBox;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.Component;

/** RGBA sliders, a hex box, swatches and a chroma toggle for one colour setting. */
public final class ColorPickerScreen extends SlothScreen {
    private static final int[] SWATCHES = {0xFFFFFFFF, Ui.warm(0xFFFF6A2A), Ui.warm(0xFFFFA36E), Ui.warm(0xFFFFD176), 0xFF59D595, 0xFF55FFFF, 0xFF5A8CFF, 0xFFD58CFF, Ui.warm(0xFFFF5A4A), 0xFF101014};
    private final Screen parent;
    private final Setting.Colour setting;
    private EditBox hex;
    private int left, top, panelW, channelW;

    public ColorPickerScreen(Screen parent, Setting.Colour setting) {
        super(Component.literal(setting.name));
        this.parent = parent;
        this.setting = setting;
    }

    @Override
    protected void init() {
        panelW = Math.min(360, width - 24);
        left = (width - panelW) / 2;
        top = Math.max(8, (height - 218) / 2);
        channelW = panelW - 84;
        int x = left + 14, y = top + 48;
        String[] names = {"Red", "Green", "Blue", "Opacity"};
        int[] shifts = {16, 8, 0, 24};
        for (int i = 0; i < 4; i++) addRenderableWidget(new Channel(x, y + i * 22, names[i], shifts[i]));
        for (int i = 0; i < SWATCHES.length; i++) {
            int colour = SWATCHES[i];
            addRenderableWidget(new SlothButton(x + i * 18, y + 90, 16, 12, Component.empty(), SlothButton.Style.CHIP, b -> {
                setting.set(colour);
                hex.setValue(String.format("#%08X", colour));
                syncSliders();
            }));
        }
        hex = new EditBox(font, x, y + 108, 106, 18, Component.literal("Hex"));
        hex.setMaxLength(9);
        hex.setValue(String.format("#%08X", setting.get()));
        hex.setResponder(v -> {
            String digits = v.replace("#", "");
            if (v.matches("#?[0-9A-Fa-f]{6}|#?[0-9A-Fa-f]{8}")) {
                setting.set((int) Long.parseLong(digits.length() == 6 ? "FF" + digits : digits, 16)); syncSliders();
            }
        });
        addRenderableWidget(hex);
        button(x + 112, y + 108, 108, 18, chromaLabel(), b -> { setting.chroma = !setting.chroma; b.setMessage(Component.literal(chromaLabel())); });
        primary(x, y + 142, panelW - 28, 22, "Save color", b -> onClose());
    }

    private void syncSliders() {
        for (var child : children()) if (child instanceof Channel c) c.sync();
    }

    private String chromaLabel() { return "Chroma: " + (setting.chroma ? "On" : "Off"); }

    @Override
    public void renderBackground(GuiGraphics g, int mouseX, int mouseY, float partialTick) {
        super.renderBackground(g, mouseX, mouseY, partialTick);
        Ui.panel(g, left, top, panelW, 218, Ui.BG);
    }

    @Override
    public void render(GuiGraphics g, int mouseX, int mouseY, float partialTick) {
        super.render(g, mouseX, mouseY, partialTick);
        g.drawString(font, Ui.ellipsize(font, setting.name, panelW - 28), left + 14, top + 12, Ui.TEXT, false);
        g.drawString(font, "RGB / AARRGGBB hex · live preview", left + 14, top + 28, Ui.MUTED, false);
        int x = left + 14, y = top + 48;
        for (int i = 0; i < SWATCHES.length; i++) g.fill(x + i * 18 + 3, y + 93, x + i * 18 + 13, y + 99, SWATCHES[i]);
        int px = left + panelW - 58;
        for (int cy = 0; cy < 84; cy += 6) for (int cx = 0; cx < 44; cx += 6) g.fill(px + cx, y + cy, px + cx + 6, y + cy + 6, ((cx + cy) / 6) % 2 == 0 ? 0xFF3A3A3A : 0xFF222222);
        g.fill(px, y, px + 44, y + 84, setting.argb());
        g.renderOutline(px, y, 44, 84, Ui.LINE);
    }

    @Override
    public void onClose() {
        ModuleManager.save();
        minecraft.setScreen(parent);
    }

    private final class Channel extends SlothSlider {
        private final String name;
        private final int shift;
        Channel(int x, int y, String name, int shift) {
            super(x, y, channelW, 18, ((setting.get() >>> shift) & 0xFF) / 255.0);
            this.name = name;
            this.shift = shift;
            updateMessage();
        }
        void sync() { value = ((setting.get() >>> shift) & 0xFF) / 255.0; updateMessage(); }
        private int channel() { return (int) Math.round(value * 255); }
        @Override protected void updateMessage() { setMessage(Component.literal(name + "  " + channel())); }
        @Override protected void applyValue() {
            int argb = setting.get() & ~(0xFF << shift) | (channel() << shift);
            setting.set(argb);
            if (hex != null && !hex.isFocused()) hex.setValue(String.format("#%08X", argb));
        }
    }
}
