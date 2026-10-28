package com.sloth.client.mixin;

import com.sloth.client.module.ModuleManager;
import com.sloth.client.module.impl.VisualModules;
import com.llamalad7.mixinextras.injector.ModifyExpressionValue;
import net.minecraft.client.renderer.LightTexture;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;

@Mixin(LightTexture.class)
abstract class FullbrightMixin {
    /** The third OptionInstance#get in updateLightTexture reads the gamma option. */
    @ModifyExpressionValue(method = "updateLightTexture", at = @At(value = "INVOKE", target = "Lnet/minecraft/client/OptionInstance;get()Ljava/lang/Object;", ordinal = 2))
    private Object sloth$gamma(Object original) {
        VisualModules.Fullbright module = ModuleManager.get(VisualModules.Fullbright.class);
        return module.isActive() ? (Object) module.brightness.get() : original;
    }
}
