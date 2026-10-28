package com.sloth.client.studio;

import net.fabricmc.fabric.api.client.keybinding.v1.KeyBindingHelper;
import net.minecraft.client.Minecraft;
import net.minecraft.client.KeyMapping;
import net.minecraft.network.chat.Component;
import java.util.*;

/** Shared physical key assignments, including vanilla and loaded mod mappings. */
public final class KeyConflicts {
    public record Conflict(String key,List<KeyMapping> mappings){}
    public static List<Conflict> list(){
        Map<String,List<KeyMapping>> grouped=new LinkedHashMap<>();
        for(KeyMapping k:Minecraft.getInstance().options.keyMappings){var key=KeyBindingHelper.getBoundKeyOf(k);if(key.getValue()==-1)continue;grouped.computeIfAbsent((k.getCategory().equals(KeyMapping.Category.DEBUG) ? "debug:" : "normal:") + key.getName(),n->new ArrayList<>()).add(k);}
        List<Conflict> out=new ArrayList<>();for(var e:grouped.entrySet())if(e.getValue().size()>1)out.add(new Conflict((e.getKey().startsWith("debug:") ? "F3 + " : "") + e.getValue().getFirst().getTranslatedKeyMessage().getString(),List.copyOf(e.getValue())));return out;
    }
    public static String name(KeyMapping k){return Component.translatable(k.getName()).getString();}
}
