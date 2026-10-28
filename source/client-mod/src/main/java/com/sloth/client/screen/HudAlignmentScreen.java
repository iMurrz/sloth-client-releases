package com.sloth.client.screen;

import com.sloth.client.module.HudModule;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.EditBox;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.Component;
import java.util.function.Consumer;

/** One-time placement presets. The caller retains explicit Apply and its undo transaction. */
public final class HudAlignmentScreen extends SlothScreen {
    private final Screen parent;
    private final HudModule hud;
    private final double scale;
    private final Consumer<int[]> place;
    private EditBox margin;
    private int x,y,w,h,col;
    private String status="Choose a position; then Apply on the previous screen.";
    public HudAlignmentScreen(Screen parent,HudModule hud,double scale,Consumer<int[]> place){super(Component.literal("HUD alignment"));this.parent=parent;this.hud=hud;this.scale=scale;this.place=place;}
    @Override protected void init(){
        String value=margin==null?"8":margin.getValue();
        w=Math.min(420,width-16);h=Math.min(240,height-16);x=(width-w)/2;y=(height-h)/2;col=(w-32)/3;
        margin=new EditBox(font,x+10,y+51,w-20,20,Component.literal("Edge spacing in GUI pixels"));margin.setMaxLength(6);margin.setValue(value);addRenderableWidget(margin);
        String[] names={"Top left","Top center","Top right","Middle left","Center","Middle right","Bottom left","Bottom center","Bottom right"};
        for(int i=0;i<9;i++){final int horizontal=i%3,vertical=i/3;button(x+10+horizontal*(col+6),y+81+vertical*26,col,20,names[i],b->choose(horizontal,vertical));}
        button(x+10,y+h-30,w-20,20,"Back",b->onClose());
    }
    private int coordinate(int slot,int available,int spacing){return slot==1?available/2:slot==0?Math.min(spacing,available/2):available-Math.min(spacing,available/2);}
    private void choose(int horizontal,int vertical){
        try{int spacing=Integer.parseInt(margin.getValue().trim());if(spacing<0||spacing>Math.max(width,height))throw new IllegalArgumentException();
            int maxX=Math.max(0,width-(int)Math.round((hud.contentWidth(MenuFont.hud(),true)+6)*scale));
            int maxY=Math.max(0,height-(int)Math.round((hud.contentHeight(MenuFont.hud(),true)+6)*scale));
            place.accept(new int[]{coordinate(horizontal,maxX,spacing),coordinate(vertical,maxY,spacing)});minecraft.setScreen(parent);
        }catch(RuntimeException e){status="Enter nonnegative whole-pixel spacing within the canvas.";}
    }
    @Override public void renderBackground(GuiGraphics g,int mx,int my,float t){super.renderBackground(g,mx,my,t);Ui.panel(g,x,y,w,h,Ui.BG);}
    @Override public void render(GuiGraphics g,int mx,int my,float t){super.render(g,mx,my,t);g.drawString(font,Ui.ellipsize(font,hud.name+" · Align to screen",w-20),x+10,y+12,Ui.TEXT,false);g.drawString(font,"Edge spacing (GUI pixels)",x+10,y+36,Ui.DIM,false);g.drawString(font,Ui.ellipsize(font,status,w-20),x+10,y+h-49,Ui.MUTED,false);}
    @Override public void onClose(){minecraft.setScreen(parent);}
}
