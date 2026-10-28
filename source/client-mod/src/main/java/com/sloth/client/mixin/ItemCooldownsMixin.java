package com.sloth.client.mixin;

import com.sloth.client.module.impl.WorldHud;
import net.minecraft.resources.Identifier;
import net.minecraft.world.item.ItemCooldowns;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

@Mixin(ItemCooldowns.class)
abstract class ItemCooldownsMixin {
    /** Record each cooldown's real length so the Cooldowns HUD can show exact seconds left. */
    @Inject(method = "addCooldown(Lnet/minecraft/resources/Identifier;I)V", at = @At("HEAD"))
    private void sloth$record(Identifier group, int ticks, CallbackInfo ci) {
        WorldHud.cooldownStarted(group, ticks);
    }
}
