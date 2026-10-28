package com.sloth.client.screen;
import com.sloth.client.module.HudModule;
import com.sloth.client.studio.HudPacking;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.network.chat.Component;
import java.util.*;
import java.util.function.Consumer;
/** Explicit preview before a placement transaction; Undo belongs to the editor. */
public final class HudArrangeScreen extends SlothScreen {
 private final HudEditorScreen parent;private final List<HudModule> modules;private final List<HudPacking.Box> obstacles;private final Consumer<Runnable> apply;
 private final int canvasW,canvasH;private HudPacking.Plan plan;private int x,y,w,h,offset;
 public HudArrangeScreen(HudEditorScreen parent,List<HudModule> modules,List<HudPacking.Box> obstacles,Consumer<Runnable> apply){super(Component.literal("Arrange HUDs"));this.parent=parent;this.modules=List.copyOf(modules);this.obstacles=List.copyOf(obstacles);this.apply=apply;canvasW=minecraft.getWindow().getGuiScaledWidth();canvasH=minecraft.getWindow().getGuiScaledHeight();}
 protected void init(){w=Math.min(440,width-24);h=Math.min(320,height-20);x=(width-w)/2;y=(height-h)/2;var boxes=modules.stream().map(m->new HudPacking.Box(m.screenX(MenuFont.hud(),width,true),m.screenY(MenuFont.hud(),height,true),m.width(MenuFont.hud(),true)+4,m.height(MenuFont.hud(),true)+4)).toList();plan=HudPacking.arrange(boxes,obstacles,width,height);
  button(x+12,y+h-30,(w-30)/2,20,"Cancel",b->onClose());var accept=primary(x+18+(w-30)/2,y+h-30,(w-30)/2,20,"Apply arrangement",b->{apply.accept(()->{for(int i=0;i<modules.size();i++){var m=modules.get(i);var p=plan.boxes().get(i);m.x=p.x()/(float)width;m.y=p.y()/(float)height;}com.sloth.client.module.ModuleManager.save();});onClose();});accept.active=!modules.isEmpty()&&width==canvasW&&height==canvasH;}
 public void renderBackground(GuiGraphics g,int mx,int my,float t){super.renderBackground(g,mx,my,t);Ui.panel(g,x,y,w,h,Ui.BG);}
 public void render(GuiGraphics g,int mx,int my,float t){super.render(g,mx,my,t);g.drawString(font,"REVIEW HUD ARRANGEMENT",x+12,y+14,Ui.TEXT,false);g.drawString(font,Ui.ellipsize(font,width!=canvasW||height!=canvasH?"Canvas changed. Return to the editor and preview again.":modules.size()+" HUDs · "+plan.unresolved()+" could not fit · Undo available",w-24),x+12,y+34,plan.unresolved()>0?Ui.BAD:Ui.MUTED,false);int row=0;for(int i=offset;i<modules.size()&&y+60+row*18<y+h-48;i++,row++){var p=plan.boxes().get(i);g.drawString(font,Ui.ellipsize(font,modules.get(i).name+" → "+p.x()+", "+p.y(),w-24),x+12,y+60+row*18,Ui.TEXT,false);}}
 public boolean mouseScrolled(double mx,double my,double sx,double sy){offset=Math.max(0,Math.min(Math.max(0,modules.size()-Math.max(1,(h-108)/18)),offset-(int)Math.signum(sy)));return true;}
 public void onClose(){minecraft.setScreen(parent);}
}
