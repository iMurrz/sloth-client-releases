package com.sloth.client.mixin;

import com.sloth.client.screen.SlothTitleScreen;
import net.minecraft.SharedConstants;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.gui.screens.TitleScreen;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.ModifyVariable;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

@Mixin(Minecraft.class)
abstract class MinecraftMixin {
    @Inject(method = "runTick", at = @At("HEAD"))
    private void sloth$frame(boolean render, CallbackInfo ci) {
        if (render) com.sloth.client.studio.FrameStats.frame();
    }
    @Inject(method = "createTitle", at = @At("RETURN"), cancellable = true)
    private void sloth$title(CallbackInfoReturnable<String> cir) {
        cir.setReturnValue("Sloth Client " + SharedConstants.getCurrentVersion().name());
    }

    /** The Sloth title screen is core appearance, including after disconnecting or reloading. */
    @ModifyVariable(method = "setScreen", at = @At("HEAD"), argsOnly = true)
    private Screen sloth$mainMenu(Screen screen) {
        if (!(screen instanceof TitleScreen)) return screen;
        return new SlothTitleScreen();
    }
}
