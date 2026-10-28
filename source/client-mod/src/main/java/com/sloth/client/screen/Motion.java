package com.sloth.client.screen;

import java.util.HashMap;
import java.util.Map;

/**
 * Small animation toolkit for the Sloth screens: eased curves for entrances/exits, and a tracker that gives any
 * keyed thing (a module card, a settings row) its own smoothly eased 0..1 state. Respects the theme's
 * "Smooth animations" setting: with it off, everything snaps.
 */
public final class Motion {
    private Motion() {}

    /** Cubic ease-out progress (0 → 1) of an animation that started at {@code startMs} and lasts {@code ms}. */
    public static float out(long startMs, float ms) {
        if (!SlothTheme.animated() || startMs <= 0) return 1f;
        float t = Math.min(1f, Math.max(0f, (System.currentTimeMillis() - startMs) * SlothTheme.motionSpeed() / ms));
        float u = 1f - t;
        return 1f - u * u * u;
    }

    /** Ease-out with a small overshoot, for "pop" moments (a star, a toggle). */
    public static float pop(long startMs, float ms) {
        if (!SlothTheme.animated() || startMs <= 0) return 1f;
        float t = Math.min(1f, Math.max(0f, (System.currentTimeMillis() - startMs) * SlothTheme.motionSpeed() / ms));
        float c = 1.9f, u = t - 1f;
        return 1f + (c + 1f) * u * u * u + c * u * u;
    }

    /** 1 → 0 fade that starts at {@code startMs} and lasts {@code ms} (0 once it's over or never started). */
    public static float flash(long startMs, float ms) {
        if (!SlothTheme.animated() || startMs <= 0) return 0f;
        float t = (System.currentTimeMillis() - startMs) * SlothTheme.motionSpeed() / ms;
        return t >= 1f || t < 0f ? 0f : 1f - t;
    }

    /** Per-key eased values: {@code get(key, on)} glides toward 1 while {@code on}, back to 0 otherwise. */
    public static final class Tracker {
        private final Map<Object, float[]> values = new HashMap<>();
        private final Map<Object, Long> times = new HashMap<>();
        private final float speed;

        /** {@code speed} 14 settles in about 150 ms; higher is snappier. */
        public Tracker(float speed) { this.speed = speed; }

        public float get(Object key, boolean on) {
            float target = on ? 1f : 0f;
            long now = System.nanoTime();
            float[] v = values.get(key);
            if (v == null) {
                values.put(key, new float[] {target});
                times.put(key, now);
                return target;
            }
            v[0] = SlothTheme.animated() ? SlothTheme.ease(v[0], target, now - times.get(key), speed) : target;
            times.put(key, now);
            return v[0];
        }

        /** Starts {@code key} from {@code value} (e.g. 0 so a new card animates in). */
        public void set(Object key, float value) {
            values.put(key, new float[] {value});
            times.put(key, System.nanoTime());
        }
    }
}
