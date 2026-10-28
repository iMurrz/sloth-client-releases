package com.sloth.client.mixin;

import com.sloth.client.module.ModuleManager;
import com.sloth.client.module.impl.CameraModules;
import net.minecraft.client.KeyboardHandler;
import net.minecraft.client.Minecraft;
import net.minecraft.client.input.KeyEvent;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

@Mixin(KeyboardHandler.class)
abstract class KeyboardHandlerMixin {
    @Inject(method="keyPress",at=@At("TAIL"))
    private void sloth$releaseFreelook(long window,int action,KeyEvent event,CallbackInfo ci) {
        if(action==0 && ModuleManager.get("freelook") instanceof CameraModules.Freelook free)free.releaseIfNeeded(Minecraft.getInstance());
    }
}
