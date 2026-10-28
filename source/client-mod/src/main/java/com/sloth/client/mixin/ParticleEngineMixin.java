package com.sloth.client.mixin;

import com.sloth.client.module.ModuleManager;
import com.sloth.client.module.impl.VisualModules;
import net.minecraft.client.particle.Particle;
import net.minecraft.client.particle.ParticleEngine;
import net.minecraft.client.particle.TerrainParticle;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

@Mixin(ParticleEngine.class)
abstract class ParticleEngineMixin {
    /** Particle Changer: drop block-breaking dust and thin out the rest. */
    @Inject(method = "add", at = @At("HEAD"), cancellable = true)
    private void sloth$particles(Particle particle, CallbackInfo ci) {
        VisualModules.Particles module = ModuleManager.get(VisualModules.Particles.class);
        if (!module.isActive()) return;
        if ((particle instanceof TerrainParticle && !module.blockBreaking.on()) || !module.keep()) ci.cancel();
    }
}
