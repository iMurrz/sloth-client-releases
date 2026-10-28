package com.sloth.client.screen;

import com.sloth.client.module.HudModule;
import com.sloth.client.module.Module;
import com.sloth.client.module.ModuleManager;
import com.sloth.client.module.Setting;
import com.sloth.client.screen.widget.SlothButton;
import com.sloth.client.screen.widget.SlothSlider;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.AbstractWidget;
import net.minecraft.client.gui.components.EditBox;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.Component;

import java.util.ArrayList;
import java.util.List;

/** Every setting of one module, as a scrollable list of launcher-style controls. */
public final class ModuleSettingsScreen extends SlothScreen {
    private static final int ROW = 30;
    private String query="";
    private boolean advanced;
    private static final java.util.Set<String> DETAIL = java.util.Set.of("hud_group", "background_color", "border_color", "shadow", "outline_color", "chroma", "cinematic");
    private EditBox search;
    private final Screen parent;
    private final Module module;
    private final List<AbstractWidget> rows = new ArrayList<>();
    private final List<Setting<?>> rowSettings = new ArrayList<>();
    private final List<String> labels = new ArrayList<>();
    private int scroll;
    private final SmoothScroll smooth = new SmoothScroll();
    private final Motion.Tracker rowAnim = new Motion.Tracker(16f);
    private long openedAt;
    private int listTop, listBottom, left, rowW;
    private final String focusSetting;

    public ModuleSettingsScreen(Screen parent, Module module) {
        this(parent, module, null);
    }
    public ModuleSettingsScreen(Screen parent, Module module, String focusSetting) {
        super(Component.literal(module.name));
        this.parent = parent;
        this.module = module;
        this.focusSetting = focusSetting;
        advanced = focusSetting != null;
    }

    @Override
    protected void init() {
        if (openedAt == 0) openedAt = System.currentTimeMillis();
        rowW = Math.min(460, width - 40);
        left = (width - rowW) / 2;
        listTop = 100;
        listBottom = height - 44;
        rows.clear();
        rowSettings.clear();
        labels.clear();

        row(module.isAlwaysEnabled() ? "Core appearance · always enabled" : "Enabled", null, SlothButton.toggle(module.isEnabled(), () -> {
            if (!ModuleManager.isServerBlocked(module.id)) module.toggle();
            ModuleManager.save();
            return module.isEnabled();
        }));
        rows.getFirst().active = !module.isAlwaysEnabled() && !ModuleManager.isServerBlocked(module.id);
        search=new EditBox(font,left,72,rowW-170,20,Component.literal("Search all options"));search.setValue(query);search.setHint(Component.literal("Search all options..."));search.setResponder(v->{query=v;scroll=0;smooth.reset();layout();});addRenderableWidget(search);
        button(left+rowW-164,72,104,20,advanced?"Fewer options":"More options",b->{advanced=!advanced;b.setMessage(Component.literal(advanced?"Fewer options":"More options"));scroll=0;smooth.reset();layout();});
        button(left+rowW-54,72,54,20,"Clear",b->search.setValue(""));
        for (Setting<?> s : module.settings()) row(s.name, s, control(s));
        if (focusSetting != null && scroll == 0) {
            for (int i = 0; i < rowSettings.size(); i++) if (rowSettings.get(i) != null && rowSettings.get(i).id.equals(focusSetting)) {
                scroll = Math.min(i * ROW, Math.max(0, matchingCount() * ROW - (listBottom - listTop)));
                smooth.by(scroll, Math.max(0, rows.size() * ROW - (listBottom - listTop)));
                break;
            }
        }
        layout();

        int by = height - 26;
        button(width / 2 - 104, by, 100, 18, "Reset all options", b -> {
            module.resetSettings();
            if (module instanceof HudModule h) h.resetPosition();
            ModuleManager.save();
            rebuildWidgets();
        });
        primary(width / 2 + 4, by, 100, 18, "Done", b -> onClose());
    }

    private void row(String label, Setting<?> setting, AbstractWidget control) {
        labels.add(label);
        rowSettings.add(setting);
        rows.add(control);
        addWidget(control); // drawn by render(), clipped to the list
    }

    private AbstractWidget control(Setting<?> s) {
        if (s instanceof Setting.Bool b) {
            return SlothButton.toggle(b.on(), () -> { b.toggle(); ModuleManager.save(); rebuildWidgets(); return b.on(); });
        }
        if (s instanceof Setting.Choice c) {
            return new SlothButton(0, 0, 100, 18, Component.literal(c.get() + "  ▸"), SlothButton.Style.NORMAL, btn -> { c.cycle(); ModuleManager.save(); rebuildWidgets(); });
        }
        if (s instanceof Setting.Number n) {
            return new SlothSlider(0, 0, 100, 18, (n.get() - n.min) / (n.max - n.min)) {
                { updateMessage(); }
                @Override protected void updateMessage() { setMessage(Component.literal(n.display())); }
                @Override protected void applyValue() { n.set(n.min + value * (n.max - n.min)); ModuleManager.save(); }
            };
        }
        if (s instanceof Setting.Colour c) {
            return new SlothButton(0, 0, 100, 18, Component.literal(c.chroma ? "Chroma" : String.format("#%08X", c.get())), SlothButton.Style.NORMAL, btn -> minecraft.setScreen(new ColorPickerScreen(this, c)));
        }
        if (s instanceof Setting.Text t) {
            EditBox box = new EditBox(font, 0, 0, 100, 18, Component.literal(t.name));
            box.setMaxLength(t.maxLength);
            box.setValue(t.get());
            box.setResponder(v -> { t.set(v); ModuleManager.save(); });
            return box;
        }
        throw new IllegalStateException("Unknown setting type " + s.getClass());
    }

    private boolean matches(int i) {
        Setting<?> setting=rowSettings.get(i);
        if(setting!=null&&!setting.visible())return false;
        if(!query.isBlank())return (labels.get(i)+" "+(setting==null?"":setting.explanation())).toLowerCase(java.util.Locale.ROOT).contains(query.toLowerCase(java.util.Locale.ROOT));
        if(advanced || setting==null)return true;
        if(module.id.equals("crosshair"))return java.util.Set.of("style","size","color","ore_colors").contains(setting.id);
        if(DETAIL.contains(setting.id))return false;
        int common=0;for(int j=1;j<=i;j++)if(!DETAIL.contains(rowSettings.get(j).id))common++;
        return common<=4;
    }
    private int matchingCount(){int n=0;for(int i=0;i<labels.size();i++)if(matches(i))n++;return n;}
    private void layout() {
        int controlW = Math.min(170, rowW / 2);
        for (int i = 0; i < rows.size(); i++) {
            AbstractWidget w = rows.get(i);
            boolean matches=matches(i);
            int index=0;for(int j=0;j<i;j++)if(matches(j))index++;
            int y = listTop + index * ROW - scroll;
            w.setX(left + rowW - controlW);
            w.setY(y);
            w.setWidth(controlW);
            if(rowSettings.get(i)!=null)w.setTooltip(net.minecraft.client.gui.components.Tooltip.create(Component.literal(rowSettings.get(i).explanation()+" · Default: "+rowSettings.get(i).defaultValue+" · Right-click to reset this option.")));
            // Rows are clipped to the list, so partly scrolled rows stay visible while the list glides.
            w.visible = matches && y + 18 > listTop - 4 && y < listBottom + 4;
        }
    }

    @Override
    public void renderBackground(GuiGraphics g, int mouseX, int mouseY, float partialTick) {
        smooth.clamp(Math.max(0, matchingCount() * ROW - (listBottom - listTop)));
        int s = smooth.get();
        if (s != scroll) { scroll = s; layout(); }
        super.renderBackground(g, mouseX, mouseY, partialTick);
        g.pose().pushMatrix();
        g.pose().translate(0, (1f - Motion.out(openedAt, 240f)) * 12f);
        Ui.panel(g, left - 10, listTop - 8, rowW + 20, listBottom - listTop + 14, 0xE0141419);
        g.fill(left - 10, listTop - 8, left - 8, listBottom + 6, Ui.ACCENT);
        g.enableScissor(left - 8, listTop - 4, left + rowW + 10, listBottom + 4);
        for (int i = 1; i < rows.size(); i++) {
            AbstractWidget w = rows.get(i);
            if (w.visible) Ui.rounded(g, left - 4, w.getY() - 3, rowW + 8, 25, Ui.PANEL);
            // A soft highlight on the row under the mouse.
            float h = rowAnim.get(i, w.visible && mouseY >= w.getY() - 2 && mouseY < w.getY() + 20 && mouseX >= left - 8 && mouseX < left + rowW + 8);
            if (h > 0.01f) g.fill(left - 6, w.getY() - 2, left + rowW + 6, w.getY() + 20, (int) (h * 24) << 24 | 0xFFFFFF);
        }
        g.disableScissor();
        g.pose().popMatrix();
    }

    @Override
    public void render(GuiGraphics g, int mouseX, int mouseY, float partialTick) {
        float p = Motion.out(openedAt, 240f);
        g.pose().pushMatrix();
        g.pose().translate(0, (1f - p) * 12f);
        super.render(g, mouseX, mouseY, partialTick);
        heading(g, module.category.label.toUpperCase() + " MODULE", module.name.toUpperCase(), width / 2, 10);
        Ui.centered(g, font, Ui.ellipsize(font, module.description, rowW), width / 2, 42, Ui.MUTED);
        Ui.centered(g, font, Ui.ellipsize(font, ModuleManager.saveStatus(),rowW), width / 2, 55, Ui.DIM);
        boolean inList = mouseY >= listTop - 4 && mouseY < listBottom + 4;
        g.enableScissor(left - 8, listTop - 4, left + rowW + 10, listBottom + 4);
        for (int i = 0; i < rows.size(); i++) {
            AbstractWidget w = rows.get(i);
            if (!w.visible) continue;
            w.render(g, inList ? mouseX : -1, inList ? mouseY : -1, partialTick);
            g.drawString(font, Ui.ellipsize(font, labels.get(i), w.getX() - left - 20), left + 3, w.getY() + 5, Ui.TEXT, false);
            if (rowSettings.get(i) instanceof Setting.Colour c) {
                g.fill(w.getX() - 14, w.getY() + 4, w.getX() - 4, w.getY() + 14, c.argb());
                g.renderOutline(w.getX() - 14, w.getY() + 4, 10, 10, Ui.LINE);
            }
        }
        g.disableScissor();
        Ui.scrollbar(g, left + rowW + 6, listTop, listBottom - listTop, scroll, Math.max(0, matchingCount() * ROW - (listBottom - listTop)));
        if(matchingCount()==0)Ui.centered(g,font,"No options match this search.",width/2,listTop+12,Ui.MUTED);
        if (ModuleManager.isServerBlocked(module.id)) Ui.centered(g, font, "This server has switched this module off.", width / 2, listBottom + 8, Ui.BAD);
        if (p < 1f) g.fill(left - 11, 0, left + rowW + 11, height, (int) ((1f - p) * 220) << 24 | 0x0C0B10);
        g.pose().popMatrix();
    }

    @Override
    public boolean mouseClicked(net.minecraft.client.input.MouseButtonEvent event, boolean doubleClick) {
        // A row scrolled half out of the list can't be clicked through the header or footer.
        boolean inList = event.y() >= listTop - 4 && event.y() < listBottom + 4;
        for (AbstractWidget w : rows) w.active = inList || !w.visible;
        rows.getFirst().active = inList && !module.isAlwaysEnabled() && !ModuleManager.isServerBlocked(module.id);
        if(inList && event.button()==1)for(int i=1;i<rows.size();i++){var w=rows.get(i);if(w.visible && Ui.inside(event.x(),event.y(),left,w.getY(),rowW,20)){rowSettings.get(i).reset();ModuleManager.save();rebuildWidgets();return true;}}
        boolean handled = super.mouseClicked(event, doubleClick);
        for (AbstractWidget w : rows) w.active = true;
        rows.getFirst().active = !module.isAlwaysEnabled() && !ModuleManager.isServerBlocked(module.id);
        return handled;
    }

    @Override
    public boolean mouseScrolled(double mouseX, double mouseY, double scrollX, double scrollY) {
        if (!Ui.inside(mouseX, mouseY, left - 8, listTop - 4, rowW + 18, listBottom - listTop + 8)) return super.mouseScrolled(mouseX, mouseY, scrollX, scrollY);
        smooth.by(-scrollY * ROW, Math.max(0, matchingCount() * ROW - (listBottom - listTop)));
        return true;
    }

    @Override
    public void onClose() {
        ModuleManager.save();
        minecraft.setScreen(parent);
    }
}
