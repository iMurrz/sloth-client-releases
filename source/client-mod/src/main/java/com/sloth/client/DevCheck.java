package com.sloth.client;

import com.sloth.client.module.ModuleManager;
import com.sloth.client.screen.SlothTitleScreen;
import com.sloth.client.screen.HudEditorScreen;
import com.sloth.client.screen.ModMenuScreen;
import com.sloth.client.screen.ModuleSettingsScreen;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.minecraft.client.Screenshot;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.gui.screens.TitleScreen;
import net.minecraft.client.gui.screens.worldselection.CreateWorldScreen;
import org.spongepowered.asm.mixin.MixinEnvironment;

import java.io.File;
import java.util.List;
import java.util.function.Supplier;

/**
 * Developer self-check, only active with -Dsloth.devCheck=true (the launcher's smoke test sets it; players never
 * do). Audits every mixin up front, then opens each Sloth screen and screenshots it.
 */
final class DevCheck {
    private DevCheck() {}

    private record Shot(String name, Supplier<Screen> screen) {}

    static void install() {
        if (!Boolean.getBoolean("sloth.devCheck")) return;
        List<Shot> allShots = Boolean.getBoolean("sloth.devCheckAssistance") ? List.of(
            new Shot("hud-editor", () -> new HudEditorScreen(null)),
            new Shot("hud-arrangement", () -> new com.sloth.client.screen.HudArrangeScreen(new HudEditorScreen(null),ModuleManager.hudModules().stream().filter(com.sloth.client.module.HudModule::isActive).toList(),List.of(),Runnable::run)),
            new Shot("bindings", () -> new com.sloth.client.screen.BindingScreen(null,null)),
            new Shot("server-display", () -> {PackDiagnostics.observe("ServerPackManager","resource pack download failed 404",true);PackDiagnostics.observe("renderer","not compatible with font atlas resizing",true);return new com.sloth.client.screen.ServerDisplayScreen(null);}),
            new Shot("accessibility", () -> new com.sloth.client.screen.AccessibilityStudioScreen(null)),
            new Shot("appearance", () -> new com.sloth.client.screen.AppearanceStudioScreen(null))) : Boolean.getBoolean("sloth.devCheckPerformance") ? List.of(
            new Shot("hud-editor", () -> new HudEditorScreen(null)),
            new Shot("armor-options", () -> new ModuleSettingsScreen(null,ModuleManager.get("armor_status"))),
            new Shot("potion-options", () -> new ModuleSettingsScreen(null,ModuleManager.get("potion_effects"))),
            new Shot("cooldown-options", () -> new ModuleSettingsScreen(null,ModuleManager.get("cooldowns"))),
            new Shot("performance", () -> new com.sloth.client.screen.StudioScreen(null,com.sloth.client.screen.StudioScreen.Page.PERFORMANCE)),
            new Shot("traces", () -> new com.sloth.client.screen.StudioScreen(null,com.sloth.client.screen.StudioScreen.Page.TRACES)),
            new Shot("appearance", () -> new com.sloth.client.screen.AppearanceStudioScreen(null))) : Boolean.getBoolean("sloth.devCheckPolish") ? List.of(
            new Shot("setup-review", () -> new com.sloth.client.screen.SetupReviewScreen(null,"Survival setup",com.sloth.client.studio.Studio.previewPreset("Survival"))),
            new Shot("bindings", () -> new com.sloth.client.screen.BindingScreen(null,SlothClient.FREELOOK)),
            new Shot("server-display", () -> new com.sloth.client.screen.ServerDisplayScreen(null)),
            new Shot("quick-wheel", com.sloth.client.screen.QuickWheelScreen::new),
            new Shot("hud-safe-zones", () -> new HudEditorScreen(null))) : List.of(
            new Shot("main-menu", SlothTitleScreen::new),
            new Shot("mod-menu", () -> new ModMenuScreen(null)),
            new Shot("settings", () -> new com.sloth.client.screen.SettingsScreen(null)),
            new Shot("module-settings", () -> new ModuleSettingsScreen(null, ModuleManager.get("crosshair"))),
            new Shot("streamer-settings", () -> new ModuleSettingsScreen(null, ModuleManager.get("streamer_mode"))),
            new Shot("chat-hub", () -> {com.sloth.client.studio.ChatHub.clear();com.sloth.client.studio.ChatHub.receiveSystem(net.minecraft.network.chat.Component.literal("Server restart completed safely."));com.sloth.client.studio.ChatHub.receiveChat(net.minecraft.network.chat.Component.literal("From Alex: SlothSmoke, the mine is ready."),new com.mojang.authlib.GameProfile(java.util.UUID.randomUUID(),"Alex"));return new com.sloth.client.screen.ChatHubScreen(null);}),
            new Shot("hud-editor", () -> new HudEditorScreen(null)),
            new Shot("profiles", () -> new com.sloth.client.screen.ProfilesScreen(null)),
            new Shot("friends", () -> new com.sloth.client.screen.FriendsScreen(null)),
            new Shot("changelog", () -> new com.sloth.client.screen.ChangelogScreen(null)),
            new Shot("quick-controls", com.sloth.client.screen.QuickControlsScreen::new),
            new Shot("hud-inspector", () -> new com.sloth.client.screen.HudInspectorScreen(null, ModuleManager.get(com.sloth.client.module.impl.GraphicHud.Direction.class))),
            new Shot("direction-settings", () -> new ModuleSettingsScreen(null, ModuleManager.get("direction"))),
            new Shot("color-picker", () -> new com.sloth.client.screen.ColorPickerScreen(null, ModuleManager.get(com.sloth.client.module.impl.GraphicHud.Direction.class).textColor)),
            new Shot("studio-home", () -> new com.sloth.client.screen.ClientOverlayScreen(null)),
            new Shot("gameplay", () -> new com.sloth.client.screen.GameplayScreen(null)),
            new Shot("studio-setup", () -> new com.sloth.client.screen.StudioScreen(null, com.sloth.client.screen.StudioScreen.Page.SETUP)),
            new Shot("studio-search", () -> new com.sloth.client.screen.StudioScreen(null, com.sloth.client.screen.StudioScreen.Page.SEARCH)),
            new Shot("studio-performance", () -> new com.sloth.client.screen.StudioScreen(null, com.sloth.client.screen.StudioScreen.Page.PERFORMANCE)),
            new Shot("studio-history", () -> new com.sloth.client.screen.StudioScreen(null, com.sloth.client.screen.StudioScreen.Page.HISTORY)),
            new Shot("studio-servers", () -> new com.sloth.client.screen.StudioScreen(null, com.sloth.client.screen.StudioScreen.Page.SERVERS)),
            new Shot("studio-capture", () -> new com.sloth.client.screen.StudioScreen(null, com.sloth.client.screen.StudioScreen.Page.CAPTURE)),
            new Shot("studio-pins", () -> new com.sloth.client.screen.StudioScreen(null, com.sloth.client.screen.StudioScreen.Page.PINS)),
            new Shot("studio-focus", () -> new com.sloth.client.screen.StudioScreen(null, com.sloth.client.screen.StudioScreen.Page.FOCUS)),
            new Shot("studio-layout", () -> new com.sloth.client.screen.StudioScreen(null, com.sloth.client.screen.StudioScreen.Page.LAYOUT)),
            new Shot("studio-keys", () -> new com.sloth.client.screen.StudioScreen(null, com.sloth.client.screen.StudioScreen.Page.KEYS)),
            new Shot("studio-sessions", () -> new com.sloth.client.screen.StudioScreen(null, com.sloth.client.screen.StudioScreen.Page.SESSIONS)),
            new Shot("studio-traces", () -> new com.sloth.client.screen.StudioScreen(null, com.sloth.client.screen.StudioScreen.Page.TRACES)),
            new Shot("studio-compare", () -> new com.sloth.client.screen.StudioScreen(null, com.sloth.client.screen.StudioScreen.Page.COMPARE)),
            new Shot("studio-addons", () -> new com.sloth.client.screen.StudioScreen(null, com.sloth.client.screen.StudioScreen.Page.ADDONS)),
            new Shot("studio-inspect", () -> new com.sloth.client.screen.StudioScreen(null, com.sloth.client.screen.StudioScreen.Page.INSPECT)),
            new Shot("studio-startup", () -> new com.sloth.client.screen.StudioScreen(null, com.sloth.client.screen.StudioScreen.Page.STARTUP)),
            // Vanilla screens under the Sloth Menu Theme.
            new Shot("vanilla-options", () -> new net.minecraft.client.gui.screens.options.OptionsScreen(new SlothTitleScreen(), net.minecraft.client.Minecraft.getInstance().options)),
            new Shot("vanilla-sound", () -> new net.minecraft.client.gui.screens.options.SoundOptionsScreen(new SlothTitleScreen(), net.minecraft.client.Minecraft.getInstance().options)),
            new Shot("vanilla-world-creation", () -> new net.minecraft.client.gui.screens.worldselection.SelectWorldScreen(new SlothTitleScreen())),
            new Shot("vanilla-servers", () -> new net.minecraft.client.gui.screens.multiplayer.JoinMultiplayerScreen(new SlothTitleScreen())));
        String single = System.getProperty("sloth.devCheckSingle", "");
        List<Shot> shots = single.isBlank() ? allShots : allShots.stream().filter(shot -> shot.name().equals(single)).toList();
        if (!single.isBlank() && shots.isEmpty()) throw new IllegalArgumentException("Unknown Sloth dev-check screen: " + single);
        int[] state = {0, 0};
        Screen[] expected = {null};
        ClientTickEvents.END_CLIENT_TICK.register(mc -> {
            if(Boolean.getBoolean("sloth.devCheckZoom")){ZoomControlAudit.tick(mc);return;}
            if (state[0] == 0) {
                // Wait until resources have loaded and the main menu is up.
                if (mc.getOverlay() != null) return;
                if(!(mc.screen instanceof SlothTitleScreen || mc.screen instanceof TitleScreen)){mc.setScreen(new SlothTitleScreen());}
                if (++state[1] < 40) return;
                try {
                    MixinEnvironment.getCurrentEnvironment().audit();
                    RuntimeRecoveryAudit.run();
                    SlothClient.LOG.info("DEVCHECK mixin audit passed");
                } catch (Throwable t) {
                    SlothClient.LOG.error("DEVCHECK mixin audit FAILED", t);
                }
                if(Boolean.getBoolean("sloth.devCheckPolish")){mc.options.guiScale().set(4);mc.resizeDisplay();}
                state[0] = 1;
                state[1] = 0;
                return;
            }
            int step = state[0] - 1;
            if (step >= shots.size()) { if(!single.isBlank()){SlothClient.LOG.info("DEVCHECK single capture complete");mc.stop();return;} if(Boolean.getBoolean("sloth.devCheckPerformanceWorld")){PerformanceWorldAudit.tick(mc);return;} if(Boolean.getBoolean("sloth.devCheckPolish")||Boolean.getBoolean("sloth.devCheckPerformance")){SlothClient.LOG.info("DEVCHECK capture complete");mc.stop();return;} worldPhase(mc); return; }
            state[1]++;
            if (state[1] == 5) {
                expected[0] = shots.get(step).screen().get();
                mc.setScreen(expected[0]);
            }
            if(state[1]==25 && Boolean.getBoolean("sloth.devCheckAssistance") && mc.screen instanceof HudEditorScreen editor){try{checkHudSelection(editor);SlothClient.LOG.info("DEVCHECK HUD selection checks passed");}catch(Throwable t){SlothClient.LOG.error("DEVCHECK HUD selection FAILED",t);}}
            if (state[1] == 45) {
                // Never save a mislabeled capture if another action changed the active screen; restore the
                // intended screen and give it another two seconds to settle.
                boolean expectedTransition = shots.get(step).name().equals("vanilla-world-creation") && mc.screen instanceof CreateWorldScreen;
                if (mc.screen != expected[0] && !expectedTransition) {
                    SlothClient.LOG.warn("DEVCHECK screen changed while capturing {} (was {}); retrying",
                        shots.get(step).name(), mc.screen == null ? "<none>" : mc.screen.getClass().getSimpleName());
                    mc.setScreen(expected[0]);
                    state[1] = 5;
                    return;
                }
                String name = "devcheck-" + shots.get(step).name() + ".png";
                // Kept out of the player's screenshots folder: <game>/sloth-devcheck/screenshots.
                File base = new File(mc.gameDirectory, "sloth-devcheck");
                new File(base, "screenshots").mkdirs();
                Screenshot.grab(base, name, mc.getMainRenderTarget(), 1, msg -> SlothClient.LOG.info("DEVCHECK screenshot {}", name));
            }
            if (state[1] == 55) { state[0]++; state[1] = 0; }
        });
    }

    /** Checks real keyboard dispatch and the transformed FOV method, not only setDown(). */
    static void checkZoom(net.minecraft.client.Minecraft mc) throws Exception {
        var zoom=ModuleManager.get(com.sloth.client.module.impl.CameraModules.Zoom.class);
        var smoothField=zoom.getClass().getDeclaredField("smooth");smoothField.setAccessible(true);
        var smooth=(com.sloth.client.module.Setting.Bool)smoothField.get(zoom);boolean prior=smooth.get(),enabled=zoom.isEnabled();
        var screen=mc.screen;var key=SlothClient.ZOOM;var oldKey=net.fabricmc.fabric.api.client.keybinding.v1.KeyBindingHelper.getBoundKeyOf(key);
        var fov=java.util.Arrays.stream(mc.gameRenderer.getClass().getDeclaredMethods()).filter(m->m.getReturnType()==float.class&&java.util.Arrays.equals(m.getParameterTypes(),new Class<?>[]{net.minecraft.client.Camera.class,float.class,boolean.class})).findFirst().orElseThrow();fov.setAccessible(true);
        var press=java.util.Arrays.stream(mc.keyboardHandler.getClass().getDeclaredMethods()).filter(m->java.util.Arrays.equals(m.getParameterTypes(),new Class<?>[]{long.class,int.class,net.minecraft.client.input.KeyEvent.class})).findFirst().orElseThrow();press.setAccessible(true);
        try {
            if(!mc.isWindowActive())throw new IllegalStateException("Zoom audit window is not focused");
            mc.setScreen(null);zoom.setEnabled(true);smooth.set(false);key.setKey(com.mojang.blaze3d.platform.InputConstants.Type.KEYSYM.getOrCreate(org.lwjgl.glfw.GLFW.GLFW_KEY_C));net.minecraft.client.KeyMapping.resetMapping();key.setDown(false);
            var camera=mc.gameRenderer.getMainCamera();float normal=(Float)fov.invoke(mc.gameRenderer,camera,0f,true),hand=(Float)fov.invoke(mc.gameRenderer,camera,0f,false);
            press.invoke(mc.keyboardHandler,mc.getWindow().handle(),org.lwjgl.glfw.GLFW.GLFW_PRESS,new net.minecraft.client.input.KeyEvent(org.lwjgl.glfw.GLFW.GLFW_KEY_C,0,0));
            if(!key.isDown()||!zoom.zooming())throw new IllegalStateException("Keyboard C did not activate Zoom");
            float changed=(Float)fov.invoke(mc.gameRenderer,camera,0f,true),held=(Float)fov.invoke(mc.gameRenderer,camera,0f,false);
            if(Math.abs(changed-normal/zoom.level.f())>.01f)throw new IllegalStateException("World FOV ignored Zoom: "+normal+" -> "+changed);
            if(Math.abs(held-hand)>.01f)throw new IllegalStateException("Zoom changed held-item FOV");
            press.invoke(mc.keyboardHandler,mc.getWindow().handle(),org.lwjgl.glfw.GLFW.GLFW_RELEASE,new net.minecraft.client.input.KeyEvent(org.lwjgl.glfw.GLFW.GLFW_KEY_C,0,0));
            if(key.isDown()||zoom.zooming())throw new IllegalStateException("C release did not stop Zoom");
            if(Math.abs((Float)fov.invoke(mc.gameRenderer,camera,0f,true)-normal)>.01f)throw new IllegalStateException("FOV did not restore");
            SlothClient.LOG.info("DEVCHECK Zoom FOV {} -> {} -> {}, hand {} -> {}",normal,changed,normal,hand,held);
        } finally {key.setDown(false);key.setKey(oldKey);net.minecraft.client.KeyMapping.resetMapping();smooth.set(prior);zoom.setEnabled(enabled);mc.setScreen(screen);}
    }

    /** Synthetic editor input only, enabled by the offline assistance audit flag. */
    @SuppressWarnings("unchecked")
    private static void checkHudSelection(HudEditorScreen editor) throws Exception {
        var active=ModuleManager.hudModules().stream().filter(com.sloth.client.module.HudModule::isActive).toList();
        if(active.size()<2)throw new IllegalStateException("Need two enabled HUDs for selection audit");
        var a=active.get(0);var b=active.get(1);float ax=a.x,ay=a.y,bx=b.x,by=b.y;
        var field=HudEditorScreen.class.getDeclaredField("selection");field.setAccessible(true);
        var selection=(java.util.Set<com.sloth.client.module.HudModule>)field.get(editor);
        var buttonField=HudEditorScreen.class.getDeclaredField("resetSelection");buttonField.setAccessible(true);
        var button=(com.sloth.client.screen.widget.SlothButton)buttonField.get(editor);
        var enter=new net.minecraft.client.input.KeyEvent(org.lwjgl.glfw.GLFW.GLFW_KEY_ENTER,0,0);
        try {
            a.x=.31f;a.y=.36f;b.x=.62f;b.y=.54f;
            selection.clear();button.onPress(enter);
            if(a.x!=.31f||b.x!=.62f)throw new IllegalStateException("Empty selection changed a HUD");
            selection.add(a);button.onPress(enter);
            if(b.x!=.62f||b.y!=.54f||(a.x==.31f&&a.y==.36f))throw new IllegalStateException("Reset changed the wrong HUDs");
            editor.keyPressed(new net.minecraft.client.input.KeyEvent(org.lwjgl.glfw.GLFW.GLFW_KEY_Z,0,org.lwjgl.glfw.GLFW.GLFW_MOD_CONTROL));
            if(a.x!=.31f||a.y!=.36f||b.x!=.62f||b.y!=.54f)throw new IllegalStateException("Undo did not restore selection reset");
            editor.keyPressed(new net.minecraft.client.input.KeyEvent(org.lwjgl.glfw.GLFW.GLFW_KEY_A,0,org.lwjgl.glfw.GLFW.GLFW_MOD_CONTROL));
            if(selection.size()!=active.size()||!selection.containsAll(active))throw new IllegalStateException("Select all missed active HUDs");
        } finally {a.x=ax;a.y=ay;b.x=bx;b.y=by;selection.clear();ModuleManager.save();}
    }

    // ---------- optional in-world checks (-Dsloth.devCheckWorld=<world folder>) ----------

    private static final String WORLD = System.getProperty("sloth.devCheckWorld", "");
    private static int worldStep = -1, worldTicks;

    private static void capture(net.minecraft.client.Minecraft mc, String name) {
        File base = new File(mc.gameDirectory, "sloth-devcheck");
        new File(base, "screenshots").mkdirs();
        String file = "devcheck-" + name + ".png";
        Screenshot.grab(base, file, mc.getMainRenderTarget(), 1, msg -> SlothClient.LOG.info("DEVCHECK screenshot {}", file));
    }

    /** Opens a world and captures the HUD, pause menu and HUD editor. */
    private static void worldPhase(net.minecraft.client.Minecraft mc) {
        if (WORLD.isEmpty() || !WORLD.matches("[A-Za-z0-9 _-]{1,64}")) return;
        if (worldStep == -1) {
            worldStep = 0;
            mc.createWorldOpenFlows().openWorld(WORLD, () -> SlothClient.LOG.warn("DEVCHECK world open cancelled"));
            return;
        }
        if (worldStep == 0) {
            if (mc.level == null || mc.player == null || mc.screen != null) { worldTicks = 0; return; }
            if (++worldTicks < 80) return;
            capture(mc, "world-hud");
            worldStep = 1; worldTicks = 0;
        }
        worldTicks++;
        if (worldStep == 1 && worldTicks == 5) mc.pauseGame(false);
        if (worldStep == 1 && worldTicks == 45) { capture(mc, "world-pause"); worldStep = 2; worldTicks = 0; }
        if (worldStep == 2 && worldTicks == 5) mc.setScreen(new HudEditorScreen(null));
        if (worldStep == 2 && worldTicks == 45) { capture(mc, "world-hud-editor"); mc.setScreen(null); worldStep = 99; }
    }
}
