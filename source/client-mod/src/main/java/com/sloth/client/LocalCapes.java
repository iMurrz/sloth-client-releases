package com.sloth.client;

import com.google.gson.JsonParser;
import com.mojang.blaze3d.platform.NativeImage;
import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.client.Minecraft;
import net.minecraft.client.renderer.texture.DynamicTexture;
import net.minecraft.core.ClientAsset;
import net.minecraft.resources.Identifier;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.UUID;

/** An offline override for the signed-in player's cape only. No network messages or ownership changes. */
public final class LocalCapes {
    private static boolean loaded;
    private static ClientAsset.ResourceTexture texture;
    private LocalCapes() {}
    public static ClientAsset.ResourceTexture texture(UUID player) {
        if (com.sloth.client.module.impl.ReferenceFeatures.Streamer.hideCape()) return null;
        Minecraft mc = Minecraft.getInstance();
        if (!player.equals(mc.getUser().getProfileId())) return null;
        if (loaded) return texture;
        loaded = true;
        try {
            Path root = FabricLoader.getInstance().getConfigDir();
            Path dir = root.resolve("sloth-client");
            Path config = dir.resolve("local-capes.json");
            if (Files.isSymbolicLink(root) || Files.isSymbolicLink(dir) || Files.isSymbolicLink(config) || !Files.isRegularFile(config) || Files.size(config) > 65536) return null;
            var data = JsonParser.parseString(Files.readString(config)).getAsJsonObject();
            if (data.get("schema").getAsInt() != 1) return null;
            var accounts = data.getAsJsonObject("accounts");
            String uuid = player.toString().replace("-", "");
            if (!accounts.has(uuid)) return null;
            String hash = accounts.getAsJsonObject(uuid).get("sha256").getAsString();
            if (!hash.matches("[0-9a-f]{64}")) return null;
            Path folder = dir.resolve("local-capes");
            Path file = folder.resolve(hash + ".png");
            if (Files.isSymbolicLink(folder) || Files.isSymbolicLink(file) || !Files.isRegularFile(file) || Files.size(file) > 131072) return null;
            byte[] bytes = Files.readAllBytes(file);
            if (!HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes)).equals(hash)) return null;
            NativeImage image = NativeImage.read(bytes);
            if (image.getWidth() != 64 || image.getHeight() != 32) { image.close(); return null; }
            Identifier id = Identifier.fromNamespaceAndPath(SlothClient.MOD_ID, "local-cape/" + hash);
            mc.getTextureManager().register(id, new DynamicTexture(() -> "Sloth local cape", image));
            texture = new ClientAsset.ResourceTexture(id, id);
        } catch (Exception e) { SlothClient.LOG.warn("Local cape could not be loaded; using account cape."); }
        return texture;
    }
}
