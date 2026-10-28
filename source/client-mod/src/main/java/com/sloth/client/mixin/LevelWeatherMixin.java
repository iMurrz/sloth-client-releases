package com.sloth.client.mixin;

import com.sloth.client.module.ModuleManager;
import com.sloth.client.module.impl.VisualModules;
import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.world.level.Level;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

@Mixin(Level.class)
abstract class LevelWeatherMixin {
    /** Weather Changer: only the client's own level is affected, never an integrated server's. */
    @Inject(method = "getRainLevel", at = @At("HEAD"), cancellable = true)
    private void sloth$rain(float partialTick, CallbackInfoReturnable<Float> cir) {
        if (!((Object) this instanceof ClientLevel)) return;
        VisualModules.Weather module = ModuleManager.get(VisualModules.Weather.class);
        if (module.isActive()) cir.setReturnValue(module.rain());
    }

    @Inject(method = "getThunderLevel", at = @At("HEAD"), cancellable = true)
    private void sloth$thunder(float partialTick, CallbackInfoReturnable<Float> cir) {
        if (!((Object) this instanceof ClientLevel)) return;
        VisualModules.Weather module = ModuleManager.get(VisualModules.Weather.class);
        if (module.isActive()) cir.setReturnValue(module.thunder());
    }
}
