package com.sloth.client.screen;

import com.sloth.client.module.HudModule;
import com.sloth.client.module.ModuleManager;
import net.minecraft.client.gui.GuiGraphics;
import com.sloth.client.screen.widget.SlothButton;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.input.MouseButtonEvent;
import net.minecraft.network.chat.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.ArrayDeque;
import java.util.Deque;
import net.minecraft.client.input.KeyEvent;
import org.lwjgl.glfw.GLFW;

/** Drag HUD modules around, scroll over one to resize it, right-click for its settings. */
public final class HudEditorScreen extends Screen {
    private static final int SNAP = 4;
    private final Screen parent;
    private HudModule dragging, selected;
    private SlothButton resetSelection;
    private boolean snapping = true, serverSample=false, safeZones=true;
    private boolean detailed;
    private final java.util.Set<HudModule> selection = new java.util.LinkedHashSet<>();
    private record Placement(HudModule module, float x, float y, double scale, String group) {}
    private final Deque<List<Placement>> undo = new ArrayDeque<>(), redo = new ArrayDeque<>();
    private List<Placement> dragStart;
    private List<Placement> snapshot() {
        return ModuleManager.hudModules().stream().map(h -> new Placement(h, h.x, h.y, h.scale.get(), h.group.get())).toList();
    }
    private void remember(List<Placement> before) {
        if (before == null || before.equals(snapshot())) return;
        undo.push(before); while (undo.size() > 64) undo.removeLast(); redo.clear();
    }
    private void restore(Deque<List<Placement>> from, Deque<List<Placement>> to) {
        if (dragging != null || from.isEmpty()) return;
        to.push(snapshot());
        for (Placement p : from.pop()) { p.module.x = p.x; p.module.y = p.y; p.module.scale.set(p.scale); p.module.group.set(p.group); }
        ModuleManager.save();
    }
    private void keepInside(HudModule h) {
        h.x = h.screenX(font, width, true) / (float) width;
        h.y = h.screenY(font, height, true) / (float) height;
    }
    private void groupSelection(boolean clear) { var before=snapshot();String name=clear?"":"Group-"+java.util.UUID.randomUUID().toString().substring(0,8);for(var h:moving())h.group.set(name);remember(before);ModuleManager.save(); }
    private List<HudModule> moving() { return selection.stream().filter(HudModule::isActive).toList(); }
    private void translateGroup(double dx, double dy) {
        var members = moving();
        for (HudModule m : members) { int x=m.screenX(font,width,true), y=m.screenY(font,height,true); dx=Math.max(-x,Math.min(width-m.width(font,true)-x,dx)); dy=Math.max(-y,Math.min(height-m.height(font,true)-y,dy)); }
        for (HudModule m : members) { m.x=(float)((m.screenX(font,width,true)+dx)/width); m.y=(float)((m.screenY(font,height,true)+dy)/height); }
    }
    private record Bounds(HudModule module,int x,int y,int w,int h) {}
    private record Zone(int x,int y,int w,int h,String name){}
    private boolean intersects(int x,int y,int w,int h,Zone z){return x<z.x+z.w&&x+w>z.x&&y<z.y+z.h&&y+h>z.y;}
    /** Conservative guides: server text size varies; these are editable-layout warnings, not forced movement. */
    private List<Zone> zones(){int tabW=Math.min(width-16,360),chatW=Math.min(width/2,320),sideW=Math.min(width/3,160);return List.of(new Zone(Math.max(0,width/2-94),Math.max(0,height-48),Math.min(188,width),48,"Hotbar / health"),new Zone(0,Math.max(0,height-125),chatW,Math.min(100,height),"Chat"),new Zone(width-sideW,Math.max(0,height/2-60),sideW,Math.min(120,height),"Scoreboard"),new Zone((width-tabW)/2,50,tabW,Math.min(90,Math.max(0,height-100)),"Tab overlay"));}
    private double grabX, grabY;
    private boolean snappedX, snappedY;
    /** Alignment guides to other panels while dragging (screen x / y positions). */
    private final List<Double> guidesX = new ArrayList<>(), guidesY = new ArrayList<>();
    private final Motion.Tracker hoverAnim = new Motion.Tracker(16f);
    private long openedAt;

    public HudEditorScreen(Screen parent) {
        super(net.minecraft.client.Minecraft.getInstance(), MenuFont.hud(), Component.literal("Edit HUD"));
        this.parent = parent;
    }

    @Override
    protected void init() {
        if (openedAt == 0) openedAt = System.currentTimeMillis();
        int cx = width / 2;
        int topWidth=Math.min(110,(width-24)/3);
        addRenderableWidget(new SlothButton(6,30,topWidth,18,Component.literal("Manual placement"),SlothButton.Style.NORMAL,b->{HudModule target=selected!=null?selected:editable().stream().findFirst().orElse(null);if(target!=null)minecraft.setScreen(new HudPlacementScreen(this,target,this::manualEdit));}));
        addRenderableWidget(new SlothButton(width-6-topWidth,30,topWidth,18,Component.literal("Screen previews"),SlothButton.Style.NORMAL,b->minecraft.setScreen(new HudResolutionScreen(this))));
        addRenderableWidget(new SlothButton(cx-topWidth/2,30,topWidth,18,Component.literal("Safe zones: ON"),SlothButton.Style.NORMAL,b->{safeZones=!safeZones;b.setMessage(Component.literal(safeZones?"Safe zones: ON":"Safe zones: OFF"));}));
        addRenderableWidget(new SlothButton(6,6,112,20,Component.literal("Server text sample"),SlothButton.Style.NORMAL,b->{serverSample=!serverSample;}));
        addRenderableWidget(new SlothButton(6,54,topWidth,18,Component.literal("Arrange HUDs"),SlothButton.Style.NORMAL,b->{var chosen=moving();if(chosen.isEmpty())chosen=editable();var picked=List.copyOf(chosen);var obstacles=new ArrayList<com.sloth.client.studio.HudPacking.Box>();for(var m:editable())if(!picked.contains(m))obstacles.add(new com.sloth.client.studio.HudPacking.Box(m.screenX(font,width,true),m.screenY(font,height,true),m.width(font,true)+4,m.height(font,true)+4));if(safeZones)for(var z:zones())obstacles.add(new com.sloth.client.studio.HudPacking.Box(z.x,z.y,z.w,z.h));minecraft.setScreen(new HudArrangeScreen(this,picked,obstacles,this::manualEdit));}));
        // Keep controls away from the centre of the preview, where modules are easiest to place.
        int toolbarY = Math.max(8, height - 48);
        int bw=Math.min(100,(width-20)/3),base=cx-(3*bw+8)/2;
        if(width>=620){addRenderableWidget(new SlothButton(cx-86,6,84,20,Component.literal("Group selection"),SlothButton.Style.NORMAL,b->groupSelection(false)));addRenderableWidget(new SlothButton(cx+2,6,84,20,Component.literal("Ungroup"),SlothButton.Style.NORMAL,b->groupSelection(true)));}
        addRenderableWidget(new SlothButton(base, toolbarY, bw, 18, Component.literal("Undo"), SlothButton.Style.NORMAL, b -> restore(undo,redo)));
        resetSelection = addRenderableWidget(new SlothButton(base+bw+4, toolbarY, bw, 18, Component.literal("Reset selected"), SlothButton.Style.NORMAL, b -> {
            var targets=moving();
            if(targets.isEmpty() || dragging!=null)return;
            List<Placement> before = snapshot();
            for (HudModule h : targets) h.resetPosition();
            remember(before);
            ModuleManager.save();
        }));
        resetSelection.setTooltip(net.minecraft.client.gui.components.Tooltip.create(Component.literal("Reset selected active HUD positions. Ctrl+A selects all; Ctrl+Z undoes. Shift-click changes selection; Ctrl+G groups; Ctrl+Shift+G ungroups. Red outlines mark overlaps or safe zones.")));
        addRenderableWidget(new SlothButton(base+2*(bw+4), toolbarY, bw, 18, Component.literal("Done"), SlothButton.Style.PRIMARY, b -> onClose()));
        addRenderableWidget(new SlothButton(base, toolbarY + 22, bw, 18, Component.literal(detailed?"Fewer options":"More options"), SlothButton.Style.NORMAL, b -> {detailed=!detailed;rebuildWidgets();}));
        addRenderableWidget(new SlothButton(base+bw+4, toolbarY + 22, bw, 18, Component.literal("Redo"), SlothButton.Style.NORMAL, b -> restore(redo, undo)));
        addRenderableWidget(new SlothButton(base+2*(bw+4), toolbarY + 22, bw, 18, Component.literal(snapping ? "Snap: ON" : "Snap: OFF"), SlothButton.Style.NORMAL, b -> { snapping = !snapping; b.setMessage(Component.literal(snapping ? "Snap: ON" : "Snap: OFF")); }));
        addRenderableWidget(new SlothButton(Math.max(6,width-116),6,110,20,Component.literal("Live inspector"),SlothButton.Style.NORMAL,b->{HudModule target=selected!=null?selected:editable().stream().findFirst().orElse(null);if(target!=null)minecraft.setScreen(new HudInspectorScreen(this,target));}));
        for(var child:children())if(child instanceof net.minecraft.client.gui.components.AbstractWidget widget){String name=widget.getMessage().getString();if(java.util.Set.of("Screen previews","Server text sample","Arrange HUDs","Group selection","Ungroup","Redo","Live inspector").contains(name)||name.startsWith("Safe zones:")||name.startsWith("Snap:"))widget.visible=detailed;}
    }

    void manualEdit(Runnable edit) { var before=snapshot();edit.run();remember(before); }

    private List<HudModule> editable() {
        return ModuleManager.hudModules().stream().filter(HudModule::isActive).toList();
    }

    private HudModule at(double mx, double my) {
        List<HudModule> list = editable();
        for (int i = list.size() - 1; i >= 0; i--) {
            HudModule h = list.get(i);
            int x = h.screenX(font, width, true), y = h.screenY(font, height, true);
            if (Ui.inside(mx, my, x, y, h.width(font, true), h.height(font, true))) return h;
        }
        return null;
    }

    @Override
    public void render(GuiGraphics g, int mouseX, int mouseY, float partialTick) {
        float in = Motion.out(openedAt, 220f);
        g.fill(0, 0, width, height, (int) (0x60 * in) << 24);
        // Pink editing grid, every 40 px.
        int gridColour = (int) (0x1C * in) << 24 | (Ui.ACCENT & 0xFFFFFF);
        for (int gx = 0; gx < width; gx += 40) g.fill(gx, 0, gx + 1, height, gridColour);
        for (int gy = 0; gy < height; gy += 40) g.fill(0, gy, width, gy + 1, gridColour);
        Ui.panel(g, Math.max(4, width / 2 - 170), height - 70, Math.min(width - 8, 340), 66, Ui.BG);
        g.fill(width / 2, 0, width / 2 + 1, height, (int) (0x30 * in) << 24 | 0xFFFFFF);
        g.fill(0, height / 2, width, height / 2 + 1, (int) (0x30 * in) << 24 | 0xFFFFFF);
        if (dragging != null) {
            if (snappedX) g.fill(width / 2, 0, width / 2 + 1, height, Ui.ACCENT);
            if (snappedY) g.fill(0, height / 2, width, height / 2 + 1, Ui.ACCENT);
            for (double gx : guidesX) g.fill((int) Math.round(gx), 0, (int) Math.round(gx) + 1, height, Ui.warm(0xCCFF6A2A));
            for (double gy : guidesY) g.fill(0, (int) Math.round(gy), width, (int) Math.round(gy) + 1, Ui.warm(0xCCFF6A2A));
        }
        var active=editable();var safe= detailed && safeZones ? zones() : List.<Zone>of();
        resetSelection.active=dragging==null&&!moving().isEmpty();
        for(var zone:safe){g.fill(zone.x,zone.y,zone.x+zone.w,zone.y+zone.h,0x16FF6DB5);g.renderOutline(zone.x,zone.y,zone.w,zone.h,0x66FF6DB5);g.drawString(font,Ui.ellipsize(font,zone.name,zone.w-6),zone.x+3,zone.y+3,0xFF83D9E6,false);}
        var boxes=new ArrayList<Bounds>();
        for(var h:active){h.render(g,font,true);boxes.add(new Bounds(h,h.screenX(font,width,true),h.screenY(font,height,true),h.width(font,true),h.height(font,true)));}
        var overlapping=new java.util.HashSet<HudModule>();int pairs=0;
        if(detailed)for(int i=0;i<boxes.size();i++)for(int j=i+1;j<boxes.size();j++){var x=boxes.get(i);var y=boxes.get(j);if(x.x<y.x+y.w&&x.x+x.w>y.x&&x.y<y.y+y.h&&x.y+x.h>y.y){pairs++;overlapping.add(x.module);overlapping.add(y.module);}}
        HudModule hover=dragging;
        if(hover==null)for(int i=boxes.size()-1;i>=0;i--){var box=boxes.get(i);if(Ui.inside(mouseX,mouseY,box.x,box.y,box.w,box.h)){hover=box.module;break;}}
        for(var box:boxes){var h=box.module;int x=box.x,y=box.y,w=box.w,hh=box.h;
            float t=hoverAnim.get(h.id,h==hover||selection.contains(h));
            if(t>0.02f)g.renderOutline(x-2,y-2,w+4,hh+4,(int)(t*90)<<24|(Ui.ACCENT&0xFFFFFF));
            boolean warning=overlapping.contains(h);for(var zone:safe)if(intersects(x,y,w,hh,zone)){warning=true;break;}
            g.renderOutline(x-1,y-1,w+2,hh+2,warning?Ui.BAD:SlothTheme.lerp(0x80FFFFFF,Ui.ACCENT,t));
            if(t>0.05f)g.drawString(font,h.name+"  "+Math.round(h.scale.f()*100)+"%",x,Math.max(0,y-10),(int)(t*255)<<24|(Ui.ACCENT_SOFT&0xFFFFFF),true);
        }
        if(serverSample){int sw=Math.min(180,width-16),sx=width/2-sw/2;Ui.panel(g,sx,34,sw,48,0xAA15121B);g.drawCenteredString(minecraft.font,"SERVER TEXT SAMPLE",width/2,39,Ui.MUTED);g.drawCenteredString(minecraft.font,Component.literal("[MVP] Player123").withStyle(net.minecraft.ChatFormatting.AQUA),width/2,54,Ui.TEXT);g.drawCenteredString(minecraft.font,"Server fonts depend on its resource pack",width/2,69,Ui.MUTED);}
        super.render(g, mouseX, mouseY, partialTick);
        int instructionY = Math.max(8, height - 64);
        g.drawCenteredString(font, Ui.ellipsize(font, detailed?pairs+" overlaps · "+moving().size()+" selected · Ctrl+A select all":"Drag: move · Scroll: size · Right-click: settings", Math.min(width - 12, 328)), width / 2, instructionY, Ui.MUTED);
        if (active.isEmpty()) g.drawCenteredString(font, "No HUD modules are on. Enable some in the Mod Menu.", width / 2, instructionY - 12, Ui.MUTED);
    }

    @Override
    public void renderBackground(GuiGraphics g, int mouseX, int mouseY, float partialTick) {
        // The world stays visible behind the editor.
    }

    @Override
    public boolean mouseClicked(MouseButtonEvent event, boolean doubleClick) {
        if (super.mouseClicked(event, doubleClick)) return true;
        HudModule h = at(event.x(), event.y());
        if (h == null) return false;
        selected = h;
        if (event.button() == 1) { minecraft.setScreen(new ModuleSettingsScreen(this, h)); return true; }
        if (event.button() != 0) return false;
        boolean shift=(event.modifiers()&GLFW.GLFW_MOD_SHIFT)!=0;
        if(shift){if(!selection.remove(h))selection.add(h);return true;}
        if(!selection.contains(h)){selection.clear();selection.add(h);if(!h.group.get().isBlank())for(var m:editable())if(m.group.get().equals(h.group.get()))selection.add(m);}
        dragStart = snapshot();
        dragging = h;
        grabX = event.x() - h.screenX(font, width, true);
        grabY = event.y() - h.screenY(font, height, true);
        return true;
    }

    @Override
    public boolean mouseDragged(MouseButtonEvent event, double dx, double dy) {
        if (dragging == null) return super.mouseDragged(event, dx, dy);
        int w = dragging.width(font, true), h = dragging.height(font, true);
        double nx = Math.max(0, Math.min(width - w, event.x() - grabX));
        double ny = Math.max(0, Math.min(height - h, event.y() - grabY));
        if (snapping && nx < SNAP) nx = 0;
        if (snapping && ny < SNAP) ny = 0;
        if (snapping && width - w - nx < SNAP) nx = width - w;
        if (snapping && height - h - ny < SNAP) ny = height - h;
        snappedX = snapping && Math.abs(nx + w / 2.0 - width / 2.0) < SNAP;
        snappedY = snapping && Math.abs(ny + h / 2.0 - height / 2.0) < SNAP;
        if (snappedX) nx = width / 2.0 - w / 2.0;
        if (snappedY) ny = height / 2.0 - h / 2.0;
        // Line up with other panels: matching edges, sitting side by side, or sharing a centre.
        guidesX.clear();
        guidesY.clear();
        for (HudModule o : editable()) {
            if (!snapping || o==dragging || selection.contains(o)) continue;
            int ox = o.screenX(font, width, true), oy = o.screenY(font, height, true), ow = o.width(font, true), oh = o.height(font, true);
            if (!snappedX && guidesX.isEmpty()) {
                double[][] xs = {{ox, nx}, {ox + ow, nx + w}, {ox + ow + 8, nx}, {ox - 8, nx + w}, {ox + ow / 2.0, nx + w / 2.0}};
                for (double[] c : xs) if (Math.abs(c[0] - c[1]) < SNAP) { nx += c[0] - c[1]; guidesX.add(c[0]); break; }
            }
            if (!snappedY && guidesY.isEmpty()) {
                double[][] ys = {{oy, ny}, {oy + oh, ny + h}, {oy + oh + 8, ny}, {oy - 8, ny + h}, {oy + oh / 2.0, ny + h / 2.0}};
                for (double[] c : ys) if (Math.abs(c[0] - c[1]) < SNAP) { ny += c[0] - c[1]; guidesY.add(c[0]); break; }
            }
        }
        translateGroup(nx-dragging.screenX(font,width,true),ny-dragging.screenY(font,height,true));
        return true;
    }

    @Override
    public boolean mouseReleased(MouseButtonEvent event) {
        if (dragging != null) { remember(dragStart); dragStart = null; dragging = null; guidesX.clear(); guidesY.clear(); ModuleManager.save(); return true; }
        return super.mouseReleased(event);
    }

    @Override
    public boolean mouseScrolled(double mouseX, double mouseY, double scrollX, double scrollY) {
        HudModule h = at(mouseX, mouseY);
        if (h == null) return false;
        List<Placement> before = snapshot(); selected = h;
        if(!selection.contains(h)){selection.clear();selection.add(h);if(!h.group.get().isBlank())for(var m:editable())if(m.group.get().equals(h.group.get()))selection.add(m);}
        double ratio=(h.scale.get()+Math.signum(scrollY)*.05)/h.scale.get();var members=moving();int anchorX=members.stream().mapToInt(m->m.screenX(font,width,true)).min().orElse(0),anchorY=members.stream().mapToInt(m->m.screenY(font,height,true)).min().orElse(0);
        for(var m:members){double scale=m.scale.get()*ratio;if(scale<m.scale.min||scale>m.scale.max||anchorX+(m.screenX(font,width,true)-anchorX+m.width(font,true))*ratio>width||anchorY+(m.screenY(font,height,true)-anchorY+m.height(font,true))*ratio>height)return true;}
        for(var m:members){int ox=m.screenX(font,width,true),oy=m.screenY(font,height,true);m.scale.set(m.scale.get()*ratio);m.x=(float)((anchorX+(ox-anchorX)*ratio)/width);m.y=(float)((anchorY+(oy-anchorY)*ratio)/height);keepInside(m);} remember(before);
        ModuleManager.save();
        return true;
    }

    @Override
    public boolean keyPressed(KeyEvent event) {
        boolean control = (event.modifiers() & GLFW.GLFW_MOD_CONTROL) != 0;
        boolean shift = (event.modifiers() & GLFW.GLFW_MOD_SHIFT) != 0;
        if(control && event.key()==GLFW.GLFW_KEY_A && dragging==null){selection.clear();selection.addAll(editable());selected=selection.stream().findFirst().orElse(null);return true;}
        if (control && event.key()==GLFW.GLFW_KEY_G && dragging==null) { var before=snapshot(); String group=shift ? "" : "Group-"+java.util.UUID.randomUUID().toString().substring(0,8); for(var m:moving())m.group.set(group);remember(before);ModuleManager.save();return true; }
        if (control && event.key() == GLFW.GLFW_KEY_Z) { restore(shift ? redo : undo, shift ? undo : redo); return true; }
        if (control && event.key() == GLFW.GLFW_KEY_Y) { restore(redo, undo); return true; }
        if (selected != null && dragging == null) {
            int dx = event.key() == GLFW.GLFW_KEY_LEFT ? -1 : event.key() == GLFW.GLFW_KEY_RIGHT ? 1 : 0;
            int dy = event.key() == GLFW.GLFW_KEY_UP ? -1 : event.key() == GLFW.GLFW_KEY_DOWN ? 1 : 0;
            if (dx != 0 || dy != 0) {
                List<Placement> before = snapshot(); int step = shift ? 10 : 1;
                translateGroup(dx*step,dy*step);remember(before); ModuleManager.save(); return true;
            }
        }
        return super.keyPressed(event);
    }

    @Override
    public void onClose() {
        ModuleManager.save();
        minecraft.setScreen(parent);
    }

    @Override
    public boolean isPauseScreen() { return false; }
}
