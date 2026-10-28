package com.sloth.client.screen;

import com.sloth.client.screen.widget.SlothButton;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.renderer.RenderPipelines;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.Identifier;

import java.util.function.Consumer;

/** Base for Sloth screens: launcher-style backdrop and buttons. */
public abstract class SlothScreen extends Screen {
    private static final Identifier WORKSPACE_BACKGROUND = Identifier.fromNamespaceAndPath("sloth-client", "textures/gui/pink-workspace-background.png");

    protected SlothScreen(Component title) { super(net.minecraft.client.Minecraft.getInstance(), MenuFont.get(), title); }

    /** Over the world: blurred game with a dark tint. From the menus: the Sloth backdrop. */
    @Override
    public void renderBackground(GuiGraphics g, int mouseX, int mouseY, float partialTick) {
        if (minecraft.level != null) {
            renderBlurredBackground(g);
            g.fill(0, 0, width, height, 0x500C0B10);
        } else {
            g.blit(RenderPipelines.GUI_TEXTURED, WORKSPACE_BACKGROUND, 0, 0, 0, 0, width, height, 1672, 941, 1672, 941);
            g.fill(0,0,width,height,0x52100816);
        }
    }

    /** Neutral client backdrop, with no server artwork. */
    public static void drawBackdrop(GuiGraphics g, int width, int height) {
        g.fillGradient(0, 0, width, height, 0xFF100C15, 0xFF271426);
    }

    protected SlothButton button(int x, int y, int w, int h, String label, Consumer<SlothButton> action) {
        return addRenderableWidget(new SlothButton(x, y, w, h, Component.literal(label), SlothButton.Style.NORMAL, action));
    }

    protected SlothButton primary(int x, int y, int w, int h, String label, Consumer<SlothButton> action) {
        return addRenderableWidget(new SlothButton(x, y, w, h, Component.literal(label), SlothButton.Style.PRIMARY, action));
    }

    protected SlothButton pixel(int x, int y, int w, int h, String label, Consumer<SlothButton> action) {
        return addRenderableWidget(new SlothButton(x, y, w, h, Component.literal(label), SlothButton.Style.PIXEL, action));
    }

    protected SlothButton chip(int x, int y, int w, int h, String label, Consumer<SlothButton> action) {
        return addRenderableWidget(new SlothButton(x, y, w, h, Component.literal(label), SlothButton.Style.CHIP, action));
    }

    protected void heading(GuiGraphics g, String eyebrow, String title, int centerX, int y) {
        Ui.centered(g, font, eyebrow, centerX, y, Ui.ACCENT_SOFT);
        g.pose().pushMatrix();
        g.pose().translate(centerX, y + 12);
        g.pose().scale(1.5f, 1.5f);
        Ui.centered(g, font, title, 0, 0, Ui.TEXT);
        g.pose().popMatrix();
    }

    @Override
    public boolean isPauseScreen() { return false; }
}
