package com.sloth.client.studio;

import net.minecraft.client.Minecraft;
import java.util.*;

/** Bounded gameplay frame intervals, sampled on the render thread; never uploaded. */
public final class FrameStats {
    private static final double[] samples = new double[600];
    private static int count, cursor;
    private static long last;
    private static Stats cached;
    public static void frame() {
        Minecraft mc = Minecraft.getInstance(); long now = System.nanoTime();
        if (mc.level == null || mc.screen != null || !mc.isWindowActive()) { last = 0; return; }
        if (last != 0) { double interval=Math.min(10000, (now - last) / 1_000_000.0); samples[cursor] = interval; cursor = (cursor + 1) % samples.length; count = Math.min(count + 1, samples.length); cached=null; Insights.frame(interval); }
        last = now;
    }
    public static void clear() { count = cursor = 0; last = 0; cached=null; }
    public static int overBudget(int fps) {int n=0;for(int i=0;i<count;i++)if(samples[i]>1000.0/fps)n++;return n;}
    public record Stats(int count, double median, double p95, int stalls, double[] graph) {}
    public static Stats read() {
        if(cached!=null)return cached;
        double[] sorted = Arrays.copyOf(samples, count); Arrays.sort(sorted);
        double[] graph = new double[Math.min(90, count)];
        for (int i = 0; i < graph.length; i++) graph[i] = samples[Math.floorMod(cursor - graph.length + i, samples.length)];
        cached=new Stats(count, count == 0 ? 0 : sorted[count / 2], count == 0 ? 0 : sorted[Math.min(count - 1, (int) Math.ceil(count * .95) - 1)], (int) Arrays.stream(sorted).filter(v -> v > 50).count(), graph);
        return cached;
    }
}
