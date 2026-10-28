package com.sloth.client.module.impl;

import com.sloth.client.SlothClient;
import com.sloth.client.module.Module;
import com.sloth.client.module.ModuleManager;
import com.sloth.client.module.Setting;
import net.minecraft.client.CameraType;
import net.minecraft.client.Minecraft;
import net.minecraft.util.Mth;

/** Zoom and Freelook: both are driven by mixins into GameRenderer, Camera and MouseHandler. */
public final class CameraModules {
    private CameraModules() {}

    public static final class Zoom extends Module {
        public static final float MIN = 1.5f, MAX = 20f;
        public final Setting.Number level = add(new Setting.Number("level", "Zoom level", 4, MIN, MAX, 0.5, "x"));
        private final Setting.Bool smooth = add(new Setting.Bool("smooth", "Smooth zoom", true));
        private final Setting.Bool scroll = add(new Setting.Bool("scroll", "Scroll to adjust", true));
        private final Setting.Bool cinematic = add(new Setting.Bool("cinematic", "Smooth camera while zoomed", false));
        private float current = 1f;
        private long lastNanos = System.nanoTime();
        private boolean wasZooming;
        private boolean savedSmoothCamera;
        private boolean ownsSmoothCamera;
        private boolean levelChanged;

        public Zoom() { super("zoom", "Zoom", "Hold the zoom key (C) to zoom in; scroll to adjust.", Category.VISUAL, true); }

        public boolean zooming() {
            return isActive() && SlothClient.ZOOM != null && SlothClient.ZOOM.isDown() && Minecraft.getInstance().screen == null && Minecraft.getInstance().isWindowActive();
        }

        /** Per-frame factor to divide the FOV by. */
        public float update() {
            long now = System.nanoTime();
            float dt = Math.min(0.1f, (now - lastNanos) / 1e9f);
            lastNanos = now;
            float target = zooming() ? level.f() : 1f;
            current = smooth.on() ? current + (target - current) * (float) (1 - Math.exp(-dt * 14)) : target;
            if (Math.abs(current - target) < 0.001f) current = target;
            return current;
        }

        public float factor() { return current; }

        public boolean onScroll(double amount) {
            if (!zooming() || !scroll.on() || amount == 0) return false;
            double before=level.get();
            level.set((double) (level.f() * (float) Math.pow(1.15, Math.signum(amount))));
            levelChanged|=Double.compare(before,level.get())!=0;
            return true;
        }

        @Override public void tick(Minecraft mc) {
            boolean z = zooming();
            boolean useCinematic = z && cinematic.on();
            if (useCinematic && !ownsSmoothCamera) {
                savedSmoothCamera = mc.options.smoothCamera;
                ownsSmoothCamera = true;
                mc.options.smoothCamera = true;
            } else if (!useCinematic) restoreCamera(mc);
            if (wasZooming && !z && levelChanged) { ModuleManager.save(); levelChanged=false; }
            wasZooming = z;
        }

        private void restoreCamera(Minecraft mc) {
            if (ownsSmoothCamera && mc.options != null) mc.options.smoothCamera = savedSmoothCamera;
            ownsSmoothCamera = false;
        }

        @Override protected void onDisable() {
            restoreCamera(Minecraft.getInstance());
            wasZooming = false;
            levelChanged = false;
            current = 1f;
            lastNanos = System.nanoTime();
        }
    }

    public static final class Freelook extends Module {
        private final Setting.Choice mode = add(new Setting.Choice("mode", "Mode", "Hold", "Hold", "Toggle"));
        private final Setting.Bool invert = add(new Setting.Bool("invert", "Invert vertical", false));
        public final Setting.Number lookSpeed = add(new Setting.Number("look_speed", "Look speed", 1.25, 0.25, 3.0, 0.05, "x"));
        private boolean looking;
        private boolean toggled;
        private float yaw, pitch;
        private CameraType previous;

        public Freelook() { super("freelook", "Freelook", "Hold Left Alt to look around without turning your character.", Category.VISUAL, true); }

        /** True only while the camera is actively detached. Release restores the view immediately. */
        public boolean looking() { return looking && isActive(); }
        /** True while mouse movement should turn the camera instead of the player. */
        public boolean capturing() { return looking && isActive(); }
        public float yaw() { return yaw; }
        public float pitch() { return pitch; }

        /** Called after vanilla processes a released key/button, without waiting for the next game tick. */
        public void releaseIfNeeded(Minecraft mc) {
            if(looking && mode.is("Hold") && SlothClient.FREELOOK!=null && !SlothClient.FREELOOK.isDown())stop(mc);
        }

        public void turn(double dx, double dy) {
            float sensitivity=0.15f*lookSpeed.f();
            yaw += (float) dx * sensitivity;
            pitch = Mth.clamp(pitch + (float) dy * sensitivity * (invert.on() ? -1 : 1), -90f, 90f);
        }

        @Override public void tick(Minecraft mc) {
            if (SlothClient.FREELOOK == null) return;
            if (mc.player == null || mc.screen != null || !mc.isWindowActive()) {
                looking = false;
                toggled = false;
                while (SlothClient.FREELOOK.consumeClick()) {}
                finishReturn(mc);
                return;
            }
            boolean want;
            if (mode.is("Toggle")) { while (SlothClient.FREELOOK.consumeClick()) toggled = !toggled; want = toggled; }
            else {
                while (SlothClient.FREELOOK.consumeClick()) {}
                want = SlothClient.FREELOOK.isDown();
            }
            want &= mc.player != null && mc.screen == null;
            if (want && !looking) start(mc);
            else if (!want && looking) stop(mc);
        }

        private void start(Minecraft mc) {
            looking = true;
            yaw = mc.player.getYRot();
            pitch = mc.player.getXRot();
            previous = mc.options.getCameraType();
            mc.options.setCameraType(CameraType.THIRD_PERSON_BACK);
        }

        private void stop(Minecraft mc) {
            looking = false;
            toggled = false;
            finishReturn(mc);
        }

        private void finishReturn(Minecraft mc) {
            if (previous != null) mc.options.setCameraType(previous);
            previous = null;
        }

        @Override protected void onDisable() {
            if (looking) { looking = false; toggled = false; }
            finishReturn(Minecraft.getInstance());
        }
    }
}
