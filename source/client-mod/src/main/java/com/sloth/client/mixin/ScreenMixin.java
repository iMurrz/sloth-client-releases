package com.sloth.client.mixin;

import com.sloth.client.screen.SlothScreen;
import com.sloth.client.screen.SlothTheme;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.gui.screens.TitleScreen;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Shadow;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** Sloth Menu Theme: menus outside a world show the Sloth artwork (blurred by the game) instead of the panorama. */
@Mixin(Screen.class)
abstract class ScreenMixin {
    @Shadow public int width;
    @Shadow public int height;

    @Inject(method = "renderPanorama", at = @At("HEAD"), cancellable = true)
    private void sloth$backdrop(GuiGraphics g, float partialTick, CallbackInfo ci) {
        if (!SlothTheme.backgrounds()) return;
        SlothScreen.drawBackdrop(g, width, height);
        ci.cancel();
    }
}
