package com.sloth.client.module.impl;

import com.sloth.client.module.Module;
import com.sloth.client.module.Setting;
import net.minecraft.client.resources.sounds.SoundInstance;
import net.minecraft.sounds.SoundSource;

/** Sound balancing, using the user's vanilla/resource-pack sound assets. */
public final class BetterSounds extends Module {
    private final Setting.Number mining = add(new Setting.Number("mining", "Block break volume", 80, 0, 150, 5, "%"));
    private final Setting.Number steps = add(new Setting.Number("steps", "Footstep volume", 80, 0, 150, 5, "%"));
    private final Setting.Number weather = add(new Setting.Number("weather", "Weather volume", 50, 0, 150, 5, "%"));
    private final Setting.Number ambient = add(new Setting.Number("ambient", "Ambient volume", 70, 0, 150, 5, "%"));
    public BetterSounds() { super("better_sounds", "Better Sounds", "Balance mining, footsteps, weather and ambient volume. Uses your current sound pack.", Category.UTILITY, false); }
    public float volume(SoundInstance sound, float original) {
        if (!isActive() || !sound.getIdentifier().getNamespace().equals("minecraft")) return original;
        String id = sound.getIdentifier().getPath();
        double factor = sound.getSource() == SoundSource.WEATHER ? weather.get() : sound.getSource() == SoundSource.AMBIENT ? ambient.get() : id.startsWith("block.") && id.endsWith(".break") ? mining.get() : id.endsWith(".step") ? steps.get() : 100;
        return Math.max(0, Math.min(1, original * (float) factor / 100f));
    }
}
