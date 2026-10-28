package com.sloth.client.mixin;

import com.sloth.client.module.ModuleManager;
import com.sloth.client.module.impl.CameraModules;
import net.minecraft.client.Camera;
import net.minecraft.client.renderer.GameRenderer;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

@Mixin(GameRenderer.class)
abstract class GameRendererMixin {
    @Inject(method = "getFov", at = @At("RETURN"), cancellable = true)
    private void sloth$zoom(Camera camera, float partialTick, boolean useFovSetting, CallbackInfoReturnable<Float> cir) {
        // Only the world view zooms; the held-item pass (useFovSetting = false) keeps its normal FOV.
        if (!useFovSetting) return;
        float factor = ModuleManager.get(CameraModules.Zoom.class).update();
        if (factor != 1f) cir.setReturnValue(cir.getReturnValue() / factor);
    }
}
