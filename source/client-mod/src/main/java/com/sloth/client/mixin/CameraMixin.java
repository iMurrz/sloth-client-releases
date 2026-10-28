package com.sloth.client.mixin;

import com.sloth.client.module.ModuleManager;
import com.sloth.client.module.impl.CameraModules;
import com.llamalad7.mixinextras.injector.wrapoperation.Operation;
import com.llamalad7.mixinextras.injector.wrapoperation.WrapOperation;
import net.minecraft.client.Camera;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;

@Mixin(Camera.class)
abstract class CameraMixin {
    /** Freelook: aim the camera with the freelook angles while the player's own rotation stays put. */
    @WrapOperation(method = "setup", at = @At(value = "INVOKE", target = "Lnet/minecraft/client/Camera;setRotation(FF)V"))
    private void sloth$freelook(Camera camera, float yRot, float xRot, Operation<Void> original) {
        CameraModules.Freelook freelook = ModuleManager.get(CameraModules.Freelook.class);
        if (freelook.looking()) original.call(camera, freelook.yaw(), freelook.pitch());
        else original.call(camera, yRot, xRot);
    }
}
