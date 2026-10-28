package com.sloth.client.module;

import net.minecraft.client.Minecraft;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/** A feature players can switch on/off and configure in the Sloth mod menu. */
public abstract class Module {
    public enum Category {
        HUD("HUD"), VISUAL("Visual"), UTILITY("Utility");
        public final String label;
        Category(String label) { this.label = label; }
    }

    public final String id;
    public final String name;
    public final String description;
    public final Category category;
    public final boolean defaultEnabled;
    private final List<Setting<?>> settings = new ArrayList<>();
    private boolean enabled;
    public boolean favorite;

    protected Module(String id, String name, String description, Category category, boolean defaultEnabled) {
        this.id = id;
        this.name = name;
        this.description = description;
        this.category = category;
        this.defaultEnabled = defaultEnabled;
        this.enabled = defaultEnabled;
    }

    protected final <S extends Setting<?>> S add(S setting) {
        settings.add(setting);
        return setting;
    }

    public List<Setting<?>> settings() { return Collections.unmodifiableList(settings); }

    public boolean isEnabled() { return enabled; }

    /** Core client appearance stays enabled across profiles, imports and resets. */
    public boolean isAlwaysEnabled() { return false; }

    /** Enabled by the player and not switched off by the server's rules. */
    public boolean isActive() { return isAlwaysEnabled() || enabled && !ModuleManager.isServerBlocked(id); }

    public void setEnabled(boolean enabled) {
        enabled = enabled || isAlwaysEnabled();
        if (this.enabled == enabled) return;
        this.enabled = enabled;
        if (enabled) onEnable(); else onDisable();
    }

    public void toggle() { setEnabled(!enabled); }

    public void resetSettings() { settings.forEach(Setting::reset); }

    protected void onEnable() {}
    protected void onDisable() {}
    /** Called every client tick while active. */
    public void tick(Minecraft mc) {}
    /** Called when the server blocks this module or leaves; undo any side effects. */
    public void onServerBlocked() { onDisable(); }
}
