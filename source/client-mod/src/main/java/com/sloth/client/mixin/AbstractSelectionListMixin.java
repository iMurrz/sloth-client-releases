package com.sloth.client.mixin;

import com.sloth.client.screen.Ui;

import com.sloth.client.screen.SlothTheme;
import net.minecraft.client.gui.components.AbstractSelectionList;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.ModifyArg;

/** Sloth Menu Theme: the selected row in lists (worlds, servers, packs...) gets an ember outline instead of white. */
@Mixin(AbstractSelectionList.class)
abstract class AbstractSelectionListMixin {
    @ModifyArg(method = "renderSelection", at = @At(value = "INVOKE", target = "Lnet/minecraft/client/gui/GuiGraphics;fill(IIIII)V", ordinal = 0), index = 4)
    private int sloth$selectionBorder(int color) {
        return SlothTheme.on() ? (color == -1 ? Ui.warm(0xFFD36A3A) : 0xFF4A4452) : color;
    }

    @ModifyArg(method = "renderSelection", at = @At(value = "INVOKE", target = "Lnet/minecraft/client/gui/GuiGraphics;fill(IIIII)V", ordinal = 1), index = 4)
    private int sloth$selectionFill(int color) {
        return SlothTheme.on() ? 0xF01C1618 : color;
    }
}
