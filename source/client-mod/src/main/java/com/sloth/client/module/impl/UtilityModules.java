package com.sloth.client.module.impl;

import com.sloth.client.SlothClient;
import com.sloth.client.module.Module;
import com.sloth.client.module.Setting;
import net.minecraft.client.Minecraft;
import net.minecraft.client.player.LocalPlayer;
import net.minecraft.network.chat.Component;

import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.util.Locale;

public final class UtilityModules {
    private UtilityModules() {}

    /** Sprint without holding Ctrl: Toggle (press once) or Always (whenever you walk forward). */
    public static final class Sprint extends Module {
        private final Setting.Choice mode = add(new Setting.Choice("mode", "Mode", "Toggle", "Toggle", "Always"));
        private boolean previousToggle;
        private boolean holdingSprint;
        public Sprint() { super("sprint", "Toggle Sprint", "Sprint without holding the sprint key (Toggle or Always).", Category.UTILITY, false); }
        @Override protected void onEnable() { previousToggle = Minecraft.getInstance().options.toggleSprint().get(); }

        @Override public void tick(Minecraft mc) {
            LocalPlayer p = mc.player;
            if (p == null || mc.screen != null || !mc.isWindowActive()) { releaseSprint(mc); return; }
            boolean toggle = mode.is("Toggle");
            // Release the forced key before enabling vanilla toggle mode:
            // ToggleKeyMapping ignores setDown(false) once toggle mode is active.
            if (toggle) releaseSprint(mc);
            // Toggle uses vanilla's own sprint toggle; Always holds the key for you.
            if (mc.options.toggleSprint().get() != toggle) mc.options.toggleSprint().set(toggle);
            if (!toggle) { mc.options.keySprint.setDown(true); holdingSprint = true; }
        }

        private void releaseSprint(Minecraft mc) {
            if (holdingSprint) mc.options.keySprint.setDown(false);
            holdingSprint = false;
        }

        @Override protected void onDisable() {
            Minecraft mc = Minecraft.getInstance();
            releaseSprint(mc);
            mc.options.toggleSprint().set(previousToggle);
            mc.options.keySprint.setDown(false);
        }
    }

    /** Wraps the vanilla toggle-crouch option so it lives with the other modules. */
    public static final class Sneak extends Module {
        private boolean previousToggle;
        public Sneak() { super("sneak", "Toggle Sneak", "Press sneak once to stay crouched.", Category.UTILITY, false); }
        @Override protected void onEnable() { previousToggle = Minecraft.getInstance().options.toggleCrouch().get(); Minecraft.getInstance().options.toggleCrouch().set(true); }
        @Override public void tick(Minecraft mc) { if (!mc.options.toggleCrouch().get()) mc.options.toggleCrouch().set(true); }
        @Override protected void onDisable() { Minecraft.getInstance().options.toggleCrouch().set(previousToggle); }
    }

    /** Up to six hotkeys that send a command or chat line (bind them in Controls > Sloth Client). */
    public static final class Hotkeys extends Module {
        public final Setting.Text[] texts = new Setting.Text[6];
        private final long[] lastSent = new long[6];
        private final Setting.Number cooldown = add(new Setting.Number("cooldown", "Hotkey cooldown", 1, 1, 30, 1, "s"));
        private long lastGlobal;
        public Hotkeys() {
            super("hotkeys", "Auto Text Hotkeys", "Bind keys to your own chat messages or commands (Controls > Sloth Client).", Category.UTILITY, true);
            String[] defaults = {"", "", "", "", "", ""};
            for (int i = 0; i < texts.length; i++) texts[i] = add(new Setting.Text("text_" + (i + 1), "Hotkey " + (i + 1), defaults[i], 256));
        }

        @Override public void tick(Minecraft mc) {
            for (int i = 0; i < texts.length; i++) {
                while (SlothClient.HOTKEYS[i].consumeClick()) send(mc, i);
            }
        }

        private void send(Minecraft mc, int i) {
            String text = texts[i].get().trim();
            long now = System.currentTimeMillis();
            if (text.isEmpty() || mc.player == null || mc.screen != null || !mc.isWindowActive() || mc.getConnection() == null || now - lastSent[i] < cooldown.i() * 1000L || now - lastGlobal < cooldown.i() * 1000L) return;
            lastSent[i] = now;
            lastGlobal = now;
            if (text.startsWith("/")) mc.getConnection().sendCommand(text.substring(1));
            else mc.getConnection().sendChat(text);
        }
    }

    public static final class ChatTimestamps extends Module {
        private final Setting.Choice format = add(new Setting.Choice("format", "Format", "24h", "24h", "12h"));
        public ChatTimestamps() { super("chat_timestamps", "Chat Timestamps", "Adds the time to each chat message.", Category.UTILITY, false); }
        public Component stamp(Component message) {
            String time = LocalTime.now().format(DateTimeFormatter.ofPattern(format.is("12h") ? "h:mm" : "HH:mm", Locale.ROOT));
            return Component.literal("[" + time + "] ").withStyle(net.minecraft.ChatFormatting.DARK_GRAY).append(message);
        }
    }

    /** New chat lines glide up into place instead of jumping (the chat is drawn lower, then eases back). */
    public static final class SmoothChat extends Module {
        private final Setting.Number speed = add(new Setting.Number("speed", "Speed", 16, 6, 30, 1, ""));
        private float lines;
        private long last = System.nanoTime();

        public SmoothChat() { super("smooth_chat", "Smooth Chat", "New chat messages slide up into place.", Category.UTILITY, true); }

        public void lineAdded() {
            if (isActive() && com.sloth.client.screen.SlothTheme.animated()) lines = Math.min(lines + 1f, 8f);
        }

        /** How far down to draw the chat this frame, in GUI pixels. */
        public float offset() {
            long now = System.nanoTime();
            float dt = Math.min(0.1f, (now - last) / 1e9f);
            last = now;
            if (!isActive() || lines <= 0.002f) { lines = 0; return 0; }
            lines *= (float) Math.exp(-dt * speed.f());
            Minecraft mc = Minecraft.getInstance();
            double scale = mc.options.chatScale().get(), spacing = mc.options.chatLineSpacing().get();
            return (float) (lines * 9.0 * (1.0 + spacing) * scale);
        }
    }

    public static final class SmartDisconnect extends Module {
        public SmartDisconnect() { super("smart_disconnect", "Smart Disconnect", "Asks before you leave the server from the pause menu.", Category.UTILITY, true); }
    }

    /** A bounded, memory-only companion view. Vanilla still renders and owns every signed chat message. */
    public static final class ChatHub extends Module {
        public final Setting.Number capacity=add(new Setting.Number("capacity","Messages kept this session",200,50,500,25,""));
        public final Setting.Bool privateMessages=add(new Setting.Bool("private_messages","Detect common private-message formats",true));
        public ChatHub(){super("chat_hub","Chat Hub","Memory-only tabs for chat, mentions, private messages and system notices. Vanilla signed chat remains unchanged.",Category.UTILITY,true);}
        @Override protected void onDisable(){com.sloth.client.studio.ChatHub.clear();}
    }

}
