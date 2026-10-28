package com.sloth.client.mixin;
import com.sloth.client.module.ModuleManager;
import com.sloth.client.module.impl.BetterSounds;
import net.minecraft.client.sounds.SoundEngine;
import net.minecraft.client.resources.sounds.SoundInstance;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;
@Mixin(SoundEngine.class)
abstract class BetterSoundsMixin {
    @Inject(method = "calculateVolume(Lnet/minecraft/client/resources/sounds/SoundInstance;)F", at = @At("RETURN"), cancellable = true)
    private void sloth$volume(SoundInstance sound, CallbackInfoReturnable<Float> result) {
        var module = ModuleManager.get("better_sounds");
        if (module instanceof BetterSounds balance) result.setReturnValue(balance.volume(sound, result.getReturnValue()));
    }
}
