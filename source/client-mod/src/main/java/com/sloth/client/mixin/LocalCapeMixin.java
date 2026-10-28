package com.sloth.client.mixin;

import com.sloth.client.LocalCapes;
import net.minecraft.client.player.AbstractClientPlayer;
import net.minecraft.world.entity.player.PlayerSkin;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;
import java.util.Optional;

@Mixin(AbstractClientPlayer.class)
public abstract class LocalCapeMixin {
    @Inject(method = "getSkin", at = @At("RETURN"), cancellable = true)
    private void sloth$localCape(CallbackInfoReturnable<PlayerSkin> result) {
        var cape = LocalCapes.texture(((AbstractClientPlayer) (Object) this).getUUID());
        if (cape != null) result.setReturnValue(result.getReturnValue().with(new PlayerSkin.Patch(
            Optional.empty(), Optional.of(cape), Optional.empty(), Optional.empty())));
    }
}
