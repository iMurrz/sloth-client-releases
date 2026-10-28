package com.sloth.client.mixin;

import com.sloth.client.module.ModuleManager;
import com.sloth.client.module.impl.UtilityModules;
import net.minecraft.client.GuiMessage;
import net.minecraft.client.gui.Font;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.ChatComponent;
import net.minecraft.network.chat.Component;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.ModifyVariable;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

@Mixin(ChatComponent.class)
abstract class ChatComponentMixin {
    @ModifyVariable(method = "addMessage(Lnet/minecraft/network/chat/Component;Lnet/minecraft/network/chat/MessageSignature;Lnet/minecraft/client/GuiMessageTag;)V", at = @At("HEAD"), argsOnly = true)
    private Component sloth$timestamp(Component message) {
        UtilityModules.ChatTimestamps module = ModuleManager.get(UtilityModules.ChatTimestamps.class);
        return module.isActive() ? module.stamp(message) : message;
    }

    /** Smooth Chat: count each wrapped line as it joins the visible chat. */
    @Inject(method = "addMessageToDisplayQueue", at = @At(value = "INVOKE", target = "Ljava/util/List;addFirst(Ljava/lang/Object;)V"))
    private void sloth$lineAdded(GuiMessage message, CallbackInfo ci) {
        ModuleManager.get(UtilityModules.SmoothChat.class).lineAdded();
    }

    /** Smooth Chat: draw the chat a little lower while new lines glide up (inside the chat's own push/pop). */
    @Inject(method = "render(Lnet/minecraft/client/gui/GuiGraphics;Lnet/minecraft/client/gui/Font;IIIZZ)V",
        at = @At("HEAD"), cancellable = true)
    private void sloth$streamerChat(GuiGraphics g, Font font, int tick, int mouseX, int mouseY, boolean focused, boolean hovered, CallbackInfo ci) {
        if (com.sloth.client.module.impl.ReferenceFeatures.Streamer.hideChat()) ci.cancel();
    }

    @Inject(method = "render(Lnet/minecraft/client/gui/GuiGraphics;Lnet/minecraft/client/gui/Font;IIIZZ)V",
        at = @At(value = "INVOKE", target = "Lorg/joml/Matrix3x2fStack;pushMatrix()Lorg/joml/Matrix3x2fStack;", shift = At.Shift.AFTER))
    private void sloth$smoothChat(GuiGraphics g, Font font, int tick, int mouseX, int mouseY, boolean focused, boolean hovered, CallbackInfo ci) {
        float offset = ModuleManager.get(UtilityModules.SmoothChat.class).offset();
        if (offset > 0f) g.pose().translate(0f, offset);
    }
}
