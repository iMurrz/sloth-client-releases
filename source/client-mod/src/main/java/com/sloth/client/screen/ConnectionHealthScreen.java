package com.sloth.client.screen;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.Component;
import com.sloth.client.studio.ConnectionHealth;
import java.util.*;
public final class ConnectionHealthScreen extends SlothScreen {
 private final Screen parent;private int x,y,w,h,offset;private List<String> lines=List.of();
 public ConnectionHealthScreen(Screen p){super(Component.literal("Connection health"));parent=p;}
 protected void init(){w=Math.min(560,width-24);h=Math.min(380,height-20);x=(width-w)/2;y=(height-h)/2;lines=ConnectionHealth.report();button(x+12,y+h-32,(w-30)/2,20,"Refresh",b->rebuildWidgets());primary(x+18+(w-30)/2,y+h-32,(w-30)/2,20,"Back",b->onClose());}
 public void renderBackground(GuiGraphics g,int mx,int my,float t){super.renderBackground(g,mx,my,t);Ui.panel(g,x,y,w,h,Ui.BG);}
 public void render(GuiGraphics g,int mx,int my,float t){super.render(g,mx,my,t);g.drawString(font,"CONNECTION HEALTH",x+12,y+14,Ui.TEXT,false);int py=y+40;for(String line:lines.stream().skip(offset).toList()){if(py>y+h-50)break;g.drawString(font,Ui.ellipsize(font,line,w-24),x+12,py,Ui.MUTED,false);py+=17;}}
 public boolean mouseScrolled(double mx,double my,double dx,double dy){offset=Math.max(0,Math.min(Math.max(0,lines.size()-Math.max(1,(h-88)/17)),offset-(int)Math.signum(dy)));return true;}
 public void onClose(){minecraft.setScreen(parent);}
}
