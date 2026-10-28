package com.sloth.client.screen;

import com.mojang.blaze3d.platform.InputConstants;
import com.sloth.client.studio.KeyConflicts;
import net.fabricmc.fabric.api.client.keybinding.v1.KeyBindingHelper;
import net.minecraft.client.KeyMapping;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.EditBox;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.input.KeyEvent;
import net.minecraft.client.input.MouseButtonEvent;
import net.minecraft.network.chat.Component;
import java.util.*;
import org.lwjgl.glfw.GLFW;

/** A focused shortcut editor. Escape cancels capture; Delete removes the assignment. */
public final class BindingScreen extends SlothScreen {
 private final Screen parent;private final KeyMapping initial;private KeyMapping capturing;private boolean conflictsOnly;private String query="",status="Choose a binding to change it.";private int x,y,w,h,offset,per;
 public BindingScreen(Screen parent,KeyMapping mapping){super(Component.literal("Shortcut controls"));this.parent=parent;initial=mapping;query=mapping==null?"":KeyConflicts.name(mapping);}
 private List<KeyMapping> matches(){var shared=new HashSet<KeyMapping>();for(var c:KeyConflicts.list())shared.addAll(c.mappings());return Arrays.stream(minecraft.options.keyMappings).filter(k->(!conflictsOnly||shared.contains(k))&&KeyConflicts.name(k).toLowerCase(Locale.ROOT).contains(query.toLowerCase(Locale.ROOT))).sorted(Comparator.comparing(KeyConflicts::name)).toList();}
 protected void init(){w=Math.min(540,width-24);h=Math.min(380,height-20);x=(width-w)/2;y=(height-h)/2;per=Math.max(1,(h-135)/26);var list=matches();offset=Math.min(offset,Math.max(0,list.size()-per));
  var search=new EditBox(font,x+12,y+35,w-142,20,Component.literal("Search shortcuts"));search.setValue(query);search.setResponder(v->{query=v;offset=0;capturing=null;rebuildWidgets();});addRenderableWidget(search);button(x+w-124,y+35,112,20,conflictsOnly?"Shared keys only":"All shortcuts",b->{conflictsOnly=!conflictsOnly;offset=0;capturing=null;rebuildWidgets();});if(capturing==null)setFocused(search);
  for(int i=0;i<per&&offset+i<list.size();i++){var k=list.get(offset+i);String text=KeyConflicts.name(k)+" · "+(capturing==k?"Press a key / mouse button":k.getTranslatedKeyMessage().getString());var b=button(x+12,y+63+i*26,w-24,22,Ui.ellipsize(font,text,w-36),btn->{capturing=k;status="Press a key. Delete = unbind; Esc = cancel.";rebuildWidgets();});boolean shared=KeyConflicts.list().stream().anyMatch(c->c.mappings().contains(k));b.setTooltip(net.minecraft.client.gui.components.Tooltip.create(Component.literal(text+(shared?"\nThis key is shared. Choose another key to resolve it.":""))));}
  int bw=(w-36)/3;var prev=button(x+12,y+h-32,bw,20,"Previous",b->{offset=Math.max(0,offset-per);rebuildWidgets();});prev.active=offset>0;var next=button(x+18+bw,y+h-32,bw,20,"Next",b->{offset+=per;rebuildWidgets();});next.active=offset+per<list.size();button(x+24+bw*2,y+h-32,bw,20,"Done",b->onClose());
 }
 private void bind(InputConstants.Key key){var changed=capturing;capturing.setKey(key);KeyMapping.resetMapping();minecraft.options.save();capturing=null;status=KeyConflicts.list().stream().filter(c->c.mappings().contains(changed)).map(c->"Saved · shared with "+c.mappings().stream().filter(k->k!=changed).map(KeyConflicts::name).reduce((a,b)->a+", "+b).orElse("")).findFirst().orElse("Binding saved · no shared assignment.");rebuildWidgets();}
 public boolean keyPressed(KeyEvent e){if(capturing!=null){if(e.key()==GLFW.GLFW_KEY_ESCAPE){capturing=null;status="Change cancelled.";rebuildWidgets();}else bind(e.key()==GLFW.GLFW_KEY_DELETE?InputConstants.UNKNOWN:InputConstants.getKey(e));return true;}return super.keyPressed(e);}
 public boolean mouseClicked(MouseButtonEvent e,boolean d){if(capturing!=null){bind(InputConstants.Type.MOUSE.getOrCreate(e.button()));return true;}return super.mouseClicked(e,d);}
 public void renderBackground(GuiGraphics g,int mx,int my,float t){super.renderBackground(g,mx,my,t);Ui.panel(g,x,y,w,h,Ui.BG);}
 public void render(GuiGraphics g,int mx,int my,float t){super.render(g,mx,my,t);g.drawString(font,"SHORTCUT CONTROLS",x+12,y+14,Ui.TEXT,false);g.drawString(font,Ui.ellipsize(font,status,w-24),x+12,y+h-47,Ui.MUTED,false);}
 public void onClose(){minecraft.setScreen(parent);}
}
