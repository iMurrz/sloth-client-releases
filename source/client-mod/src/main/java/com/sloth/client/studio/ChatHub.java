package com.sloth.client.studio;

import com.mojang.authlib.GameProfile;
import com.sloth.client.module.ModuleManager;
import com.sloth.client.module.impl.UtilityModules;
import net.minecraft.client.Minecraft;
import net.minecraft.network.chat.Component;
import java.time.Instant;
import java.util.*;

/** Bounded, memory-only classification of copies of received messages. Original chat components remain untouched. */
public final class ChatHub {
    public enum Tab { ALL("All"), CHAT("Chat"), MESSAGES("Messages"), MENTIONS("Mentions"), SYSTEM("System"); public final String label;Tab(String label){this.label=label;} }
    public record Entry(Component component,Tab primary,boolean mention,long receivedAt) {}
    private static final Deque<Entry> ENTRIES=new ArrayDeque<>();
    private static final EnumMap<Tab,Integer> UNREAD=new EnumMap<>(Tab.class);
    private static Tab selected=Tab.ALL;
    private ChatHub(){}
    private static UtilityModules.ChatHub module(){var m=ModuleManager.get("chat_hub");return m instanceof UtilityModules.ChatHub h?h:null;}
    public static void receiveChat(Component message, GameProfile sender){
        var m=module();if(m==null||!m.isActive())return;String raw=message.getString(),lower=raw.toLowerCase(Locale.ROOT);String self=Minecraft.getInstance().getUser().getName().toLowerCase(Locale.ROOT);
        boolean mention=!self.isBlank()&&lower.contains(self);boolean pm=m.privateMessages.on()&&(lower.contains(" whispers")||lower.startsWith("from ")||lower.contains(" -> me")||lower.contains("[pm]")||lower.contains("private message"));
        add(new Entry(message.copy(),pm?Tab.MESSAGES:Tab.CHAT,mention,System.currentTimeMillis()));
    }
    public static void receiveSystem(Component message){var m=module();if(m==null||!m.isActive())return;add(new Entry(message.copy(),Tab.SYSTEM,false,System.currentTimeMillis()));}
    private static void add(Entry e){var m=module();if(m==null)return;ENTRIES.addLast(e);while(ENTRIES.size()>m.capacity.i())ENTRIES.removeFirst();if(selected!=Tab.ALL)UNREAD.merge(Tab.ALL,1,Integer::sum);if(selected!=e.primary)UNREAD.merge(e.primary,1,Integer::sum);if(e.mention&&selected!=Tab.MENTIONS)UNREAD.merge(Tab.MENTIONS,1,Integer::sum);}
    public static List<Entry> entries(Tab tab){return ENTRIES.stream().filter(e->tab==Tab.ALL||e.primary==tab||tab==Tab.MENTIONS&&e.mention).toList();}
    public static int unread(Tab tab){return UNREAD.getOrDefault(tab,0);}
    public static Tab selected(){return selected;}
    public static void select(Tab tab){selected=tab;UNREAD.remove(tab);}
    public static void clear(){ENTRIES.clear();UNREAD.clear();}
}
