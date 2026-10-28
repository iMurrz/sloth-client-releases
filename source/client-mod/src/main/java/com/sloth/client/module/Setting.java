package com.sloth.client.module;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonPrimitive;

import java.awt.Color;
import java.util.function.BooleanSupplier;

/** A persisted, user-editable module option. Values loaded from disk are always re-validated. */
public abstract class Setting<T> {
    public final String id;
    public final String name;
    public final T defaultValue;
    protected T value;
    private BooleanSupplier visible = () -> true;

    protected Setting(String id, String name, T defaultValue) {
        this.id = id;
        this.name = name;
        this.defaultValue = defaultValue;
        this.value = defaultValue;
    }

    public String explanation() {
        return switch(id){
          case "hud_group" -> "HUDs with the same group move and resize together. Shift-click and Ctrl+G in the editor create a group.";
          case "ore_colors" -> "Use the colour of the visible ore under your crosshair. Does not scan for hidden ores.";
          case "mineral_blocks" -> "Include mineral storage blocks when matching ore colours.";
          case "outline_color" -> "Colour and transparency of the crosshair outline.";
          case "center_dot" -> "Add a dot to cross and T shapes independently of the arms.";
          case "dynamic" -> "Increase the crosshair gap while sprinting or airborne.";
          case "background" -> "Draw a panel behind this HUD to separate it from the world.";
          case "scale" -> "Change this HUD's size. Group resizing is available in the HUD editor.";
          case "text_color" -> "Colour of this HUD's text. Chroma cycles through colours.";
          case "shadow" -> "Draw a small shadow beneath HUD text.";
          case "animations" -> "Animate menu transitions. Turn off for reduced motion.";
          case "animation_speed" -> "Adjust visual transition speed; does not change mouse sensitivity or gameplay timing.";
          case "hud_font" -> "Use Sloth's smooth font on Sloth HUDs, or keep your resource-pack font. Chat, Tab and server interfaces retain their original fonts.";
          default -> this instanceof Number n ? "Choose a value from "+n.min+" to "+n.max+n.suffix+"." : this instanceof Choice c ? "Available choices: "+String.join(", ",c.options)+"." : this instanceof Colour ? "Choose a colour, transparency and optional chroma." : this instanceof Text ? "Enter a value for "+name+"." : "Turn "+name+" on or off.";
        };
    }
    public T get() { return value; }
    public void set(T value) { this.value = value; }
    public void reset() { this.value = defaultValue; }
    public Setting<T> visibleWhen(BooleanSupplier condition) { visible = condition == null ? () -> true : condition; return this; }
    public boolean visible() { try { return visible.getAsBoolean(); } catch (RuntimeException ignored) { return true; } }
    public abstract JsonElement toJson();
    public abstract void fromJson(JsonElement json);

    // ---------- types ----------

    public static final class Bool extends Setting<Boolean> {
        public Bool(String id, String name, boolean def) { super(id, name, def); }
        public boolean on() { return value; }
        public void toggle() { value = !value; }
        @Override public JsonElement toJson() { return new JsonPrimitive(value); }
        @Override public void fromJson(JsonElement json) { if (json != null && json.isJsonPrimitive() && json.getAsJsonPrimitive().isBoolean()) value = json.getAsBoolean(); }
    }

    public static final class Number extends Setting<Double> {
        public final double min, max, step;
        public final String suffix;
        public Number(String id, String name, double def, double min, double max, double step, String suffix) {
            super(id, name, def);
            this.min = min; this.max = max; this.step = step; this.suffix = suffix;
        }
        public float f() { return value.floatValue(); }
        public int i() { return (int) Math.round(value); }
        @Override public void set(Double v) { value = clamp(v); }
        private double clamp(double v) {
            double stepped = step > 0 ? Math.round(v / step) * step : v;
            return Math.max(min, Math.min(max, stepped));
        }
        public String display() {
            return (step >= 1 ? String.valueOf(Math.round(value)) : String.format("%.2f", value).replaceAll("0+$", "").replaceAll("\\.$", "")) + suffix;
        }
        @Override public JsonElement toJson() { return new JsonPrimitive(value); }
        @Override public void fromJson(JsonElement json) { if (json != null && json.isJsonPrimitive() && json.getAsJsonPrimitive().isNumber()) set(json.getAsDouble()); }
    }

    public static final class Choice extends Setting<String> {
        public final String[] options;
        public Choice(String id, String name, String def, String... options) { super(id, name, def); this.options = options; }
        public boolean is(String option) { return value.equals(option); }
        public void cycle() {
            for (int i = 0; i < options.length; i++) if (options[i].equals(value)) { value = options[(i + 1) % options.length]; return; }
            value = defaultValue;
        }
        @Override public JsonElement toJson() { return new JsonPrimitive(value); }
        @Override public void fromJson(JsonElement json) {
            if (json == null || !json.isJsonPrimitive()) return;
            for (String option : options) if (option.equals(json.getAsString())) value = option;
        }
    }

    /** ARGB colour with optional chroma (rainbow) cycling. */
    public static final class Colour extends Setting<Integer> {
        public boolean chroma;
        public Colour(String id, String name, int argb) { super(id, name, argb); }
        public int argb() { return argb(0); }
        /** `offset` shifts the chroma phase so multi-line text ripples. */
        public int argb(float offset) {
            if (!chroma) return value;
            float hue = ((System.currentTimeMillis() % 5000L) / 5000f + offset) % 1f;
            return (value & 0xFF000000) | (Color.HSBtoRGB(hue, 0.75f, 1f) & 0xFFFFFF);
        }
        @Override public void reset() { super.reset(); chroma = false; }
        @Override public JsonElement toJson() {
            JsonObject o = new JsonObject();
            o.addProperty("argb", String.format("#%08X", value));
            o.addProperty("chroma", chroma);
            return o;
        }
        @Override public void fromJson(JsonElement json) {
            if (json == null || !json.isJsonObject()) return;
            JsonObject o = json.getAsJsonObject();
            if (o.has("argb") && o.get("argb").getAsString().matches("#[0-9A-Fa-f]{8}")) value = (int) Long.parseLong(o.get("argb").getAsString().substring(1), 16);
            if (o.has("chroma") && o.get("chroma").isJsonPrimitive()) chroma = o.get("chroma").getAsBoolean();
        }
    }

    public static final class Text extends Setting<String> {
        public final int maxLength;
        public Text(String id, String name, String def, int maxLength) { super(id, name, def); this.maxLength = maxLength; }
        @Override public void set(String v) { value = sanitize(v); }
        private String sanitize(String v) {
            String clean = v == null ? "" : v.replaceAll("[\\p{Cntrl}§]", "");
            return clean.length() > maxLength ? clean.substring(0, maxLength) : clean;
        }
        @Override public JsonElement toJson() { return new JsonPrimitive(value); }
        @Override public void fromJson(JsonElement json) { if (json != null && json.isJsonPrimitive()) set(json.getAsString()); }
    }
}
