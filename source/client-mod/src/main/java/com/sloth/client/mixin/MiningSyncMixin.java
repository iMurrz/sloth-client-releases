package com.sloth.client.mixin;

import com.sloth.client.module.impl.MiningSync;
import net.minecraft.client.multiplayer.MultiPlayerGameMode;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.state.BlockState;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.Redirect;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

@Mixin(MultiPlayerGameMode.class)
abstract class MiningSyncMixin {
    @Inject(method = "destroyBlock", at = @At("RETURN"))
    private void sloth$recordBrokenBlock(BlockPos pos, CallbackInfoReturnable<Boolean> result) {
        if (result.getReturnValueZ()) com.sloth.client.studio.GameplayTracker.blockBroken(pos);
    }
    @Redirect(method = "destroyBlock", at = @At(value = "INVOKE", target = "Lnet/minecraft/world/level/Level;setBlock(Lnet/minecraft/core/BlockPos;Lnet/minecraft/world/level/block/state/BlockState;I)Z"))
    private boolean sloth$waitForServer(Level level, BlockPos pos, BlockState state, int flags) {
        MiningSync sync = MiningSync.current();
        if (sync != null && sync.holdPrediction(pos)) return false;
        return level.setBlock(pos, state, flags);
    }
    @Inject(method = {"startDestroyBlock", "continueDestroyBlock"}, at = @At("HEAD"), cancellable = true)
    private void sloth$avoidRepeatedBreaks(BlockPos pos, Direction face, CallbackInfoReturnable<Boolean> result) {
        MiningSync sync = MiningSync.current();
        if (sync != null && sync.waiting(pos)) result.setReturnValue(false);
    }
}
