package com.sloth.client.screen;



import com.sloth.client.module.Module;

import com.sloth.client.module.*;

import com.sloth.client.studio.*;

import net.minecraft.client.gui.GuiGraphics;

import net.minecraft.client.gui.components.EditBox;

import net.minecraft.client.gui.screens.Screen;

import net.minecraft.client.gui.screens.ConfirmScreen;

import net.minecraft.network.chat.Component;

import java.util.*;

import java.time.*;

import java.time.format.DateTimeFormatter;



/** A responsive, keyboard-accessible home for the client tools. */

public final class StudioScreen extends SlothScreen {

    public enum Page { HOME, HUD, CONTROLS, SAVED, ADVANCED, EXTRAS, SETUP, SEARCH, PERFORMANCE, HISTORY, SERVERS, CAPTURE, PINS, FOCUS, LAYOUT, KEYS, SESSIONS, TRACES, COMPARE, ADDONS, INSPECT, STARTUP }

    private record Action(String label, String detail, Runnable run) {}

    private final Screen parent;

    private Page page;
    private final Deque<Page> navigation = new ArrayDeque<>();
    private com.sloth.client.screen.widget.SlothButton previousButton,nextButton;

    private int left, top, w, h, listTop, perPage, offset, rowStep = 44;

    private String query = "", status = "";

    private EditBox search;

    private List<Action> actions = List.of();

    private final List<com.sloth.client.screen.widget.SlothButton> buttons = new ArrayList<>();

    private FrameStats.Stats stats = FrameStats.read();

    private long sampled;

    private com.google.gson.JsonObject comparison;



    public StudioScreen(Screen parent, Page page) { super(Component.literal("Sloth menu")); this.parent = parent; this.page = page; }

    static Screen home(Screen parent) {
        return new ClientOverlayScreen(parent);
    }

    private void open(Page p) { if(p==Page.HOME){minecraft.setScreen(home(parent));return;}if(p!=page)navigation.push(page);page = p; offset = 0; status = ""; rebuildWidgets(); }

    @Override protected void init() {
        if(page==Page.HOME){minecraft.setScreen(home(parent));return;}

        w = Math.min(560, width - 24); h = Math.min(420, height - 20);

        left = (width - w) / 2; top = (height - h) / 2;

        rowStep = Preferences.compact() ? 34 : 44; listTop = top + 78; perPage = Math.max(1, (h - 125) / rowStep);

        button(left + w - 88, top + 12, 74, 20, "Client menu", b -> open(Page.HOME)).visible=page!=Page.HOME;
        button(left+w-160,top+12,66,20,"Search",b->open(Page.SEARCH));

        if (page == Page.SEARCH) {

            search = new EditBox(font, left + 14, top + 48, w - 28, 22, Component.literal("Search all client tools"));

            search.setMaxLength(80); search.setValue(query); search.setHint(Component.literal("Search modules, settings, keybinds or tools..."));

            search.setResponder(s -> { query = s; offset = 0; refresh(); }); addRenderableWidget(search); setInitialFocus(search);

        }

        buttons.clear();

        for (int i = 0; i < perPage; i++) {

            final int index = i;

            buttons.add(button(left + 14, listTop + i * rowStep, w - 28, Preferences.compact() ? 18 : 24, "", b -> {

                int selected = offset + index;

                if (selected < actions.size()) actions.get(selected).run().run();

            }));

        }

        previousButton=button(left + 14, top + h - 30, 54, 20, "Previous", b -> { offset = Math.max(0, offset - perPage); refresh(); });

        nextButton=button(left + 74, top + h - 30, 54, 20, "Next", b -> { if (offset + perPage < actions.size()) offset += perPage; refresh(); });

        primary(left + w - 106, top + h - 30, 92, 20, "Back", b -> onClose());

        refresh();

    }

    private Action action(String label, String detail, Runnable run) { return new Action(label, detail, run); }

    private void refresh() {

        List<Action> out = new ArrayList<>();

        switch (page) {

            case HOME -> {
                out.add(action("Edit HUD", "Move or resize the information on your screen.", () -> minecraft.setScreen(new HudEditorScreen(this))));
                out.add(action("Crosshair", "Change its shape, size or colour.", () -> minecraft.setScreen(new CrosshairStudioScreen(this))));
                out.add(action("Features", "Turn Zoom, Freelook and other features on or off.", () -> minecraft.setScreen(new ModMenuScreen(this))));
                out.add(action("Settings", "Everyday options, video settings and keyboard shortcuts.", () -> minecraft.setScreen(new SettingsScreen(this))));
                out.add(action("More tools", "Appearance, saved layouts and help when you need them.", () -> open(Page.ADVANCED)));
            }
            case HUD -> {
                out.add(action("Move and resize HUD", "Open the HUD editor. Drag panels or enter exact positions.", () -> minecraft.setScreen(new HudEditorScreen(this))));
                out.add(action("Crosshair", "Preview shapes, size and automatic ore colours.", () -> minecraft.setScreen(new CrosshairStudioScreen(this))));
                out.add(action("Fonts, colours & motion", "Change the look without changing gameplay controls.", () -> minecraft.setScreen(new AppearanceStudioScreen(this))));
                out.add(action("Accessibility", "Preview larger text, contrast and reduced motion.", () -> minecraft.setScreen(new AccessibilityStudioScreen(this))));
                out.add(action("Inspect a HUD", "Preview and configure one panel at a time.", () -> open(Page.INSPECT)));
            }
            case CONTROLS -> {
                out.add(action("Keyboard shortcuts", "Find C Zoom, Left Alt Freelook and menu shortcuts.", () -> minecraft.setScreen(SettingsScreen.openSearch(this,"CONTROLS",""))));
                out.add(action("Features", "Common features first. Use All or search for the full library.", () -> minecraft.setScreen(new ModMenuScreen(this))));
                out.add(action("Quick controls", "Choose which features appear on your quick toolbar.", () -> open(Page.PINS)));
                out.add(action("Focus mode", "Temporarily hide distractions without changing saved settings.", () -> open(Page.FOCUS)));
                out.add(action("Shared shortcuts", "Check whether multiple features use the same key.", () -> open(Page.KEYS)));
            }
            case SAVED -> {
                out.add(action("My profiles", "Save and manage named versions of your setup.", () -> minecraft.setScreen(new ProfilesScreen(this))));
                out.add(action("Starter layouts", "Preview a layout before choosing it.", () -> open(Page.SETUP)));
                out.add(action("Undo recent changes", "Review a previous setup before restoring it.", () -> open(Page.HISTORY)));
                out.add(action("Layouts for each server", "Optionally associate a saved profile with a server.", () -> open(Page.SERVERS)));
                out.add(action("Compare changes", "Inspect differences from a previous saved setup.", () -> open(Page.COMPARE)));
            }
            case ADVANCED -> {
                out.add(action("Appearance", "Fonts, colours, motion and accessibility.", () -> open(Page.HUD)));
                out.add(action("Saved layouts", "Save, restore or choose a setup.", () -> open(Page.SAVED)));
                out.add(action("Performance information", "FPS samples, video options and comparisons.", () -> open(Page.PERFORMANCE)));
                out.add(action("Quick controls", "Toolbar, focus mode and shared shortcuts.", () -> open(Page.CONTROLS)));
                out.add(action("Help & extras", "Server display help, connection health and diagnostics.", () -> open(Page.EXTRAS)));
            }
            case EXTRAS -> {
                out.add(action("Server tags & resource packs", "Help with missing badges, fonts or pack downloads.", () -> minecraft.setScreen(new ServerDisplayScreen(this))));
                out.add(action("Connection health", "Latency history and recent disconnect clues.", () -> minecraft.setScreen(new ConnectionHealthScreen(this))));
                out.add(action("Startup & loaded mods", "See which mods this game actually loaded.", () -> open(Page.STARTUP)));
                out.add(action("Photo controls", "Clean framing and normal Minecraft camera views.", () -> open(Page.CAPTURE)));
                out.add(action("Performance diagnostics", "Review local troubleshooting traces.", () -> open(Page.TRACES)));
                out.add(action("Interface preferences", "Menu density and layout preferences.", () -> open(Page.LAYOUT)));
                out.add(action("Optional UI addons", "Review permissions before approving an addon.", () -> open(Page.ADDONS)));
            }
            case SETUP -> {

                for (String name : Studio.PRESETS.keySet()) out.add(action("Preview " + name, presetNames(name), () -> minecraft.setScreen(new PresetPreviewScreen(this, name))));

                out.add(action("Keep my current setup", "Finish setup without changing your layout.", () -> { Studio.finishSetup(); open(Page.HOME); }));

            }

            case SEARCH -> {

                String q = query.trim().toLowerCase(Locale.ROOT);

                List<Action> all = new ArrayList<>();

                for (Module m : ModuleManager.all()) {

                    all.add(action(m.name, m.category.label + " · " + m.description, () -> minecraft.setScreen(new ModuleSettingsScreen(this, m))));

                    for (Setting<?> s : m.settings()) all.add(action(m.name + " / " + s.name, s.explanation(), () -> minecraft.setScreen(new ModuleSettingsScreen(this, m, s.id))));

                }

                for (var entry : SettingsScreen.searchEntries(this)) all.add(action(entry.label(), "Minecraft / Sloth settings and controls", entry.open()));

                for (Page p : Page.values()) if(p!=Page.HOME&&p!=Page.SEARCH) all.add(action(title(p), "Studio tool", () -> open(p)));

                if(q.isEmpty()) {
                    for(String id:List.of("zoom","freelook","crosshair")){Module m=ModuleManager.get(id);if(m!=null)out.add(action(m.name,"Open its everyday options.",()->minecraft.setScreen(new ModuleSettingsScreen(this,m))));}
                    out.add(action("Move and resize HUD","Open the HUD editor.",()->minecraft.setScreen(new HudEditorScreen(this))));
                } else for (Action a : all) if ((a.label() + " " + a.detail()).toLowerCase(Locale.ROOT).contains(q)) out.add(a);

                out.sort(Comparator.comparing(Action::label, String.CASE_INSENSITIVE_ORDER));

            }

            case PERFORMANCE -> {

                listTop = top + (h < 310 ? 126 : 204); perPage = Math.max(1, (top + h - 52 - listTop) / rowStep);

                for (int i = 0; i < buttons.size(); i++) buttons.get(i).setY(listTop + i * rowStep);

                out.add(action("Open video settings", "Try one change at a time and compare another gameplay sample.", () -> minecraft.setScreen(SettingsScreen.openSearch(this, "PERFORMANCE", ""))));

                out.add(action("Start a fresh sample", "Clear the previous 600 frames. Close Studio and play to collect data.", () -> { FrameStats.clear(); stats = FrameStats.read(); status = "Sample cleared. Close Studio and play for a few seconds."; }));

                out.add(action("Frame budget: "+Preferences.budget()+" FPS", "Cycle a target. The budget is guidance; it does not change the FPS limit.",()->{status=Preferences.nextBudget()?"Frame budget saved.":"Could not save budget.";refresh();}));

                out.add(action("Save session sample","Compare this sample with a later session.",()->status=Insights.saveSession()));

                out.add(action("Compare saved sessions","Local medians, p95 and selected configuration values.",()->open(Page.SESSIONS)));

            }

            case HISTORY -> {

                for (var e : SettingsHistory.entries()) {

                    String time = DateTimeFormatter.ofPattern("MMM d · HH:mm:ss").format(Instant.ofEpochMilli(e.time()).atZone(ZoneId.systemDefault()));

                    out.add(action("Restore setup before " + time, changes(e.setup()), () -> minecraft.setScreen(new SetupReviewScreen(this,"History: "+time,e.setup()))));

                }

            }

            case SERVERS -> {

                if (!Studio.server().isEmpty()) {

                    out.add(action("Turn automatic loading off", "Current association: " + (Studio.assigned().isEmpty() ? "Off" : Studio.assigned()), () -> { Studio.assign(""); status = "Automatic loading disabled for this server."; refresh(); }));

                    for (String p : ModuleManager.profiles()) out.add(action("Use " + p + " on this server", "Next connection loads this profile; leaving restores the prior setup.", () -> minecraft.setScreen(new ConfirmScreen(yes -> {

                        if (yes) { Studio.assign(p); status = "Assigned " + p + ". Applies next connection."; }

                        minecraft.setScreen(this);

                    }, Component.literal("Use " + p + " automatically?"), Component.literal(Studio.server() + ". Save profile edits explicitly; leaving restores your previous setup.")))));

                    out.add(action("Save a named profile first", "Create a profile to associate with this server.", () -> minecraft.setScreen(new ProfilesScreen(this))));

                }

            }

            case CAPTURE -> {

                out.add(action(PhotoMode.active ? "End photo mode" : "Start photo mode", "Temporarily hide the HUD. Your FOV and viewpoint restore on exit.", () -> { if (PhotoMode.active) PhotoMode.stop(); else PhotoMode.start(); refresh(); }));

                out.add(action("Cycle camera viewpoint", "First person, third person back, third person front.", () -> { if (PhotoMode.active) PhotoMode.viewpoint(); else status = "Start photo mode first."; }));

                out.add(action("Narrow field of view", "Reduce FOV by 5 degrees while photo mode is active.", () -> { if (PhotoMode.active) PhotoMode.fov(-5); }));

                out.add(action("Widen field of view", "Increase FOV by 5 degrees while photo mode is active.", () -> { if (PhotoMode.active) PhotoMode.fov(5); }));

                out.add(action("Composition guides: " + (PhotoMode.guides ? "On" : "Off"), "Rule-of-thirds guides. Turn off before F2; guides appear in screenshots.", () -> { if (PhotoMode.active) PhotoMode.guides = !PhotoMode.guides; refresh(); }));

                out.add(action("Frame the shot", "Close Studio, move normally and press F2. F8 reopens Studio.", () -> minecraft.setScreen(null)));

                out.add(action("Open this instance's screenshots", "Organize, preview and export them in the launcher's Screenshots page.", () -> net.minecraft.util.Util.getPlatform().openFile(minecraft.gameDirectory.toPath().resolve("screenshots").toFile())));

            }

            case PINS -> {

                for(Module m:ModuleManager.all())out.add(action((Preferences.ids("pins").contains(m.id)?"Unpin ":"Pin ")+m.name,"F9 opens quick controls · up to eight pins",()->{status=Preferences.toggleId("pins",m.id)?"Quick controls updated.":"Could not save, or all eight slots are occupied.";refresh();}));

            }

            case FOCUS -> {

                out.add(action("Distraction-free mode: "+(TemporaryControls.focus?"On":"Off"),"Temporarily hide selected HUDs and new Sloth event toasts.",()->{TemporaryControls.focus=!TemporaryControls.focus;refresh();}));

                out.add(action("Bind hold overrides","Hold for 25% master volume or hidden Sloth HUD; releasing restores.",()->minecraft.setScreen(SettingsScreen.openSearch(this,"CONTROLS","Hold"))));

                for(HudModule m:ModuleManager.hudModules())out.add(action((Preferences.ids("focusHud").contains(m.id)?"Hide ":"Keep ")+m.name,"Choose which HUDs distraction-free mode hides. Click to change.",()->{status=Preferences.toggleId("focusHud",m.id)?"Focus selection saved.":"Could not save selection.";refresh();}));

            }

            case LAYOUT -> {

                out.add(action("Layout density: "+(Preferences.compact()?"Compact":"Comfortable"),"Changes module-card spacing and Studio row density.",()->{status=Preferences.toggle("compact")?"Layout saved.":"Could not save layout.";rebuildWidgets();}));

                out.add(action("Edit HUD layout","Place elements visually and inspect the selected element.",()->minecraft.setScreen(new HudEditorScreen(this))));

                out.add(action("Minecraft GUI scale","Use Minecraft's video menu to change overall scale.",()->minecraft.setScreen(new net.minecraft.client.gui.screens.options.VideoSettingsScreen(this,minecraft,minecraft.options))));

            }

            case KEYS -> {
                out.add(action("Search all shortcuts", "Find and rebind any Minecraft or mod shortcut.", () -> minecraft.setScreen(new BindingScreen(this,null))));

                out.add(action("Open Minecraft controls","Resolve any vanilla or third-party mapping in its controls screen.",()->minecraft.setScreen(new net.minecraft.client.gui.screens.options.controls.KeyBindsScreen(this,minecraft.options))));

                for(var c:KeyConflicts.list())for(var k:c.mappings())out.add(action(c.key()+" / "+KeyConflicts.name(k),"Shared with "+c.mappings().stream().filter(other->other!=k).map(KeyConflicts::name).reduce((a,b)->a+", "+b).orElse(""),()->minecraft.setScreen(new BindingScreen(this,k))));

            }

            case SESSIONS -> {

                out.add(action("Save current session sample","Requires at least 60 gameplay frames.",()->{status=Insights.saveSession();refresh();}));

                var current=Insights.sessions();

                for(int i=current.size()-1;i>=0;i--){var e=current.get(i);out.add(action("Compare sample "+(i+1)+" with current","Click for timing and settings differences. Comparable workloads matter.",()->{var now=new com.google.gson.JsonObject();var s=FrameStats.read();now.addProperty("median",s.median());now.addProperty("p95",s.p95());now.addProperty("renderDistance",minecraft.options.renderDistance().get());now.addProperty("fpsLimit",minecraft.options.framerateLimit().get());if(s.count()<60)status="Collect at least 60 gameplay frames before comparing.";else showDetail("Session comparison",Insights.compare(e,now)+". Samples reflect recent frames, not the entire session. Compare similar locations and workloads.");}));}

            }

            case TRACES -> {
                out.add(action("Freelook recording: "+(FreelookDiagnostics.enabled()?"On":"Off"),"Optional camera and name-tag counts. No names, chat or server addresses.",()->{Preferences.toggle("freelookDiagnostics");refresh();}));
                out.add(action("Review Freelook observations",FreelookDiagnostics.summary(),()->showDetail("Freelook observations",FreelookDiagnostics.summary()+". Hidden names may reflect HUD, distance, invisibility or server team rules. Availability does not prove a name was drawn through blocks.")));
                out.add(action("Save Freelook diagnostic","Save up to 120 local observations for support.",()->{status="Saving camera observations...";FreelookDiagnostics.save().whenComplete((result,error)->minecraft.execute(()->status=error==null?"Saved freelook-diagnostics.json in your Sloth config folder.":"Could not save camera observations."));}));
                out.add(action("Clear Freelook observations","Clear recorded camera samples; settings stay unchanged.",()->{FreelookDiagnostics.clear();refresh();}));

                out.add(action("Stutter recorder: "+(Insights.armed?"Armed":"Off"),"Save on a ≥100 ms frame; max once per minute, latest ten traces.",()->{Insights.armed=!Insights.armed;refresh();}));

                out.add(action("Save recent timing trace","Local frame intervals and selected configuration; no chat or accounts.",()->status=Insights.trace()));

                out.add(action("Open trace folder","performance-traces.json contains the latest ten bounded traces.",()->net.minecraft.util.Util.getPlatform().openFile(net.fabricmc.loader.api.FabricLoader.getInstance().getConfigDir().resolve("sloth-client").toFile())));

                for(var e:Insights.traces())out.add(action("Trace: "+e.get("count")+" frames", "Click for the recorded timing summary.",()->showDetail("Timing trace",Insights.compare(e,e)+". This is the recorded summary; timing alone does not identify the cause of a stutter.")));

            }

            case STARTUP -> {

                var mods=new ArrayList<>(net.fabricmc.loader.api.FabricLoader.getInstance().getAllMods());

                mods.sort(Comparator.comparing(m->m.getMetadata().getName(),String.CASE_INSENSITIVE_ORDER));

                for(var mod:mods){var meta=mod.getMetadata();out.add(action(meta.getName()+" · "+meta.getVersion().getFriendlyString(),meta.getId()+" · "+meta.getDescription(),()->showDetail(meta.getName(),"Loaded by Fabric: "+meta.getId()+" "+meta.getVersion().getFriendlyString()+". "+meta.getDescription())));}

            }

            case COMPARE -> {

                out.add(action("Mark this setup as working","Save an explicit recovery baseline after you are happy with your setup.",()->status=WorkingSetup.mark()?"Working setup saved locally.":"Could not save the working setup."));

                out.add(action("Compare with working setup","Inspect differences against your marked baseline.",()->{comparison=WorkingSetup.read();status=comparison==null?"No readable working baseline. Mark your current setup first.":"Comparing against your working setup.";refresh();}));

                out.add(action("Restore working setup","Restores modules, HUD and selected video options; keybinds are excluded.",()->{var baseline=WorkingSetup.read();if(baseline==null){status="No readable working baseline.";return;}minecraft.setScreen(new ConfirmScreen(yes->{if(yes){SettingsHistory.checkpoint();status=ModuleManager.restore(baseline)?"Working setup restored.":"Could not restore this setup.";}minecraft.setScreen(this);},Component.literal("Restore your working setup?"),Component.literal("Current setup goes into history. Server restrictions still apply.")));}));

                out.add(action("Compare with latest history entry","Lists changed modules and settings with direct shortcuts.",()->{var history=SettingsHistory.entries();if(history.isEmpty())status="No settings history yet. Make a change first.";else {comparison=history.getFirst().setup();refresh();}}));

                if(comparison!=null){var now=ModuleManager.snapshot();

                    if(!Objects.equals(comparison.get("video"),now.get("video")))out.add(action("Video options differ","Open performance settings to review render distance, FPS limit and VSync.",()->minecraft.setScreen(SettingsScreen.openSearch(this,"PERFORMANCE",""))));

                    for(Module m:ModuleManager.all())if(!Objects.equals(comparison.getAsJsonObject("modules").get(m.id),now.getAsJsonObject("modules").get(m.id))) {

                    var before=comparison.getAsJsonObject("modules").get(m.id);var after=now.getAsJsonObject("modules").get(m.id);

                    List<String> changed=new ArrayList<>();if(before!=null&&before.isJsonObject()){var bs=before.getAsJsonObject().getAsJsonObject("settings");var as=after.getAsJsonObject().getAsJsonObject("settings");for(Setting<?> s:m.settings())if(bs==null||!Objects.equals(bs.get(s.id),as.get(s.id)))changed.add(s.name);}

                    out.add(action(m.name,changed.isEmpty()?"Enabled state, favorite or HUD placement differs.":String.join(", ",changed),()->minecraft.setScreen(new ModuleSettingsScreen(this,m))));

                }}

            }

            case ADDONS -> {
                out.add(action("Create example UI addon","Creates a local performance shortcut; permission approval stays separate.",()->{status=Addons.createExample();refresh();}));

                out.add(action("Disable all UI addons","Recovery: revoke every local permission approval.",()->{status=Preferences.revokeAll()?"All UI addon approvals revoked.":"Could not save approvals.";refresh();}));

                out.add(action("Open addon folder","Place v1 declarative JSON manifests here. Approval is required.",()->{try{var dir=net.fabricmc.loader.api.FabricLoader.getInstance().getConfigDir().resolve("sloth-client/addons");java.nio.file.Files.createDirectories(dir);net.minecraft.util.Util.getPlatform().openFile(dir.toFile());}catch(Exception e){status="Could not open the addon folder.";}}));

                for(var a:Addons.list()) {

                    if(!a.problem().isEmpty()){out.add(action(a.name(),a.problem(),()->status=a.problem()));continue;}

                    boolean approved=Preferences.approved(a.id(),a.hash());

                    out.add(action((approved?"Open ":"Approve ")+a.name(),a.description()+" · "+String.join(", ",a.permissions()),()->{if(!Preferences.approved(a.id(),a.hash()))minecraft.setScreen(new ConfirmScreen(yes->{if(yes)status=Preferences.grant(a.id(),a.hash())?"Approved. Click Open to use it.":"Could not save approval.";minecraft.setScreen(this);},Component.literal("Approve "+a.name()+"?"),Component.literal("Permissions: "+String.join(", ",a.permissions())+". Changed manifests require approval again.")));else switch(a.target()){case "performance"->open(Page.PERFORMANCE);case "search"->open(Page.SEARCH);case "profiles"->minecraft.setScreen(new ProfilesScreen(this));case "hud_editor"->minecraft.setScreen(new HudEditorScreen(this));}}));

                    if(approved)out.add(action("Revoke "+a.name(),"Remove approval for this UI addon.",()->{status=Preferences.revoke(a.id())?"Approval revoked.":"Could not revoke approval.";refresh();}));

                }

            }

            case INSPECT -> {for(HudModule m:ModuleManager.hudModules())out.add(action(m.name,"Edit common display settings beside a live preview.",()->minecraft.setScreen(new HudInspectorScreen(this,m))));}

        }

        actions = List.copyOf(out); previousButton.visible=nextButton.visible=actions.size()>perPage;previousButton.active=offset>0;nextButton.active=offset+perPage<actions.size(); offset = Math.min(offset, Math.max(0, ((actions.size() - 1) / perPage) * perPage));

        for (int i = 0; i < buttons.size(); i++) {

            var b = buttons.get(i); int index = offset + i;

            b.visible = i < perPage && index < actions.size();

            if (b.visible) {

                b.setMessage(Component.literal(Ui.ellipsize(font, actions.get(index).label(), w - 48)));

                b.setTooltip(net.minecraft.client.gui.components.Tooltip.create(Component.literal(actions.get(index).label() + ": " + actions.get(index).detail())));

            }

        }

    }

    private void showDetail(String title,String detail) {

        minecraft.setScreen(new ConfirmScreen(yes->minecraft.setScreen(this),Component.literal(title),Component.literal(detail),Component.literal("Done"),Component.literal("Back")));

    }

    private static String presetNames(String name) { return Studio.PRESETS.get(name).stream().map(ModuleManager::get).filter(Objects::nonNull).map(m -> m.name).reduce((a,b) -> a + ", " + b).orElse(""); }

    private static String changes(com.google.gson.JsonObject state) {

        var current = ModuleManager.snapshot(); int changed = 0;

        var modules = state.getAsJsonObject("modules");

        if (modules != null) for (Module m : ModuleManager.all()) if (!Objects.equals(modules.get(m.id), current.getAsJsonObject("modules").get(m.id))) changed++;

        return changed + " modules differ" + (!Objects.equals(state.get("video"), current.get("video")) ? " · video options differ" : "");

    }

    private static String title(Page p) { return switch (p) { case HOME -> "Sloth menu"; case HUD -> "HUD & appearance"; case CONTROLS -> "Controls & features"; case SAVED -> "Saved setups"; case ADVANCED -> "More tools"; case EXTRAS -> "Extra tools"; case SETUP -> "Choose your play style"; case SEARCH -> "Search everything"; case PERFORMANCE -> "Performance dashboard"; case HISTORY -> "Settings history"; case SERVERS -> "Server-specific setups"; case CAPTURE -> "Capture studio";case PINS->"Pinned quick controls";case FOCUS->"Distraction-free mode";case LAYOUT->"Interface and layout";case KEYS->"Keybind conflicts";case SESSIONS->"Session comparison";case TRACES->"Troubleshooting recorder";case COMPARE->"What changed?";case ADDONS->"UI addons";case INSPECT->"Live HUD inspector";case STARTUP->"Startup explanation"; }; }

    @Override public void renderBackground(GuiGraphics g, int mx, int my, float tick) {

        super.renderBackground(g, mx, my, tick); Ui.panel(g, left, top, w, h, Ui.BG);

    }

    @Override public void render(GuiGraphics g, int mx, int my, float tick) {

        if (page == Page.PERFORMANCE && System.currentTimeMillis() - sampled > 1000) { stats = FrameStats.read(); sampled = System.currentTimeMillis(); }

        super.render(g, mx, my, tick);

        g.drawString(font, Ui.ellipsize(font,title(page),w-182), left + 14, top + 16, Ui.TEXT, false);

        String subtitle = switch (page) {

            case HOME -> "Your everyday controls. Choose one to get started.";
            case HUD -> "Everything you see on screen, in one place.";
            case CONTROLS -> "Shortcuts and features you use while playing.";
            case SAVED -> "Keep a setup, try another, or undo a change.";
            case ADVANCED -> "Optional tools for investigating a problem.";
            case EXTRAS -> "Occasional tools, kept out of everyday settings.";

            case SETUP -> "Preview first. Applying replaces HUD selection and layout only.";

            case SEARCH -> "Type a feature or setting name to search the full client.";

            case PERFORMANCE -> "Local observations · recent gameplay only · no server TPS estimate";

            case HISTORY -> "24 recent setups · rapid edits grouped · keybinds excluded";

            case SERVERS -> Studio.server().isEmpty() ? "Join a multiplayer server to associate a saved profile." : Studio.server();

            case CAPTURE -> "Temporary framing · not freecam · F2 captures · F8 reopens Studio";

            case PINS->"Pin up to eight modules · F9 opens the toolbar";

            case FOCUS->"Temporary visibility · your saved module setup stays yours";

            case LAYOUT->"Consistent controls · responsive layout · your preferred density";

            case KEYS->"Shared physical keys · contextual bindings may be intentional";

            case SESSIONS->"Latest 20 samples · local observations · compare similar workloads";

            case TRACES->"Latest 10 traces · no upload · ≥100 ms trigger when armed";

            case COMPARE->"Changes since a previous setup · click to inspect";

            case ADDONS->"Declarative UI addons v1 · explicit permissions · no scripts";

            case INSPECT->"Live previews use your Minecraft resource-pack font";

            case STARTUP->"Actual Fabric-loaded mods and nested libraries in this game process";

        };

        g.drawString(font, Ui.ellipsize(font, subtitle, w - 28), left + 14, top + 36, Ui.MUTED, false);

        if (page == Page.PERFORMANCE) drawPerformance(g);

        if(page==Page.KEYS&&KeyConflicts.list().isEmpty())g.drawString(font,"No shared physical keys found.",left+14,top+58,Ui.GOOD,false);

        for (int i = 0; i < perPage && offset + i < actions.size(); i++) {

            var a = actions.get(offset + i);

            g.drawString(font, Ui.ellipsize(font, a.detail(), w - 32), left + 16, listTop + i * rowStep + rowStep - 12, Ui.DIM, false);

        }

        String message = status.isEmpty() ? actions.isEmpty() ? "No entries yet." : actions.size()>perPage?(offset + 1) + "–" + Math.min(actions.size(), offset + perPage) + " of " + actions.size():"" : status;

        g.drawString(font, Ui.ellipsize(font, message, w - 28), left + 14, top + h - 44, Ui.ACCENT_SOFT, false);

    }

    private void drawPerformance(GuiGraphics g) {

        Runtime rt = Runtime.getRuntime(); long used = rt.totalMemory() - rt.freeMemory(), max = rt.maxMemory();

        int ping = -1;

        if (minecraft.player != null && minecraft.getConnection() != null && !minecraft.isLocalServer()) {

            var p = minecraft.getConnection().getPlayerInfo(minecraft.player.getUUID()); if (p != null) ping = p.getLatency();

        }

        String[] lines = {String.format(Locale.ROOT, "Frames %d · median %.1f ms · 95th percentile %.1f ms", stats.count(), stats.median(), stats.p95()),

            "Intervals over 50 ms: " + stats.stalls() + " · heap " + used / 1048576 + "/" + max / 1048576 + " MB",

            "Server-reported latency: " + (ping < 0 ? "Unavailable" : ping + " ms")};

        for (int i = 0; i < lines.length; i++) g.drawString(font, Ui.ellipsize(font, lines[i], w - 28), left + 14, top + 55 + i * 14, Ui.TEXT, false);

        int gx = left + 14, gy = top + 104, gw = w - 28, gh = 42;

        if (h >= 310) g.fill(gx, gy, gx + gw, gy + gh, Ui.PANEL);

        double[] values = stats.graph();

        if (h >= 310) for (int i = 0; i < values.length; i++) { int x = gx + i * gw / values.length, end = gx + (i + 1) * gw / values.length; int bar = (int) Math.min(gh, values[i] / 100 * gh); g.fill(x, gy + gh - Math.max(1, bar), Math.max(x + 1, end - 1), gy + gh, values[i] > 50 ? Ui.BAD : Ui.ACCENT); }

        String advice = stats.count() < 60 ? "Close Studio and play to collect a sample." : used > max * .85 ? "Heap use is high. Review heavy mods; a single sample cannot identify a leak." : stats.p95() > Math.max(25,stats.median()*1.5) ? "Uneven frames: try lower render distance or lighter shaders, then compare." : ping > 150 ? "Frames look steady; high latency may affect server interactions." : "No obvious pressure in this sample. FPS caps and VSync affect frame intervals.";

        if (h >= 310) g.drawWordWrap(font, Component.literal(advice), gx, top + 153, gw, Ui.MUTED);

        else g.drawString(font, Ui.ellipsize(font, advice, gw), gx, top + 104, Ui.MUTED, false);

        if(h>=310)g.drawString(font,"Budget "+Preferences.budget()+" FPS · "+FrameStats.overBudget(Preferences.budget())+" / "+stats.count()+" intervals exceed target",gx,top+187,Ui.ACCENT_SOFT,false);

    }

    @Override public void onClose() { if(!navigation.isEmpty()){page=navigation.pop();offset=0;status="";rebuildWidgets();}else minecraft.setScreen(parent); }

    @Override public boolean mouseScrolled(double mx,double my,double horizontal,double vertical) {
        if(Ui.inside(mx,my,left,listTop,w,top+h-42-listTop) && actions.size()>perPage && vertical!=0){offset=Math.max(0,Math.min(Math.max(0,actions.size()-perPage),offset+(vertical<0?1:-1)));refresh();return true;}
        return super.mouseScrolled(mx,my,horizontal,vertical);
    }

    @Override public boolean keyPressed(net.minecraft.client.input.KeyEvent event) {

        if ((event.modifiers() & org.lwjgl.glfw.GLFW.GLFW_MOD_CONTROL) != 0 && event.key() == org.lwjgl.glfw.GLFW.GLFW_KEY_K) { open(Page.SEARCH); return true; }

        if (page == Page.SEARCH && getFocused() == search && (event.key() == org.lwjgl.glfw.GLFW.GLFW_KEY_ENTER || event.key() == org.lwjgl.glfw.GLFW.GLFW_KEY_KP_ENTER) && offset < actions.size()) { actions.get(offset).run().run(); return true; }

        return super.keyPressed(event);

    }

}

