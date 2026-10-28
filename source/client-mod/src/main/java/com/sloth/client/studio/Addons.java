package com.sloth.client.studio;

import com.google.gson.*;
import net.fabricmc.loader.api.FabricLoader;
import java.nio.file.*;
import java.util.*;
import java.security.MessageDigest;

/** v1 declarative UI extensions. No script, filesystem, network or chat execution capability. */
public final class Addons {
    public static String createExample() {
        Path dir=FabricLoader.getInstance().getConfigDir().resolve("sloth-client/addons");
        try {
            if(Files.isSymbolicLink(dir)) return "Linked addon folders are unsupported.";
            Files.createDirectories(dir);
            Files.writeString(dir.resolve("performance_tools.json"), """
                {"schema":1,"id":"performance_tools","name":"Performance tools","description":"Open local timing and frame-budget tools.","permissions":["ui.open","performance.read"],"target":"performance"}
                """, StandardOpenOption.CREATE_NEW);
            return "Example created. Review its permissions before approving.";
        } catch(FileAlreadyExistsException e) { return "The example already exists; your file was preserved."; }
        catch(Exception e) { return "Could not create the example. Check folder permissions."; }
    }
    public record Addon(String id,String name,String description,String hash,List<String> permissions,String target,String problem) {}
    public static List<Addon> list() {
        List<Addon> out=new ArrayList<>();Path dir=FabricLoader.getInstance().getConfigDir().resolve("sloth-client/addons");
        try {
            if(!Files.isDirectory(dir)||Files.isSymbolicLink(dir))return out;
            try(var files=Files.list(dir)) {for(Path p:files.filter(f->f.getFileName().toString().matches("[a-z0-9_-]{1,40}\\.json")).sorted().limit(32).toList()) {
                try {
                    if(Files.isSymbolicLink(p)||!Files.isRegularFile(p)||Files.size(p)>16384)throw new IllegalArgumentException();
                    byte[] bytes=Files.readAllBytes(p);JsonObject o=JsonParser.parseString(new String(bytes,java.nio.charset.StandardCharsets.UTF_8)).getAsJsonObject();
                    String id=o.get("id").getAsString(),name=o.get("name").getAsString(),target=o.get("target").getAsString();
                    if(o.get("schema").getAsInt()!=1 || !id.matches("[a-z0-9_-]{1,32}")||name.isBlank()||name.length()>48||name.chars().anyMatch(c->c<32)||!Set.of("search","performance","profiles","hud_editor").contains(target))throw new IllegalArgumentException();
                    List<String> permissions=new ArrayList<>();for(JsonElement e:o.getAsJsonArray("permissions")){String permission=e.getAsString();if(!Set.of("ui.open","performance.read","hud.read").contains(permission))throw new IllegalArgumentException();if(permissions.contains(permission)||permissions.size()>=3)throw new IllegalArgumentException();permissions.add(permission);}
                    if(!permissions.contains("ui.open")||target.equals("performance")&&!permissions.contains("performance.read")||target.equals("hud_editor")&&!permissions.contains("hud.read"))throw new IllegalArgumentException();
                    if(out.stream().anyMatch(a->a.id().equals(id)))throw new IllegalArgumentException();
                    String description=o.has("description")?o.get("description").getAsString():"";if(description.length()>180)throw new IllegalArgumentException();
                    String hash=HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));out.add(new Addon(id,name,description,hash,List.copyOf(permissions),target,""));
                }catch(Exception e){out.add(new Addon("",p.getFileName().toString(),"","",List.of(),"","Unsupported or invalid manifest; nothing was loaded."));}
            }}
        }catch(Exception ignored){}return out;
    }
}
