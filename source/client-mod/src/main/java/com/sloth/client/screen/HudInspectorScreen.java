package com.sloth.client.screen;

import com.sloth.client.module.*;
import com.sloth.client.screen.widget.SlothSlider;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.Component;

/** Common display controls beside an actual HUD preview, using the current resource-pack font. */
public final class HudInspectorScreen extends SlothScreen {
    private final Screen parent;private final HudModule hud;
    private int x,y,w,h,controls,pw;
    public HudInspectorScreen(Screen parent,HudModule hud){super(Component.literal("HUD inspector"));this.parent=parent;this.hud=hud;}
    @Override protected void init(){
        w=Math.min(620,width-24);h=Math.min(330,height-20);x=(width-w)/2;y=(height-h)/2;controls=Math.max(126,(w-42)/2);pw=w-controls-42;
        int row=Math.max(16,Math.min(28,(h-90)/8));int top=y+43;
        slider(top, "Size",hud.scale);
        slider(top+row,"Position X",null);
        slider(top+row*2,"Position Y",null);
        button(x+12,top+row*3,controls,18,"Background: "+(hud.background.on()?"On":"Off"),b->{hud.background.toggle();ModuleManager.save();rebuildWidgets();});
        button(x+12,top+row*4,controls,18,"Text color",b->minecraft.setScreen(new ColorPickerScreen(this,hud.textColor)));
        button(x+12,top+row*5,controls,18,"Panel color",b->minecraft.setScreen(new ColorPickerScreen(this,hud.backgroundColor)));
        button(x+12,top+row*6,controls,18,"Outline color",b->minecraft.setScreen(new ColorPickerScreen(this,hud.borderColor)));
        button(x+12,top+row*7,controls,18,"Text shadow: "+(hud.shadow.on()?"On":"Off"),b->{hud.shadow.toggle();ModuleManager.save();rebuildWidgets();});
        button(x+12,y+h-28,controls,18,"All module settings",b->minecraft.setScreen(new ModuleSettingsScreen(this,hud)));
        primary(x+w-102,y+h-28,90,18,"Done",b->onClose());
        button(x+controls+26,y+h-52,pw,18,"Manual placement",b->minecraft.setScreen(new HudPlacementScreen(this,hud,parent instanceof HudEditorScreen editor ? editor::manualEdit : Runnable::run)));
    }
    private void slider(int top,String label,Setting.Number n){
        boolean isX=label.endsWith("X");double value=n!=null?(n.get()-n.min)/(n.max-n.min):isX?hud.x:hud.y;
        addRenderableWidget(new SlothSlider(x+12,top,controls,18,value){
            {updateMessage();}
            @Override protected void updateMessage(){setMessage(Component.literal(label+": "+(n!=null?n.display():Math.round((isX?hud.x:hud.y)*100)+"%")));}
            @Override protected void applyValue(){if(n!=null)n.set(n.min+value*(n.max-n.min));else if(isX)hud.x=(float)value;else hud.y=(float)value;ModuleManager.save();}
        });
    }
    @Override public void renderBackground(GuiGraphics g,int mx,int my,float t){super.renderBackground(g,mx,my,t);Ui.panel(g,x,y,w,h,Ui.BG);}
    @Override public void render(GuiGraphics g,int mx,int my,float t){
        super.render(g,mx,my,t);g.drawString(font,Ui.ellipsize(font,hud.name+" · Live inspector",w-24),x+12,y+14,Ui.TEXT,false);
        int px=x+controls+26,py=y+43,ph=h-104;Ui.panel(g,px,py,pw,ph,Ui.PANEL);
        var gameFont=MenuFont.hud();int cw=hud.contentWidth(gameFont,true)+6,ch=hud.contentHeight(gameFont,true)+6;
        float scale=Math.min(hud.scale.f(),Math.min((pw-16f)/Math.max(1,cw),(ph-38f)/Math.max(1,ch)));
        g.enableScissor(px+2,py+26,px+pw-2,py+ph-2);g.pose().pushMatrix();g.pose().translate(px+8,py+32);g.pose().scale(scale,scale);
        if(hud.background.on()){g.fill(0,0,cw,ch,hud.backgroundColor.argb());g.renderOutline(0,0,cw,ch,hud.borderColor.argb());}
        hud.renderContent(g,gameFont,3,3,true);g.pose().popMatrix();g.disableScissor();
        g.drawString(font,Ui.ellipsize(font,ModuleManager.saveStatus(),pw-16),px+8,py+ph-13,Ui.MUTED,false);
    }
    @Override public void onClose(){ModuleManager.save();minecraft.setScreen(parent);}
}
