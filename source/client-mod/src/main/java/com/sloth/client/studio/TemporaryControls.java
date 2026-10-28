package com.sloth.client.studio;

import com.sloth.client.SlothClient;
import net.minecraft.client.Minecraft;
import net.minecraft.sounds.SoundSource;

/** Session-only overrides. No profile values are changed. */
public final class TemporaryControls {
    public static boolean focus, clean;
    private static boolean quiet;
    private static double oldVolume;
    public static void tick(Minecraft mc) {
        boolean available=mc.level!=null && mc.screen==null && mc.isWindowActive();
        boolean next=available && SlothClient.HOLD_QUIET.isDown();
        var master=mc.options.getSoundSourceOptionInstance(SoundSource.MASTER);
        if(next && !quiet) {oldVolume=master.get(); master.set(oldVolume*.25);}
        if(!next && quiet) master.set(oldVolume);
        quiet=next; clean=available && SlothClient.HOLD_CLEAN.isDown();
        if(mc.level==null) focus=false;
    }
    public static boolean hide(String id) { return clean || focus && Preferences.ids("focusHud").contains(id); }
    public static void stop() {
        if(quiet) Minecraft.getInstance().options.getSoundSourceOptionInstance(SoundSource.MASTER).set(oldVolume);
        quiet=clean=focus=false;
    }
}
