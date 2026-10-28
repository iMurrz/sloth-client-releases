package com.sloth.client.screen;

import com.sloth.client.module.HudModule;
import com.sloth.client.module.ModuleManager;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.EditBox;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.Component;
import java.util.Locale;
import java.util.function.Consumer;

/** Typed placement is explicit: editing a field does not change the saved HUD until Apply. */
public final class HudPlacementScreen extends SlothScreen {
    private final Screen parent;
    private final HudModule hud;
    private final Consumer<Runnable> transaction;
    private final float originalX, originalY;
    private final double originalScale;
    private EditBox posX, posY, size;
    private int x,y,w,h,col;
    private int nudgeStep=1;
    private String status="Enter GUI pixels and a size multiplier, then Apply.";

    public HudPlacementScreen(Screen parent,HudModule hud,Consumer<Runnable> transaction){
        super(Component.literal("Manual HUD placement"));this.parent=parent;this.hud=hud;
        this.transaction=transaction;originalX=hud.x;originalY=hud.y;originalScale=hud.scale.get();
    }
    @Override protected void init(){
        String px=posX==null?Integer.toString(hud.screenX(MenuFont.hud(),width,true)):posX.getValue();
        String py=posY==null?Integer.toString(hud.screenY(MenuFont.hud(),height,true)):posY.getValue();
        String s=size==null?String.format(Locale.ROOT,"%.2f",hud.scale.get()):size.getValue();
        w=Math.min(460,width-16);h=Math.min(250,height-16);x=(width-w)/2;y=(height-h)/2;col=(w-32)/3;
        posX=field(x+10,y+66,col,"Position X",px);
        posY=field(x+16+col,y+66,col,"Position Y",py);
        size=field(x+22+col*2,y+66,col,"Size",s);
        int bw=(w-38)/4;
        button(x+10,y+96,bw,20,"Left",b->nudge(-nudgeStep,0));
        button(x+16+bw,y+96,bw,20,"Right",b->nudge(nudgeStep,0));
        button(x+22+bw*2,y+96,bw,20,"Up",b->nudge(0,-nudgeStep));
        button(x+28+bw*3,y+96,bw,20,"Down",b->nudge(0,nudgeStep));
        button(x+10,y+124,col,20,"Align…",b->{try{double requested=requestedScale();minecraft.setScreen(new HudAlignmentScreen(this,hud,requested,p->{posX.setValue(Integer.toString(p[0]));posY.setValue(Integer.toString(p[1]));status="Alignment prepared. Apply to save.";}));}catch(RuntimeException e){invalid();}});
        button(x+16+col,y+124,col,20,"Step: "+nudgeStep+" px",b->{nudgeStep=nudgeStep==1?10:1;b.setMessage(Component.literal("Step: "+nudgeStep+" px"));});
        button(x+22+col*2,y+124,col,20,"Defaults",b->{size.setValue(String.format(Locale.ROOT,"%.2f",hud.scale.defaultValue));posX.setValue(Integer.toString(Math.round(hud.defaultX*width)));posY.setValue(Integer.toString(Math.round(hud.defaultY*height)));status="Defaults prepared. Apply to save.";});
        primary(x+10,y+h-30,col,20,"Apply",b->apply());
        button(x+16+col,y+h-30,col,20,"Revert changes",b->save(originalX,originalY,originalScale));
        button(x+22+col*2,y+h-30,col,20,"Done",b->onClose());
    }
    private EditBox field(int fx,int fy,int fw,String label,String value){
        var box=new EditBox(font,fx,fy,fw,20,Component.literal(label));box.setMaxLength(12);box.setValue(value);return addRenderableWidget(box);
    }
    private double requestedScale(){double v=Double.parseDouble(size.getValue().trim());if(!Double.isFinite(v)||v<hud.scale.min||v>hud.scale.max)throw new IllegalArgumentException();return Math.round(v/hud.scale.step)*hud.scale.step;}
    private int maxX(double s){return Math.max(0,width-(int)Math.round((hud.contentWidth(MenuFont.hud(),true)+6)*s));}
    private int maxY(double s){return Math.max(0,height-(int)Math.round((hud.contentHeight(MenuFont.hud(),true)+6)*s));}
    private int bound(int v,int max){return Math.max(0,Math.min(max,v));}
    private void invalid(){status="Use whole X/Y pixels and size 0.50 to 2.50.";}
    private void nudge(int dx,int dy){try{double s=requestedScale();posX.setValue(Integer.toString(bound(Math.addExact(Integer.parseInt(posX.getValue().trim()),dx),maxX(s))));posY.setValue(Integer.toString(bound(Math.addExact(Integer.parseInt(posY.getValue().trim()),dy),maxY(s))));status="Position prepared. Apply to save.";}catch(RuntimeException e){invalid();}}
    private void center(){try{double s=requestedScale();posX.setValue(Integer.toString(maxX(s)/2));posY.setValue(Integer.toString(maxY(s)/2));status="Centered position prepared. Apply to save.";}catch(RuntimeException e){invalid();}}
    private void apply(){try{double s=requestedScale();int px=Integer.parseInt(posX.getValue().trim()),py=Integer.parseInt(posY.getValue().trim());save(bound(px,maxX(s))/(float)width,bound(py,maxY(s))/(float)height,s);}catch(RuntimeException e){invalid();}}
    private void save(float px,float py,double s){
        transaction.accept(()->{float beforeX=hud.x,beforeY=hud.y;double beforeScale=hud.scale.get();hud.x=px;hud.y=py;hud.scale.set(s);
            if(ModuleManager.save()){status="Saved. Position stays proportional when the window changes.";posX.setValue(Integer.toString(hud.screenX(MenuFont.hud(),width,true)));posY.setValue(Integer.toString(hud.screenY(MenuFont.hud(),height,true)));size.setValue(String.format(Locale.ROOT,"%.2f",hud.scale.get()));}
            else{hud.x=beforeX;hud.y=beforeY;hud.scale.set(beforeScale);status="Could not save. Previous placement restored.";}
        });
    }
    @Override public void renderBackground(GuiGraphics g,int mx,int my,float t){super.renderBackground(g,mx,my,t);Ui.panel(g,x,y,w,h,Ui.BG);}
    @Override public void render(GuiGraphics g,int mx,int my,float t){super.render(g,mx,my,t);
        g.drawString(font,Ui.ellipsize(font,hud.name+" · Manual placement",w-20),x+10,y+12,Ui.TEXT,false);
        g.drawString(font,Ui.ellipsize(font,"GUI canvas: "+width+" × "+height+" · X/Y measured from top left",w-20),x+10,y+32,Ui.DIM,false);
        g.drawString(font,"X (pixels)",x+10,y+53,Ui.TEXT,false);g.drawString(font,"Y (pixels)",x+16+col,y+53,Ui.TEXT,false);g.drawString(font,"Size (×)",x+22+col*2,y+53,Ui.TEXT,false);
        g.drawString(font,Ui.ellipsize(font,status,w-20),x+10,y+h-49,Ui.MUTED,false);
    }
    @Override public void onClose(){minecraft.setScreen(parent);}
}
