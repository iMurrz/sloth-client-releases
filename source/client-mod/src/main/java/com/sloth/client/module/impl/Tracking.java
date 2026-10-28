package com.sloth.client.module.impl;

import net.minecraft.client.Minecraft;
import net.minecraft.client.player.LocalPlayer;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.phys.Vec3;

import java.util.ArrayDeque;
import java.util.Deque;

/** Shared client-side counters fed by mixins and events; read by HUD modules. Client thread only. */
public final class Tracking {
    private static final Deque<Long> LEFT = new ArrayDeque<>();
    private static final Deque<Long> RIGHT = new ArrayDeque<>();
    public static long sessionStart = System.currentTimeMillis();
    public static double lastReach = -1;
    public static long lastReachAt;
    public static int combo;
    private static int comboTarget = -1;
    private static long lastHitAt;
    private static int lastHurtTime;
    private static Vec3 lastPos;
    private static LocalPlayer trackedPlayer;
    public static double speed;

    private Tracking() {}

    public static void reset() {
        LEFT.clear(); RIGHT.clear(); lastPos = null; trackedPlayer = null;
        speed = 0; lastReach = -1; lastReachAt = 0; combo = 0;
        comboTarget = -1; lastHitAt = 0; lastHurtTime = 0;
    }

    public static void click(int button) {
        long now = System.currentTimeMillis();
        if (button == 0) LEFT.addLast(now);
        else if (button == 1) RIGHT.addLast(now);
    }

    private static int cps(Deque<Long> clicks) {
        long cutoff = System.currentTimeMillis() - 1000;
        while (!clicks.isEmpty() && clicks.peekFirst() < cutoff) clicks.pollFirst();
        return clicks.size();
    }

    public static int leftCps() { return cps(LEFT); }
    public static int rightCps() { return cps(RIGHT); }

    public static void attacked(LocalPlayer player, Entity target) {
        Vec3 eye = player.getEyePosition();
        Vec3 closest = target.getBoundingBox().getCenter();
        var box = target.getBoundingBox();
        closest = new Vec3(Math.max(box.minX, Math.min(eye.x, box.maxX)), Math.max(box.minY, Math.min(eye.y, box.maxY)), Math.max(box.minZ, Math.min(eye.z, box.maxZ)));
        lastReach = eye.distanceTo(closest);
        lastReachAt = System.currentTimeMillis();
        long now = System.currentTimeMillis();
        combo = target.getId() == comboTarget && now - lastHitAt < 2000 ? combo + 1 : 1;
        comboTarget = target.getId();
        lastHitAt = now;
    }

    public static void tick(Minecraft mc) {
        LocalPlayer p = mc.player;
        if (p != trackedPlayer) { reset(); trackedPlayer = p; }
        cps(LEFT); cps(RIGHT); // Bound click history even when every CPS overlay is disabled.
        if (p == null) { lastPos = null; speed = 0; return; }
        Vec3 pos = p.position();
        double dx=lastPos==null?0:pos.x-lastPos.x,dz=lastPos==null?0:pos.z-lastPos.z;
        speed = Math.sqrt(dx*dx+dz*dz) * 20;
        lastPos = pos;
        if (p.hurtTime > lastHurtTime) combo = 0;
        lastHurtTime = p.hurtTime;
        if (System.currentTimeMillis() - lastHitAt > 2000) combo = 0;
    }
}
