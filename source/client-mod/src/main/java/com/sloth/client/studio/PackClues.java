package com.sloth.client.studio;
import java.util.Locale;
/** Fixed guidance only. Never returns an observed URL, log line or exception. */
public final class PackClues {
 public record Finding(String advice,boolean failure){}
 public static Finding classify(String logger,String message){
  String text=message==null?"":message.toLowerCase(Locale.ROOT),name=logger==null?"":logger.toLowerCase(Locale.ROOT);
  boolean related=name.contains("serverpack")||name.contains("downloadqueue")||name.contains("fontmanager")||text.contains("resource pack")||text.contains("resource-pack")||text.contains("font provider");
  if(text.contains("missing texture references"))return new Finding("Pack models reference missing textures. Check the pack's Minecraft version and dependencies.",false);
  if(text.contains("not compatible with font atlas resizing"))return new Finding("A pack needs the standard font atlas. Minecraft used its compatibility fallback; this alone does not mean badges failed.",false);
  if(!related)return null;
  boolean failed=text.contains("fail")||text.contains("error")||text.contains("couldn't")||text.contains("unable")||text.contains("invalid");if(!failed)return null;
  if(text.contains("404")||text.contains("403"))return new Finding("Server pack link is unavailable or private. The server owner must provide a public direct ZIP link.",true);
  if(text.contains("hash")||text.contains("checksum"))return new Finding("Pack integrity check failed. Reconnect to download it again; the server owner may need to correct its advertised hash.",true);
  if(name.contains("font")||text.contains("font"))return new Finding("A pack font could not load. Custom badges may show as boxes; review font files and bitmap references.",true);
  if(text.contains("shader"))return new Finding("A pack shader failed. Check pack compatibility before reloading; do not replace Minecraft libraries.",true);
  if(text.contains("download")||name.contains("download"))return new Finding("A resource pack could not download. Check the server's pack link and your connection.",true);
  return new Finding("A resource pack could not load. Review its compatibility and Game Log.",true);
 }
 private PackClues(){}
}
