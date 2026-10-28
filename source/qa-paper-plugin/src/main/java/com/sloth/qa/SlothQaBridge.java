package com.sloth.qa;

import org.bukkit.Bukkit;
import org.bukkit.command.*;
import org.bukkit.entity.Player;
import org.bukkit.plugin.java.JavaPlugin;
import java.util.*;

/** Server-owned, visible authorization. It grants no anti-cheat exemptions and changes no packets. */
public final class SlothQaBridge extends JavaPlugin implements CommandExecutor {
    private static final String CAPS="aim_assist,auto_attack,auto_mine,entity_esp,ore_scanner";
    private final Set<UUID> enabled=new HashSet<>();
    @Override public void onEnable(){Objects.requireNonNull(getCommand("slothqa")).setExecutor(this);Bukkit.getScheduler().runTaskTimer(this,()->enabled.stream().map(Bukkit::getPlayer).filter(Objects::nonNull).forEach(this::grant),1,100);}
    @Override public void onDisable(){enabled.stream().map(Bukkit::getPlayer).filter(Objects::nonNull).forEach(this::revoke);enabled.clear();}
    @Override public boolean onCommand(CommandSender sender,Command command,String label,String[] args){if(!(sender instanceof Player p)){sender.sendMessage("Players only.");return true;}if(args.length!=1)return false;switch(args[0].toLowerCase(Locale.ROOT)){case "on"->{enabled.add(p.getUniqueId());grant(p);p.sendMessage("Sloth QA authorization enabled for this connection.");}case "off"->{enabled.remove(p.getUniqueId());revoke(p);p.sendMessage("Sloth QA authorization disabled.");}case "status"->p.sendMessage("Sloth QA: "+(enabled.contains(p.getUniqueId())?"enabled":"disabled"));default->{return false;}}return true;}
    private void grant(Player p){p.sendActionBar(net.kyori.adventure.text.Component.text("[SLOTH-QA] GRANT "+CAPS));}
    private void revoke(Player p){p.sendActionBar(net.kyori.adventure.text.Component.text("[SLOTH-QA] REVOKE"));}
}
