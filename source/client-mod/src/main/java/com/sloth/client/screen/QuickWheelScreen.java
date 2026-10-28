package com.sloth.client.screen;
import com.sloth.client.SlothClient;import com.sloth.client.module.ModuleManager;import com.sloth.client.studio.Preferences;import net.minecraft.client.gui.GuiGraphics;import net.minecraft.client.input.KeyEvent;import net.minecraft.client.input.MouseButtonEvent;import net.minecraft.network.chat.Component;import java.util.*;
/** Hold a key, point at a tool and release. Escape or lost focus cancels. */
public final class QuickWheelScreen extends SlothScreen {
 private record Action(String label,Runnable run){}private List<Action> actions;private int selected=-1;
 public QuickWheelScreen(){super(Component.literal("Quick settings wheel"));}
 protected void init(){var a=new ArrayList<Action>();for(String id:Preferences.ids("pins").stream().limit(6).toList()){var m=ModuleManager.get(id);if(m!=null)a.add(new Action(m.name,()->{if(!m.isAlwaysEnabled()&&!ModuleManager.isServerBlocked(m.id)){m.toggle();ModuleManager.save();}}));}a.add(new Action("HUD editor",()->minecraft.setScreen(new HudEditorScreen(null))));a.add(new Action("Crosshair Studio",()->minecraft.setScreen(new CrosshairStudioScreen(null))));a.add(new Action("Capture tools",()->minecraft.setScreen(new StudioScreen(null,StudioScreen.Page.CAPTURE))));a.add(new Action("Sound controls",()->minecraft.setScreen(new ModuleSettingsScreen(null,ModuleManager.get("better_sounds")))));actions=a;}
 public void tick(){if(!minecraft.isWindowActive()||(minecraft.level==null&&!Boolean.getBoolean("sloth.devCheckPolish")))minecraft.setScreen(null);}
 public void renderBackground(GuiGraphics g,int mx,int my,float t){g.fill(0,0,width,height,0xA0120610);g.fillGradient(0,0,width,height,(Ui.ACCENT&0xFFFFFF)|0x00000000,(Ui.ACCENT&0xFFFFFF)|0x28000000);}
 private boolean compact(){return width<600||height<340;}
 private int[] bounds(int i){
  if(compact()){int bw=Math.min(160,(width-30)/2),rows=(actions.size()+1)/2,top=(height-rows*28)/2+12;return new int[]{width/2-bw-3+(i%2)*(bw+6),top+(i/2)*28,bw,24};}
  double radius=Math.min(width*.30,height*.32),a=i*Math.PI*2/actions.size()-Math.PI/2;int bw=Math.min(110,(int)(radius*Math.sin(Math.PI/actions.size())*1.3));return new int[]{(int)(width/2+Math.cos(a)*radius)-bw/2,(int)(height/2+Math.sin(a)*radius)-13,bw,26};
 }
 private void point(double mx,double my){selected=-1;if(actions==null||actions.isEmpty())return;if(compact()){for(int i=0;i<actions.size();i++){int[] b=bounds(i);if(Ui.inside(mx,my,b[0],b[1],b[2],b[3]))selected=i;}return;}double dx=mx-width/2.0,dy=my-height/2.0;if(dx*dx+dy*dy<1600)return;double angle=Math.atan2(dy,dx)+Math.PI/2;if(angle<0)angle+=Math.PI*2;selected=((int)Math.floor(angle/(Math.PI*2)*actions.size()+.5))%actions.size();}
 public void render(GuiGraphics g,int mx,int my,float t){super.render(g,mx,my,t);point(mx,my);for(int i=0;i<actions.size();i++){int[] b=bounds(i);Ui.panel(g,b[0],b[1],b[2],b[3],i==selected?Ui.ACCENT:Ui.PANEL);g.drawCenteredString(font,Ui.ellipsize(font,actions.get(i).label,b[2]-10),b[0]+b[2]/2,b[1]+8,i==selected?0xFF151019:Ui.TEXT);}int titleY=compact()?Math.max(4,bounds(0)[1]-25):height/2-8;g.drawCenteredString(font,"QUICK WHEEL",width/2,titleY,Ui.TEXT);g.drawCenteredString(font,Ui.ellipsize(font,"Point and release · Esc cancels",width-16),width/2,compact()?Math.min(height-12,bounds(actions.size()-1)[1]+30):height/2+8,Ui.MUTED);}
 private void choose(){int n=selected;minecraft.setScreen(null);if(n>=0&&n<actions.size())actions.get(n).run.run();}
 public boolean keyReleased(KeyEvent e){var key=net.fabricmc.fabric.api.client.keybinding.v1.KeyBindingHelper.getBoundKeyOf(SlothClient.QUICK_WHEEL);if((key.getType()==com.mojang.blaze3d.platform.InputConstants.Type.KEYSYM&&e.key()==key.getValue())||(key.getType()==com.mojang.blaze3d.platform.InputConstants.Type.SCANCODE&&e.scancode()==key.getValue())){choose();return true;}return super.keyReleased(e);}
 public boolean mouseReleased(MouseButtonEvent e){var key=net.fabricmc.fabric.api.client.keybinding.v1.KeyBindingHelper.getBoundKeyOf(SlothClient.QUICK_WHEEL);if(key.getType()==com.mojang.blaze3d.platform.InputConstants.Type.MOUSE&&key.getValue()==e.button()){point(e.x(),e.y());choose();return true;}return super.mouseReleased(e);}
 public boolean mouseClicked(MouseButtonEvent e,boolean d){if(e.button()==0){point(e.x(),e.y());choose();return true;}return super.mouseClicked(e,d);}
 public void onClose(){minecraft.setScreen(null);}
}
