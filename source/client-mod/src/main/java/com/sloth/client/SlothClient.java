package com.sloth.client;

import com.sloth.client.module.ModuleManager;
import com.sloth.client.module.impl.CameraModules;
import com.sloth.client.module.impl.GraphicHud;
import com.sloth.client.module.impl.GameplayHud;
import com.sloth.client.module.impl.InfoHud;
import com.sloth.client.module.impl.Tracking;
import com.sloth.client.module.impl.UtilityModules;
import com.sloth.client.module.impl.VisualModules;
import com.sloth.client.module.impl.WorldHud;
import com.sloth.client.screen.ModMenuScreen;
import com.mojang.blaze3d.platform.InputConstants;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.fabric.api.client.keybinding.v1.KeyBindingHelper;
import net.fabricmc.fabric.api.client.networking.v1.ClientPlayConnectionEvents;
import net.fabricmc.fabric.api.client.networking.v1.ClientPlayNetworking;
import net.fabricmc.fabric.api.client.message.v1.ClientReceiveMessageEvents;
import net.fabricmc.fabric.api.client.rendering.v1.hud.HudElementRegistry;
import net.fabricmc.fabric.api.client.rendering.v1.hud.VanillaHudElements;
import net.fabricmc.fabric.api.client.screen.v1.ScreenEvents;
import net.fabricmc.fabric.api.client.screen.v1.Screens;
import net.fabricmc.fabric.api.event.player.AttackEntityCallback;
import net.fabricmc.fabric.api.networking.v1.PayloadTypeRegistry;
import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.client.KeyMapping;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.components.AbstractWidget;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.screens.ConfirmScreen;
import net.minecraft.client.gui.screens.PauseScreen;
import net.minecraft.client.input.KeyEvent;
import net.minecraft.client.multiplayer.ServerData;
import net.minecraft.client.multiplayer.resolver.ServerAddress;
import net.minecraft.network.chat.Component;
import net.minecraft.network.chat.contents.TranslatableContents;
import net.minecraft.resources.Identifier;
import net.minecraft.world.InteractionResult;
import org.lwjgl.glfw.GLFW;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.stream.Collectors;

public final class SlothClient implements ClientModInitializer {
    public static final String MOD_ID = "sloth-client";
    public static final Logger LOG = LoggerFactory.getLogger("Sloth Client");
    private static final KeyMapping.Category CATEGORY = KeyMapping.Category.register(Identifier.fromNamespaceAndPath(MOD_ID, "sloth"));

    public static KeyMapping MOD_MENU;
    public static KeyMapping ZOOM;
    public static KeyMapping FREELOOK;
    public static KeyMapping TOGGLE_HUD;
    public static KeyMapping STOPWATCH;
    public static KeyMapping STUDIO;
    public static KeyMapping QUICK_WHEEL;
    public static KeyMapping QUICK_CONTROLS, HOLD_QUIET, HOLD_CLEAN;
    public static KeyMapping BOOKMARK, BUILD_ANCHOR;
    public static KeyMapping CHAT_HUB;
    public static final KeyMapping[] HOTKEYS = new KeyMapping[6];

    private static KeyMapping key(String name, int glfwKey) {
        return KeyBindingHelper.registerKeyBinding(new KeyMapping("key.sloth-client." + name, InputConstants.Type.KEYSYM, glfwKey, CATEGORY));
    }

    @Override
    public void onInitializeClient() {
        TokenLogFilter.install();

        MOD_MENU = key("mod_menu", GLFW.GLFW_KEY_RIGHT_SHIFT);
        ZOOM = key("zoom", GLFW.GLFW_KEY_C);
        FREELOOK = key("freelook", GLFW.GLFW_KEY_LEFT_ALT);
        TOGGLE_HUD = key("toggle_hud", GLFW.GLFW_KEY_H);
        STOPWATCH = key("stopwatch", InputConstants.UNKNOWN.getValue());
        STUDIO = key("studio", GLFW.GLFW_KEY_F8);
        QUICK_CONTROLS=key("quick_controls",GLFW.GLFW_KEY_F9);
        QUICK_WHEEL=key("quick_wheel",GLFW.GLFW_KEY_GRAVE_ACCENT);
        HOLD_QUIET=key("hold_quiet",InputConstants.UNKNOWN.getValue());
        HOLD_CLEAN=key("hold_clean",InputConstants.UNKNOWN.getValue());
        BOOKMARK=key("bookmark",GLFW.GLFW_KEY_F7);
        BUILD_ANCHOR=key("build_anchor",InputConstants.UNKNOWN.getValue());
        CHAT_HUB=key("chat_hub",GLFW.GLFW_KEY_F10);
        for (int i = 0; i < HOTKEYS.length; i++) HOTKEYS[i] = key("hotkey_" + (i + 1), InputConstants.UNKNOWN.getValue());

        ModuleManager.register(
            new InfoHud.Coordinates(), new InfoHud.InventorySpace(), new InfoHud.Fps(), new InfoHud.Ping(), new InfoHud.Cps(),
            new InfoHud.Memory(), new InfoHud.Clock(), new InfoHud.ServerAddress(), new GraphicHud.ArmorStatus(), new GraphicHud.PotionEffects(),
            new GraphicHud.Keystrokes(), new GraphicHud.Direction(), new InfoHud.Saturation(), new InfoHud.Speed(), new InfoHud.Reach(),
            new InfoHud.Combo(), new InfoHud.Playtime(), new InfoHud.Stopwatch(), new InfoHud.DayCounter(), new InfoHud.PackDisplay(),
            new InfoHud.LookingAt(),
            new VisualModules.MainMenu(), new VisualModules.MenuTheme(), new CameraModules.Zoom(), new CameraModules.Freelook(), new VisualModules.Fullbright(), new VisualModules.Crosshair(),
            new VisualModules.TimeChanger(), new VisualModules.Weather(), new VisualModules.Particles(),
            new UtilityModules.Sprint(), new UtilityModules.Sneak(), new UtilityModules.Hotkeys(), new UtilityModules.ChatTimestamps(), new UtilityModules.SmoothChat(),
            new UtilityModules.SmartDisconnect(), new com.sloth.client.module.impl.MiningSync(), new com.sloth.client.module.impl.BetterSounds(), new com.sloth.client.module.impl.AutoTextActions(),
            new UtilityModules.ChatHub(),
            new com.sloth.client.module.impl.ExtraHud.Health(), new com.sloth.client.module.impl.ExtraHud.Hunger(), new com.sloth.client.module.impl.ExtraHud.Air(), new com.sloth.client.module.impl.ExtraHud.Experience(),
            new com.sloth.client.module.impl.ExtraHud.Held(), new com.sloth.client.module.impl.ExtraHud.Offhand(), new com.sloth.client.module.impl.ExtraHud.Light(), new com.sloth.client.module.impl.ExtraHud.Biome(),
            new com.sloth.client.module.impl.ExtraHud.Dimension(), new com.sloth.client.module.impl.ExtraHud.Movement(), new com.sloth.client.module.impl.ExtraHud.ItemCounter(), new com.sloth.client.module.impl.ExtraHud.Entities(),
            new WorldHud.Cooldowns(),
            new GameplayHud.Session(), new GameplayHud.Recovery(), new GameplayHud.Planner(), new GameplayHud.Builder(), new GameplayHud.Combat()
            , new com.sloth.client.module.impl.CosmicHud.Mining(), new com.sloth.client.module.impl.CosmicHud.Events(), new com.sloth.client.module.impl.CosmicHud.Safety(), new com.sloth.client.module.impl.CosmicHud.SetCalculator()
            , new com.sloth.client.module.impl.CosmicSuiteHud.Activity(), new com.sloth.client.module.impl.CosmicSuiteHud.Pve(), new com.sloth.client.module.impl.CosmicSuiteHud.Boosts(), new com.sloth.client.module.impl.CosmicSuiteHud.Danger()
            , new com.sloth.client.module.impl.OfflineTraining.AimAssist(), new com.sloth.client.module.impl.OfflineTraining.AutoAttack(), new com.sloth.client.module.impl.OfflineTraining.AutoMine(), new com.sloth.client.module.impl.OfflineTraining.EntityEsp(), new com.sloth.client.module.impl.OfflineTraining.OreScanner()
            , new com.sloth.client.module.impl.ReferenceFeatures.Streamer(), new com.sloth.client.module.impl.ReferenceFeatures.NetherCoordinates(),
            new com.sloth.client.module.impl.ReferenceFeatures.EquipmentHealth(), new com.sloth.client.module.impl.ReferenceFeatures.ActiveFeatures(),
            new com.sloth.client.module.impl.ReferenceFeatures.ConnectionQuality(), new com.sloth.client.module.impl.ReferenceFeatures.ReturnPath()
        );
        // Fabric's entrypoint runs inside Minecraft's constructor, before options exist.
        // Profile hooks, video snapshots and interrupted-session recovery need a ready client.
        net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientLifecycleEvents.CLIENT_STARTED.register(client -> {
            ModuleManager.load();
            com.sloth.client.studio.Studio.load();
            com.sloth.client.studio.Preferences.load();
            com.sloth.client.studio.Insights.load();
            com.sloth.client.studio.GameplayTracker.load();
            com.sloth.client.studio.CosmicPrisons.load();
            com.sloth.client.studio.CosmicSuite.load();
            LOG.info("Sloth settings initialized after Minecraft startup");
        });
        net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientLifecycleEvents.CLIENT_STOPPING.register(client -> {
            com.sloth.client.studio.TemporaryControls.stop(); com.sloth.client.studio.Studio.leave(); ModuleManager.save(); com.sloth.client.studio.GameplayTracker.save(); com.sloth.client.studio.CosmicPrisons.save(); com.sloth.client.studio.CosmicSuite.save();
        });
        ClientReceiveMessageEvents.GAME.register((message, overlay) -> ModuleManager.get(com.sloth.client.module.impl.AutoTextActions.class).message(message.getString(), overlay));
        ClientReceiveMessageEvents.GAME.register((message, overlay) -> {com.sloth.client.studio.QaAuthorization.receiveSystem(message.getString());com.sloth.client.studio.CosmicPrisons.receive(message.getString(),overlay);com.sloth.client.studio.CosmicSuite.receive(message.getString());});
        ClientReceiveMessageEvents.GAME.register((message, overlay) -> { if(!overlay) com.sloth.client.studio.ChatHub.receiveSystem(message); });
        ClientReceiveMessageEvents.CHAT.register((message, signed, sender, params, receivedAt) -> {com.sloth.client.studio.ChatHub.receiveChat(message, sender);com.sloth.client.studio.CosmicPrisons.receive(message.getString(),false);com.sloth.client.studio.CosmicSuite.receive(message.getString());});

        ClientPlayConnectionEvents.JOIN.register((handler, sender, client) -> { com.sloth.client.studio.ConnectionHealth.join(); Tracking.sessionStart = System.currentTimeMillis(); com.sloth.client.studio.FrameStats.clear(); com.sloth.client.studio.GameplayTracker.beginSession(); com.sloth.client.studio.CosmicPrisons.resetSession(); });
        ClientPlayConnectionEvents.DISCONNECT.register((handler, client) -> {
            com.sloth.client.studio.GameplayTracker.endSession();
            com.sloth.client.studio.ChatHub.clear();
            Tracking.reset(); WorldHud.COOLDOWN_STARTED.clear(); com.sloth.client.studio.FrameStats.clear();
            com.sloth.client.studio.ConnectionHealth.leave(); PackDiagnostics.clear();
            com.sloth.client.studio.TemporaryControls.stop();
            com.sloth.client.module.impl.OfflineTraining.release(client);
            com.sloth.client.studio.QaAuthorization.clear();
            com.sloth.client.studio.Studio.leave();
            ModuleManager.setServerBlocked(Set.of());
        });

        HudElementRegistry.addLast(Identifier.fromNamespaceAndPath(MOD_ID, "hud"), (g, delta) -> {
            ModuleManager.renderHud(g);
            PackDiagnostics.render(g);
        });
        HudElementRegistry.replaceElement(VanillaHudElements.CROSSHAIR, original -> (g, delta) -> {
            VisualModules.Crosshair crosshair = ModuleManager.get(VisualModules.Crosshair.class);
            if (crosshair.isActive()) crosshair.render(g); else original.render(g, delta);
        });
        HudElementRegistry.replaceElement(VanillaHudElements.STATUS_EFFECTS, original -> (g, delta) -> {
            GraphicHud.PotionEffects effects = ModuleManager.get(GraphicHud.PotionEffects.class);
            if (!(effects.isActive() && effects.hideVanilla.on())) original.render(g, delta);
        });

        AttackEntityCallback.EVENT.register((player, world, hand, entity, hit) -> {
            Minecraft mc = Minecraft.getInstance();
            if (world.isClientSide() && player == mc.player) { Tracking.attacked(mc.player, entity); com.sloth.client.studio.GameplayTracker.attacked(entity); }
            return InteractionResult.PASS;
        });

        ScreenEvents.AFTER_INIT.register((client, screen, w, h) -> {
            if (!(screen instanceof PauseScreen pause)) return;
            if (!client.isLocalServer() && ModuleManager.get(UtilityModules.SmartDisconnect.class).isActive()) guardDisconnect(client, screen);
            // The Sloth menu, one click from the pause screen (top left, clear of the vanilla buttons).
            if (pause.showsPauseMenu()) {
                Screens.getButtons(screen).add(new com.sloth.client.screen.widget.SlothButton(6, 6, 92, 16, Component.literal("✦ Sloth Menu"),
                    com.sloth.client.screen.widget.SlothButton.Style.NORMAL, b -> client.setScreen(new com.sloth.client.screen.ClientOverlayScreen(screen))));
            }
        });

        ClientTickEvents.END_CLIENT_TICK.register(client -> {
            PackDiagnostics.tick(client); com.sloth.client.studio.ConnectionHealth.tick(client);
            Friends.tick(client);
            com.sloth.client.studio.Studio.tick(client);
            com.sloth.client.studio.TemporaryControls.tick(client);
            Tracking.tick(client);
            com.sloth.client.studio.GameplayTracker.tick(client);
            ModuleManager.tick(client);
            com.sloth.client.studio.FreelookDiagnostics.tick(client);
            while (MOD_MENU.consumeClick()) if (client.screen == null) client.setScreen(new com.sloth.client.screen.ClientOverlayScreen(null));
            while (STUDIO.consumeClick()) if (client.screen == null || client.screen instanceof com.sloth.client.screen.StudioScreen || client.screen instanceof com.sloth.client.screen.MenuFrame || client.screen instanceof com.sloth.client.screen.ClientOverlayScreen) client.setScreen(client.screen == null
                ? new com.sloth.client.screen.ClientOverlayScreen(null) : null);
            while(QUICK_WHEEL.consumeClick()) if(client.screen==null && client.level!=null)client.setScreen(new com.sloth.client.screen.QuickWheelScreen());
            while(QUICK_CONTROLS.consumeClick()) if(client.screen==null) client.setScreen(new com.sloth.client.screen.QuickControlsScreen());
            while (STOPWATCH.consumeClick()) ModuleManager.get(InfoHud.Stopwatch.class).press();
            while (BOOKMARK.consumeClick()) if(client.player!=null){var p=com.sloth.client.studio.GameplayTracker.bookmark("Moment");client.player.displayClientMessage(Component.literal("Sloth saved a moment: "+com.sloth.client.studio.GameplayTracker.coords(p)),true);}
            while (BUILD_ANCHOR.consumeClick()) if(client.player!=null){com.sloth.client.studio.GameplayTracker.setBuildAnchor();client.player.displayClientMessage(Component.literal("Sloth build anchor set · "+com.sloth.client.studio.GameplayTracker.buildMeasure()),true);}
            while (CHAT_HUB.consumeClick()) if(client.screen==null) client.setScreen(new com.sloth.client.screen.ChatHubScreen(null));
            while (TOGGLE_HUD.consumeClick()) {
                ModuleManager.hudHidden = !ModuleManager.hudHidden;
                ModuleManager.save();
                if (client.player != null) client.player.displayClientMessage(Component.literal("Sloth HUD " + (ModuleManager.hudHidden ? "hidden" : "shown")), true);
            }
        });

        DevCheck.install();
        String version = FabricLoader.getInstance().getModContainer(MOD_ID).map(c -> c.getMetadata().getVersion().getFriendlyString()).orElse("dev");
        LOG.info("Sloth Client {} loaded with {} modules", version, ModuleManager.all().size());
    }

    /** Smart Disconnect: the pause menu's Disconnect button asks for confirmation first. */
    private static void guardDisconnect(Minecraft client, net.minecraft.client.gui.screens.Screen screen) {
        List<AbstractWidget> buttons = Screens.getButtons(screen);
        for (int i = 0; i < buttons.size(); i++) {
            if (!(buttons.get(i) instanceof Button original)) continue;
            if (!(original.getMessage().getContents() instanceof TranslatableContents t) || !t.getKey().equals("menu.disconnect")) continue;
            Button guarded = Button.builder(original.getMessage(), b -> client.setScreen(new ConfirmScreen(yes -> {
                if (yes) original.onPress(new KeyEvent(GLFW.GLFW_KEY_ENTER, 0, 0));
                else client.setScreen(screen);
            }, Component.literal("Leave this server?"), Component.literal(client.getCurrentServer() != null ? "You'll be disconnected from " + client.getCurrentServer().name + "." : "You'll be disconnected."))))
                .bounds(original.getX(), original.getY(), original.getWidth(), original.getHeight()).build();
            buttons.set(i, guarded);
            return;
        }
    }
}
