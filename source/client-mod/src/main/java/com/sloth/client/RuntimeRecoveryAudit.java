package com.sloth.client;

import com.google.gson.JsonObject;
import com.sloth.client.module.ModuleManager;
import com.sloth.client.module.impl.Tracking;
import java.nio.file.Files;
import net.fabricmc.loader.api.FabricLoader;

/** Opt-in checks run only in an isolated developer fixture. */
final class RuntimeRecoveryAudit {
    static void run() throws Exception {
        if(!Boolean.getBoolean("sloth.devCheckRuntimeRecovery"))return;
        var file=FabricLoader.getInstance().getConfigDir().resolve("sloth-client/modules.json");
        byte[] original=Files.exists(file)?Files.readAllBytes(file):null;
        JsonObject before=ModuleManager.snapshot();
        var backup=file.resolveSibling("modules.previous.json");
        byte[] backupOriginal=Files.exists(backup)?Files.readAllBytes(backup):null;
        try {
            JsonObject broken=new JsonObject(), modules=new JsonObject(), first=new JsonObject(), second=new JsonObject();
            first.addProperty("favorite",!ModuleManager.all().get(0).favorite);
            second.add("enabled",new JsonObject());
            modules.add(ModuleManager.all().get(0).id,first);
            modules.add(ModuleManager.all().get(1).id,second);
            broken.add("modules",modules);
            Files.createDirectories(file.getParent());Files.writeString(file,broken.toString());
            Files.writeString(backup,before.toString());
            ModuleManager.load();
            if(!before.equals(ModuleManager.snapshot()))throw new IllegalStateException("Partially applied module config");
            com.sloth.client.studio.SettingsHistory.checkpoint();
            JsonObject changed=before.deepCopy();changed.addProperty("hudHidden",!ModuleManager.hudHidden);
            com.sloth.client.studio.SettingsHistory.record(changed);
            com.sloth.client.studio.SettingsHistory.initialize(changed);
            if(com.sloth.client.studio.SettingsHistory.entries().isEmpty())throw new IllegalStateException("Settings history did not survive restart");
            var restoredHistory=com.sloth.client.studio.SettingsHistory.entries().getFirst().setup();
            // Parsed JSON numbers use a different Gson representation from runtime float settings.
            if(!restoredHistory.equals(com.google.gson.JsonParser.parseString(before.toString())))throw new IllegalStateException("Settings history changed after restart");
        } finally { if(original==null)Files.deleteIfExists(file);else Files.write(file,original);if(backupOriginal==null)Files.deleteIfExists(backup);else Files.write(backup,backupOriginal); }
        Tracking.combo=8;Tracking.lastReach=4;Tracking.speed=60;Tracking.click(0);Tracking.click(1);
        Tracking.reset();
        if(Tracking.combo!=0||Tracking.lastReach!=-1||Tracking.speed!=0||Tracking.leftCps()!=0||Tracking.rightCps()!=0)
            throw new IllegalStateException("Session counters did not reset");
        SlothClient.LOG.info("DEVCHECK runtime recovery checks passed");
    }
}
