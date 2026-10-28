package com.sloth.client.mixin;

import com.sloth.client.module.impl.MiningSync;
import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.core.BlockPos;
import net.minecraft.world.level.block.state.BlockState;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

@Mixin(ClientLevel.class)
abstract class MiningUpdateMixin {
    @Inject(method = "setServerVerifiedBlockState", at = @At("RETURN"))
    private void sloth$receivedState(BlockPos pos, BlockState state, int flags, CallbackInfo info) {
        MiningSync sync = MiningSync.current();
        if (sync != null) sync.serverUpdate((ClientLevel) (Object) this, pos);
    }
}
