package com.sloth.client.mixin;

import com.sloth.client.module.ModuleManager;
import com.sloth.client.module.impl.CameraModules;
import com.sloth.client.module.impl.Tracking;
import com.llamalad7.mixinextras.injector.wrapoperation.Operation;
import com.llamalad7.mixinextras.injector.wrapoperation.WrapOperation;
import net.minecraft.client.MouseHandler;
import net.minecraft.client.input.MouseButtonInfo;
import net.minecraft.client.player.LocalPlayer;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Shadow;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

@Mixin(MouseHandler.class)
abstract class MouseHandlerMixin {
    @Shadow private double accumulatedDX;
    @Shadow private double accumulatedDY;

    /** Scroll adjusts the zoom level instead of switching hotbar slots while zooming. */
    @Inject(method = "onScroll", at = @At("HEAD"), cancellable = true)
    private void sloth$zoomScroll(long window, double xOffset, double yOffset, CallbackInfo ci) {
        if (ModuleManager.get(CameraModules.Zoom.class).onScroll(yOffset)) ci.cancel();
    }

    /** Lower mouse sensitivity in proportion to the zoom so aiming stays controllable. */
    @Inject(method = "turnPlayer", at = @At("HEAD"))
    private void sloth$zoomSensitivity(double movementTime, CallbackInfo ci) {
        float factor = ModuleManager.get(CameraModules.Zoom.class).factor();
        if (factor > 1f) {
            accumulatedDX /= factor;
            accumulatedDY /= factor;
        }
    }

    /** Freelook: mouse movement turns the camera, not the player. */
    @WrapOperation(method = "turnPlayer", at = @At(value = "INVOKE", target = "Lnet/minecraft/client/player/LocalPlayer;turn(DD)V"))
    private void sloth$freelook(LocalPlayer player, double dx, double dy, Operation<Void> original) {
        CameraModules.Freelook freelook = ModuleManager.get(CameraModules.Freelook.class);
        if (freelook.capturing()) freelook.turn(dx, dy);
        else original.call(player, dx, dy);
    }

    /** CPS counter. */
    @Inject(method = "onButton", at = @At("HEAD"))
    private void sloth$click(long window, MouseButtonInfo info, int action, CallbackInfo ci) {
        if (action == 1) Tracking.click(info.button());
    }

    @Inject(method="onButton",at=@At("TAIL"))
    private void sloth$releaseFreelook(long window,MouseButtonInfo info,int action,CallbackInfo ci) {
        if(action==0 && ModuleManager.get("freelook") instanceof CameraModules.Freelook free)free.releaseIfNeeded(net.minecraft.client.Minecraft.getInstance());
    }
}
