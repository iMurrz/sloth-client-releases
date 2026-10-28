package com.sloth.client;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.client.Minecraft;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicBoolean;

/** Local friends; presence means listed on this server, never a global online claim. */
public final class Friends {
    private static final ExecutorService IO = Executors.newSingleThreadExecutor(r -> { Thread t = new Thread(r, "Sloth friends"); t.setDaemon(true); return t; });
    private static final AtomicBoolean BUSY = new AtomicBoolean();
    private static volatile List<String> names = List.of();
    private static long next;
    public static List<String> names() { return names; }
    public static Set<String> online(Minecraft mc) {
        Set<String> online = new HashSet<>();
        if (mc.getConnection() != null && !mc.isLocalServer()) for (var player : mc.getConnection().getOnlinePlayers()) online.add(player.getProfile().name().toLowerCase(Locale.ROOT));
        return online;
    }
    public static void tick(Minecraft mc) {
        long now = System.currentTimeMillis();
        if (now < next || !BUSY.compareAndSet(false, true)) return;
        next = now + 2000;
        Set<String> current = online(mc);
        boolean connected = mc.getConnection() != null && !mc.isLocalServer();
        IO.execute(() -> {
            Path temp = null;
            try {
                Path dir = FabricLoader.getInstance().getConfigDir().resolve("sloth-client");
                if (!Files.isDirectory(dir) || Files.isSymbolicLink(dir)) { names = List.of(); return; }
                Path file = dir.resolve("friends.json");
                if (!Files.isRegularFile(file, LinkOption.NOFOLLOW_LINKS) || Files.size(file) > 32768) { names = List.of(); return; }
                JsonObject data = JsonParser.parseString(Files.readString(file)).getAsJsonObject();
                JsonArray entries = data.getAsJsonArray("friends");
                if (data.get("schema").getAsInt() != 1 || entries == null || entries.size() > 200) { names = List.of(); return; }
                List<String> saved = new ArrayList<>(); JsonArray visible = new JsonArray();
                for (var entry : entries) {
                    String name = entry.getAsJsonObject().get("name").getAsString();
                    if (!name.matches("[A-Za-z0-9_]{3,16}")) continue;
                    saved.add(name); if (current.contains(name.toLowerCase(Locale.ROOT))) visible.add(name);
                }
                names = List.copyOf(saved);
                JsonObject presence = new JsonObject(); presence.addProperty("schema", 1); presence.addProperty("at", now); presence.addProperty("connected", connected); presence.add("online", visible);
                temp = dir.resolve("presence-" + UUID.randomUUID() + ".tmp");
                Files.writeString(temp, presence.toString(), StandardOpenOption.CREATE_NEW);
                try { Files.move(temp, dir.resolve("presence.json"), StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE); }
                catch (AtomicMoveNotSupportedException error) { Files.move(temp, dir.resolve("presence.json"), StandardCopyOption.REPLACE_EXISTING); }
            } catch (Exception error) { names = List.of(); }
            finally { if (temp != null) try { Files.deleteIfExists(temp); } catch (Exception ignored) {} BUSY.set(false); }
        });
    }
}
