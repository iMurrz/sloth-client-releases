package com.sloth.client.screen;

import com.sloth.client.module.ModuleManager;
import com.sloth.client.studio.*;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.network.chat.Component;

/** A small keyboard-accessible toolbar. Opening it makes the cursor available without changing movement settings. */
public final class QuickControlsScreen extends SlothScreen {
    private int x,y,w,h;
    public QuickControlsScreen(){super(Component.literal("Quick controls"));}
    @Override protected void init(){
        var pins=Preferences.ids("pins");w=Math.min(360,width-24);h=Math.min(height-20,96+((pins.size()+1)/2)*28);x=(width-w)/2;y=(height-h)/2;
        int bw=(w-36)/2;
        for(int i=0;i<pins.size();i++){var m=ModuleManager.get(pins.get(i));if(m==null)continue;
            var b=button(x+12+(i%2)*(bw+12),y+40+(i/2)*28,bw,22,(m.isEnabled()?"✓ ":"○ ")+m.name,btn->{if(!ModuleManager.isServerBlocked(m.id)){m.toggle();ModuleManager.save();rebuildWidgets();}});
            b.active=!ModuleManager.isServerBlocked(m.id);b.setTooltip(net.minecraft.client.gui.components.Tooltip.create(Component.literal(m.description+" · Right Shift opens full settings.")));
        }
        button(x+12,y+h-32,100,20,"Customize",b->minecraft.setScreen(new StudioScreen(this,StudioScreen.Page.PINS)));
        primary(x+w-100,y+h-32,88,20,"Resume",b->onClose());
    }
    @Override public void renderBackground(GuiGraphics g,int mx,int my,float t){g.fill(0,0,width,height,0x50000000);Ui.panel(g,x,y,w,h,Ui.BG);}
    @Override public void render(GuiGraphics g,int mx,int my,float t){super.render(g,mx,my,t);g.drawString(font,"QUICK CONTROLS",x+12,y+13,Ui.ACCENT_SOFT,false);}
    @Override public void onClose(){minecraft.setScreen(null);}
}
