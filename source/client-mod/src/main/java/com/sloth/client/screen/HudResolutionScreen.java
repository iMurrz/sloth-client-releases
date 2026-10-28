package com.sloth.client.screen;
import com.sloth.client.module.*;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.Component;
/** Aspect previews never resize the real game or write layout coordinates. */
public final class HudResolutionScreen extends SlothScreen {
 private final Screen parent;private int x,y,w,h;private int aspect;
 public HudResolutionScreen(Screen p){super(Component.literal("HUD screen previews"));parent=p;}
 protected void init(){w=Math.min(600,width-24);h=Math.min(420,height-20);x=(width-w)/2;y=(height-h)/2;button(x+12,y+38,(w-30)/2,20,"Next screen shape",b->{aspect=(aspect+1)%3;});primary(x+18+(w-30)/2,y+38,(w-30)/2,20,"Back to editor",b->onClose());}
 public void renderBackground(GuiGraphics g,int mx,int my,float t){super.renderBackground(g,mx,my,t);Ui.panel(g,x,y,w,h,Ui.BG);}
 public void render(GuiGraphics g,int mx,int my,float t){super.render(g,mx,my,t);g.drawString(font,"HUD SCREEN PREVIEWS",x+12,y+14,Ui.TEXT,false);int[] vw={640,640,480},vh={360,274,360};double scale=Math.min((w-28)/(double)vw[aspect],Math.max(1,h-130)/(double)vh[aspect]);int pw=(int)(vw[aspect]*scale),ph=(int)(vh[aspect]*scale),px=x+(w-pw)/2,py=y+68;g.fill(px,py,px+pw,py+ph,Ui.PANEL);int overlaps=0;var list=ModuleManager.hudModules().stream().filter(HudModule::isActive).toList();for(var m:list){int ox=m.screenX(MenuFont.hud(),vw[aspect],true),oy=m.screenY(MenuFont.hud(),vh[aspect],true),mw=m.width(MenuFont.hud(),true),mh=m.height(MenuFont.hud(),true);boolean conflict=false;for(var other:list){if(other==m)continue;int bx=other.screenX(MenuFont.hud(),vw[aspect],true),by=other.screenY(MenuFont.hud(),vh[aspect],true);if(ox<bx+other.width(MenuFont.hud(),true)&&ox+mw>bx&&oy<by+other.height(MenuFont.hud(),true)&&oy+mh>by)conflict=true;}if(conflict)overlaps++;int a=px+(int)(ox*scale),b=py+(int)(oy*scale),c=a+Math.max(2,(int)(mw*scale)),d=b+Math.max(2,(int)(mh*scale));g.fill(a,b,c,d,conflict?0xAACC506A:0x8049B28B);g.renderOutline(a,b,c-a,d-b,conflict?0xFFFF7790:Ui.ACCENT);}g.drawString(font,new String[]{"16:9 · widescreen","21:9 · ultrawide","4:3 · compact"}[aspect]+" · "+overlaps+" panels overlap",x+12,y+h-46,Ui.TEXT,false);g.drawString(font,Ui.ellipsize(font,"Sample GUI sizes. Rectangles follow the current HUD; actual text and GUI scale vary.",w-24),x+12,y+h-28,Ui.MUTED,false);}
 public void onClose(){minecraft.setScreen(parent);}
}
