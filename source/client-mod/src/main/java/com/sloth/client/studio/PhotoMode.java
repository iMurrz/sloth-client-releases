package com.sloth.client.studio;

import com.sloth.client.module.ModuleManager;
import net.minecraft.client.Minecraft;
import net.minecraft.client.CameraType;

/** Camera framing uses vanilla viewpoints, never freecam or server position changes. */
public final class PhotoMode {
    public static boolean active, guides;
    private static boolean oldGui, oldHud;
    private static int oldFov;
    private static CameraType oldCamera;
    public static void start() {
        if (active || Minecraft.getInstance().level == null) return;
        var o = Minecraft.getInstance().options;
        oldGui = o.hideGui; oldHud = ModuleManager.hudHidden; oldFov = o.fov().get(); oldCamera = o.getCameraType();
        active = true; guides = false; o.hideGui = true;
    }
    public static void stop() {
        if (!active) return;
        var o = Minecraft.getInstance().options;
        o.hideGui = oldGui; ModuleManager.hudHidden = oldHud; o.fov().set(oldFov); o.setCameraType(oldCamera);
        active = guides = false;
    }
    public static void viewpoint() {
        var o = Minecraft.getInstance().options;
        o.setCameraType(switch (o.getCameraType()) { case FIRST_PERSON -> CameraType.THIRD_PERSON_BACK; case THIRD_PERSON_BACK -> CameraType.THIRD_PERSON_FRONT; case THIRD_PERSON_FRONT -> CameraType.FIRST_PERSON; });
    }
    public static void fov(int delta) { var f = Minecraft.getInstance().options.fov(); f.set(Math.clamp(f.get() + delta, 30, 110)); }
}
