package com.sloth.client.screen;

import com.google.gson.*;
import com.sloth.client.module.ModuleManager;
import com.sloth.client.studio.SettingsHistory;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.Component;
import java.util.*;

/** Selective setup changes with one preserved Undo baseline per application. */
public final class SetupReviewScreen extends SlothScreen {
 private record Change(List<String> path, JsonElement value, String label) {}
 private final Screen parent; private final String label;
 private final List<Change> changes=new ArrayList<>(); private final Set<Integer> chosen=new HashSet<>();
 private JsonObject before; private int x,y,w,h,offset,per;
 private String status="Choose changes. Your setup stays untouched until Apply.";
 public SetupReviewScreen(Screen p,String l,JsonObject target){super(Component.literal("Review setup"));parent=p;label=l;diff(ModuleManager.snapshot(),target.deepCopy(),new ArrayList<>());for(int i=0;i<changes.size();i++)chosen.add(i);}
 private void diff(JsonObject old,JsonObject next,List<String> path){for(var e:next.entrySet()){if(path.isEmpty()&&e.getKey().equals("activeProfile"))continue;var p=new ArrayList<>(path);p.add(e.getKey());JsonElement previous=old.get(e.getKey());if(e.getValue().isJsonObject()&&previous!=null&&previous.isJsonObject())diff(previous.getAsJsonObject(),e.getValue().getAsJsonObject(),p);else if(!Objects.equals(previous,e.getValue()))changes.add(new Change(p,e.getValue().deepCopy(),friendly(p)+": "+display(previous)+" → "+display(e.getValue())));}}
 private String display(JsonElement v){if(v==null||v.isJsonNull())return "Default";if(v.isJsonPrimitive()){var p=v.getAsJsonPrimitive();if(p.isBoolean())return p.getAsBoolean()?"On":"Off";return p.getAsString();}return v.toString();}
 private String friendly(List<String> path){var names=new ArrayList<String>();com.sloth.client.module.Module owner=null;for(String p:path){if(p.equals("modules")||p.equals("settings"))continue;var module=ModuleManager.get(p);if(module!=null){owner=module;names.add(module.name);continue;}if(path.getFirst().equals("keybindings")&&p.startsWith("key.")){names.add(Component.translatable(p).getString());continue;}String name=p.replace('_',' ');if(owner!=null)for(var setting:owner.settings())if(setting.id.equals(p))name=setting.name;names.add(name);}return String.join(" / ",names);}
 protected void init(){
  w=Math.min(560,width-24);h=Math.min(400,height-20);x=(width-w)/2;y=(height-h)/2;
  boolean narrow=w<370;int rowTop=narrow?86:62;per=Math.max(1,(h-rowTop-62)/28);offset=Math.min(offset,Math.max(0,changes.size()-1));
  for(int i=0;i<per&&offset+i<changes.size();i++){final int n=offset+i;var row=button(x+12,y+rowTop+i*28,w-24,22,Ui.ellipsize(font,(chosen.contains(n)?"✓ ":"○ ")+changes.get(n).label,w-36),b->{if(!chosen.remove(n))chosen.add(n);rebuildWidgets();});row.setTooltip(net.minecraft.client.gui.components.Tooltip.create(Component.literal(changes.get(n).label)));}
  int col=(w-30)/2;
  button(x+12,y+36,narrow?col:80,20,"Select all",b->{for(int i=0;i<changes.size();i++)chosen.add(i);rebuildWidgets();});
  button(narrow?x+18+col:x+98,y+36,narrow?col:70,20,"Clear",b->{chosen.clear();rebuildWidgets();});
  var prev=button(narrow?x+12:x+w-172,y+(narrow?60:36),narrow?col:76,20,"Previous",b->{offset=Math.max(0,offset-per);rebuildWidgets();});prev.active=offset>0;
  var next=button(narrow?x+18+col:x+w-90,y+(narrow?60:36),narrow?col:78,20,"Next",b->{offset+=per;rebuildWidgets();});next.active=offset+per<changes.size();
  int bw=(w-36)/3;
  var apply=primary(x+12,y+h-32,bw,20,"Apply",b->{
   JsonObject current=ModuleManager.snapshot();var merged=current.deepCopy();for(int n:chosen){var c=changes.get(n);JsonObject o=merged;for(int i=0;i<c.path.size()-1;i++){String key=c.path.get(i);if(!o.has(key)||!o.get(key).isJsonObject())o.add(key,new JsonObject());o=o.getAsJsonObject(key);}o.add(c.path.getLast(),c.value.deepCopy());}
   SettingsHistory.checkpoint();boolean applied=ModuleManager.restore(merged);if(applied){before=current;com.sloth.client.studio.Studio.finishSetup();}status=applied?"Selected changes applied. Undo is available.":"Could not apply this setup.";rebuildWidgets();
  });apply.active=before==null&&!chosen.isEmpty();
  var undo=button(x+18+bw,y+h-32,bw,20,"Undo",b->{if(before!=null){SettingsHistory.checkpoint();boolean restored=ModuleManager.restore(before);status=restored?"Previous setup restored.":"Could not restore. You can retry Undo.";if(restored)before=null;rebuildWidgets();}});undo.active=before!=null;
  button(x+24+bw*2,y+h-32,bw,20,"Done",b->onClose());
 }
 public void renderBackground(GuiGraphics g,int mx,int my,float t){super.renderBackground(g,mx,my,t);Ui.panel(g,x,y,w,h,Ui.BG);}
 public void render(GuiGraphics g,int mx,int my,float t){super.render(g,mx,my,t);g.drawString(font,Ui.ellipsize(font,label+" · "+chosen.size()+" / "+changes.size()+" changes",w-24),x+12,y+14,Ui.TEXT,false);g.drawString(font,Ui.ellipsize(font,status,w-24),x+12,y+h-47,Ui.MUTED,false);}
 public void onClose(){minecraft.setScreen(parent);}
}
