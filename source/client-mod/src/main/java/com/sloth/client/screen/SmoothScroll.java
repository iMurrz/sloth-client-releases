package com.sloth.client.screen;

/**
 * Eased scrolling for the Sloth lists: the wheel moves a target and the shown offset glides to it. Call
 * {@link #get()} once per frame and use the result for both drawing and clicks, so hits match what's on screen.
 */
public final class SmoothScroll {
    private float target, current;
    private long last = System.nanoTime();

    public void by(double delta, int max) { to(target + delta, max); }

    public void to(double value, int max) { target = (float) Math.max(0, Math.min(Math.max(0, max), value)); }

    /** Keeps the target inside a range that may have shrunk (a filter hid rows). */
    public void clamp(int max) { if (target > max) to(max, max); }

    public void reset() { target = current = 0; }

    public float target() { return target; }

    public int get() {
        long now = System.nanoTime();
        current = SlothTheme.animated() ? SlothTheme.ease(current, target, now - last, 18f) : target;
        last = now;
        return Math.round(current);
    }
}
