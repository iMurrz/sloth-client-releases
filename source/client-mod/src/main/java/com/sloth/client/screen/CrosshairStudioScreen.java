package com.sloth.client.screen;
import com.sloth.client.module.*;
import com.sloth.client.module.impl.VisualModules;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.Component;
public final class CrosshairStudioScreen extends SlothScreen {
 private final Screen parent; private final VisualModules.Crosshair cross=ModuleManager.get(VisualModules.Crosshair.class); private int x,y,w,h;private int sample;
 public CrosshairStudioScreen(Screen p){super(Component.literal("Crosshair"));parent=p;}
 protected void init(){w=Math.min(450,width-24);h=Math.min(320,height-20);x=(width-w)/2;y=(height-h)/2;
 button(x+12,y+h-56,100,20,"Shape & colour",b->minecraft.setScreen(new ModuleSettingsScreen(this,cross)));
 button(x+118,y+h-56,100,20,"Preview colour",b->{sample=(sample+1)%7;});
 button(x+w-104,y+10,92,20,cross.isEnabled()?"On":"Off",b->{cross.toggle();ModuleManager.save();b.setMessage(Component.literal(cross.isEnabled()?"On":"Off"));});
 primary(x+w-104,y+h-30,92,20,"Done",b->onClose());
 String[] names={"Precision","Classic","Builder"};for(int i=0;i<3;i++){final int n=i;button(x+12+i*((w-24)/3),y+48,(w-30)/3,20,names[i],b->{for(var s:cross.settings()){if(s.id.equals("style"))((Setting.Choice)s).set(n==0?"Dot":n==1?"Cross":"Plus + dot");if(s.id.equals("size"))((Setting.Number)s).set(n==0?2.0:5.0);if(s.id.equals("gap"))((Setting.Number)s).set(n==0?0.0:2.0);}ModuleManager.save();});}}
 public void renderBackground(GuiGraphics g,int mx,int my,float t){super.renderBackground(g,mx,my,t);Ui.panel(g,x,y,w,h,Ui.BG);}
 public void render(GuiGraphics g,int mx,int my,float t){super.render(g,mx,my,t);g.drawString(font,"CROSSHAIR",x+12,y+14,Ui.TEXT,false);g.drawString(font,Ui.ellipsize(font,"Choose a shape, then adjust its size and colour.",w-24),x+12,y+30,Ui.MUTED,false);int py=y+80,ph=Math.max(35,h-146);g.fill(x+12,py,x+w-12,py+ph,sample==1?0xFFCBD2DD:0xFF292E35);int base=cross.settings().stream().filter(s->s.id.equals("color")).map(s->((Setting.Colour)s).argb()).findFirst().orElse(0xFFFFFFFF);int[] colors={base,base,0xFF49E8E0,0xFF41E581,0xFF59D595,0xFFFF6C78,0xFFFFD16A};cross.renderPreview(g,x+w/2,py+ph/2,colors[sample],0);g.drawString(font,new String[]{"Dark background","Light background","Diamond colour sample","Emerald colour sample","Allied player sample","Hostile mob sample","Utility block sample"}[sample],x+18,py+8,sample==1?0xFF202020:Ui.MUTED,false);}
 public void onClose(){minecraft.setScreen(parent);}
}
