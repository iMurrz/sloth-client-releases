package com.sloth.client.module.impl;

import com.sloth.client.module.Module;
import com.sloth.client.module.Setting;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.screens.ChatScreen;
import net.minecraft.client.multiplayer.ClientLevel;
import java.util.Locale;

/** User-defined literal system-message triggers. Empty, disabled and draft-only by default. */
public final class AutoTextActions extends Module {
    private final Setting.Text server = add(new Setting.Text("server", "Allowed server address (required)", "", 255));
    private final Setting.Choice action = add(new Setting.Choice("action", "Action", "Draft chat", "Draft chat", "Send automatically"));
    private final Setting.Number cooldown = add(new Setting.Number("cooldown", "Global cooldown", 10, 5, 120, 1, "s"));
    private final Setting.Text[] triggers = new Setting.Text[4], responses = new Setting.Text[4];
    private String queued;
    private ClientLevel queuedLevel;
    private long nextAllowed, expires;
    public AutoTextActions() {
        super("auto_text_actions", "Auto Text Actions", "Four literal server-message rules. Enter an exact server address. Drafts by default; automatic sending is optional.", Category.UTILITY, false);
        for (int i = 0; i < 4; i++) { triggers[i] = add(new Setting.Text("trigger_" + i, "Rule " + (i + 1) + " contains", "", 120)); responses[i] = add(new Setting.Text("response_" + i, "Rule " + (i + 1) + " response", "", 256)); }
    }
    private boolean allowed(Minecraft mc) {
        return isActive() && mc.player != null && mc.level != null && mc.getCurrentServer() != null && mc.getConnection() != null
            && !server.get().trim().isEmpty() && server.get().trim().equalsIgnoreCase(mc.getCurrentServer().ip);
    }
    public void message(String text, boolean overlay) {
        Minecraft mc = Minecraft.getInstance(); long now = System.nanoTime();
        if (overlay || !allowed(mc) || mc.screen != null || !mc.isWindowActive() || queued != null || now < nextAllowed || text.length() > 4096) return;
        String normalized = text.toLowerCase(Locale.ROOT);
        for (int i = 0; i < triggers.length; i++) {
            String needle = triggers[i].get().trim().toLowerCase(Locale.ROOT), response = responses[i].get().trim();
            if (!needle.isEmpty() && !response.isEmpty() && normalized.contains(needle)) {
                queued = response; queuedLevel = mc.level; expires = now + 5_000_000_000L; nextAllowed = now + cooldown.i() * 1_000_000_000L; return;
            }
        }
    }
    @Override public void tick(Minecraft mc) {
        if (queued == null) return;
        if (!allowed(mc) || queuedLevel != mc.level || System.nanoTime() > expires || mc.screen != null || !mc.isWindowActive()) { queued = null; queuedLevel = null; return; }
        String response = queued; queued = null; queuedLevel = null;
        if (action.is("Draft chat")) mc.setScreen(new ChatScreen(response, false));
        else if (response.startsWith("/") && response.length() > 1) mc.getConnection().sendCommand(response.substring(1));
        else if (!response.equals("/")) mc.getConnection().sendChat(response);
    }
    @Override protected void onDisable() { queued = null; queuedLevel = null; nextAllowed = 0; }
}
