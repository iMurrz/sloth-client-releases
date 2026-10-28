package com.sloth.client.mixin;

import com.sloth.client.studio.PhotoMode;
import net.minecraft.client.Minecraft;
import net.minecraft.client.DeltaTracker;
import net.minecraft.client.gui.Gui;
import net.minecraft.client.gui.GuiGraphics;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** Guides remain visible when the normal GUI is hidden; they are intentionally captured by F2. */
@Mixin(Gui.class)
abstract class PhotoGuidesMixin {
    @Inject(method = "render", at = @At("RETURN"))
    private void sloth$guides(GuiGraphics g, DeltaTracker delta, CallbackInfo ci) {
        if (!PhotoMode.active || !PhotoMode.guides || Minecraft.getInstance().screen != null) return;
        int w = g.guiWidth(), h = g.guiHeight();
        for (int i = 1; i <= 2; i++) {
            g.fill(w * i / 3, 0, w * i / 3 + 1, h, 0x88FFFFFF);
            g.fill(0, h * i / 3, w, h * i / 3 + 1, 0x88FFFFFF);
        }
    }
}
