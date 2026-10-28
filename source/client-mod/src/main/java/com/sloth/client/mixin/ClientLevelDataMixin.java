package com.sloth.client.mixin;

import com.sloth.client.module.ModuleManager;
import com.sloth.client.module.impl.VisualModules;
import net.minecraft.client.multiplayer.ClientLevel;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

@Mixin(ClientLevel.ClientLevelData.class)
abstract class ClientLevelDataMixin {
    /** Time Changer: the time of day you see (client only). */
    @Inject(method = "getDayTime", at = @At("HEAD"), cancellable = true)
    private void sloth$time(CallbackInfoReturnable<Long> cir) {
        VisualModules.TimeChanger module = ModuleManager.get(VisualModules.TimeChanger.class);
        if (module.isActive()) cir.setReturnValue(module.dayTime());
    }
}
