package com.sloth.client.module.impl;

import com.sloth.client.module.Module;
import com.sloth.client.module.ModuleManager;
import com.sloth.client.module.Setting;
import net.minecraft.client.Minecraft;
import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.core.BlockPos;
import net.minecraft.network.chat.Component;
import net.minecraft.world.level.GameType;
import java.util.LinkedHashMap;
import java.util.Map;

/** Keeps the server's last block state until an ordinary server update arrives. */
public final class MiningSync extends Module {
    private final Setting.Number retry = add(new Setting.Number("retry", "Pending retry window", 3, 1, 8, 1, "s"));
    private final Setting.Bool notices = add(new Setting.Bool("notices", "Show delayed update notice", true));
    private final Map<BlockPos, Long> pending = new LinkedHashMap<>();
    private ClientLevel level;
    private long lastNotice;

    public MiningSync() {
        super("mining_sync", "Mining Sync", "Experimental: keep mined blocks solid until the server updates them. May feel slower on laggy servers. Multiplayer Survival only.", Category.UTILITY, false);
    }
    public static MiningSync current() {
        Module module = ModuleManager.get("mining_sync");
        return module instanceof MiningSync sync ? sync : null;
    }
    private boolean ready(Minecraft mc) {
        if (level != mc.level) { pending.clear(); level = mc.level; lastNotice = 0; }
        return isActive() && mc.level != null && mc.player != null && mc.gameMode != null
            && !mc.hasSingleplayerServer() && mc.gameMode.getPlayerMode() == GameType.SURVIVAL;
    }
    private void expire(long now) { pending.values().removeIf(start -> now - start >= retry.i() * 1_000_000_000L); }
    /** Called only at vanilla's local block-removal call, after its restriction/tool checks. */
    public boolean holdPrediction(BlockPos pos) {
        Minecraft mc = Minecraft.getInstance();
        if (!ready(mc)) return false;
        long now = System.nanoTime(); expire(now);
        // Once the bounded queue is full, retain vanilla behavior for new positions.
        if (!pending.containsKey(pos) && pending.size() >= 128) return false;
        pending.putIfAbsent(pos.immutable(), now);
        return true;
    }
    /** Do not send repeated mining requests for a block already waiting on a server update. */
    public boolean waiting(BlockPos pos) {
        if (!ready(Minecraft.getInstance())) return false;
        expire(System.nanoTime());
        return pending.containsKey(pos);
    }
    public void serverUpdate(ClientLevel source, BlockPos pos) { if (source == level) pending.remove(pos); }
    @Override public void tick(Minecraft mc) {
        if (!ready(mc)) { pending.clear(); return; }
        long now = System.nanoTime(); expire(now);
        if (mc.screen == null && notices.on() && !pending.isEmpty() && now - lastNotice >= 5_000_000_000L
            && now - pending.values().iterator().next() >= 1_000_000_000L) {
            lastNotice = now;
            mc.player.displayClientMessage(Component.literal("Mining Sync: waiting for server block updates (" + pending.size() + ")."), true);
        }
    }
    @Override protected void onDisable() { pending.clear(); level = null; lastNotice = 0; }
}
