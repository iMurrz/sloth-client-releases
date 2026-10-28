package com.sloth.client.mixin;

import com.sloth.client.screen.SlothTheme;
import com.mojang.blaze3d.pipeline.RenderPipeline;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.resources.Identifier;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** Sloth Menu Theme: vanilla widget sprites and menu textures are drawn in the Sloth style instead. */
@Mixin(GuiGraphics.class)
abstract class GuiGraphicsMixin {
    @Inject(method = "blitSprite(Lcom/mojang/blaze3d/pipeline/RenderPipeline;Lnet/minecraft/resources/Identifier;IIIII)V", at = @At("HEAD"), cancellable = true)
    private void sloth$themeSprite(RenderPipeline pipeline, Identifier sprite, int x, int y, int w, int h, int color, CallbackInfo ci) {
        if (SlothTheme.sprite((GuiGraphics) (Object) this, sprite, x, y, w, h, color)) ci.cancel();
    }

    @Inject(method = "blit(Lcom/mojang/blaze3d/pipeline/RenderPipeline;Lnet/minecraft/resources/Identifier;IIFFIIIIIII)V", at = @At("HEAD"), cancellable = true)
    private void sloth$themeTexture(RenderPipeline pipeline, Identifier texture, int x, int y, float u, float v, int w, int h, int uw, int vh, int texW, int texH, int color, CallbackInfo ci) {
        if (SlothTheme.texture((GuiGraphics) (Object) this, texture, x, y, w, h)) ci.cancel();
    }
}
