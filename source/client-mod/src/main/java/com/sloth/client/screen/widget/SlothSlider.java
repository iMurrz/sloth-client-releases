package com.sloth.client.screen.widget;

import com.sloth.client.screen.SlothTheme;
import com.sloth.client.screen.Ui;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.Font;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.AbstractSliderButton;
import net.minecraft.network.chat.Component;

/** Slider drawn in the Sloth style: dark track, ember fill, bright handle. */
public abstract class SlothSlider extends AbstractSliderButton {
    private float visualValue=-1;
    private long lastFrame=System.nanoTime();
    protected SlothSlider(int x, int y, int w, int h, double value) {
        super(x, y, w, h, Component.empty(), value);
    }

    @Override
    public void renderWidget(GuiGraphics g, int mouseX, int mouseY, float partialTick) {
        Font font = com.sloth.client.screen.MenuFont.get();
        int x = getX(), y = getY(), w = getWidth(), h = getHeight();
        boolean hot = isHoveredOrFocused();
        SlothTheme.sliderBox(g, x, y, w, h, 255, hot);
        long now=System.nanoTime();
        visualValue=visualValue<0||!SlothTheme.animated()?(float)value:SlothTheme.ease(visualValue,(float)value,now-lastFrame,24f);lastFrame=now;
        int handle = x + 2 + Math.round((w - 5) * visualValue);
        SlothTheme.sliderValue(g, x, y, w, h, handle, 255, hot);
        if(active&&isFocused())g.renderOutline(x,y,w,h,Ui.ACCENT_SOFT);
        String label = Ui.ellipsize(font,getMessage().getString(),w-10);
        g.drawString(font, label, x + (w - font.width(label)) / 2, y + (h - 9) / 2, Ui.TEXT, false);
    }
}
