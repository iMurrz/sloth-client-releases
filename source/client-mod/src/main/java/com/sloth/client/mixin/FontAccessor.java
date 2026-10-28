package com.sloth.client.mixin;

import net.minecraft.client.gui.Font;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.gen.Accessor;

/** Reuses Minecraft's reload-aware font provider without replacing the gameplay font. */
@Mixin(Font.class)
public interface FontAccessor {
    @Accessor("provider") Font.Provider sloth$provider();
}
