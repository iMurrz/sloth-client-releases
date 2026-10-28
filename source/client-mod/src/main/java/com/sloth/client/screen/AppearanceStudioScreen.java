package com.sloth.client.screen;

import com.sloth.client.module.*;
import com.sloth.client.module.impl.VisualModules;
import com.sloth.client.studio.Preferences;
import com.sloth.client.screen.widget.SlothSlider;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.Component;

/** Local presentation controls and reviewed HUD palettes; never changes server text resources. */
public final class AppearanceStudioScreen extends SlothScreen {
    private final Screen parent;
    private final VisualModules.MenuTheme theme;
    private int x,y,w,h;
    private String status="Preview styles before applying. Your layout stays in place.";
    public AppearanceStudioScreen(Screen parent){super(Component.literal("Appearance Studio"));this.parent=parent;theme=ModuleManager.get(VisualModules.MenuTheme.class);}
    @Override protected void init(){
        w=Math.min(500,width-24);h=Math.min(320,height-20);x=(width-w)/2;y=(height-h)/2;
        button(x+12,y+38,w-24,20,"HUD font: "+theme.hudFont.get(),b->{String previous=theme.hudFont.get();theme.hudFont.cycle();if(!ModuleManager.save()){theme.hudFont.set(previous);status="Could not save font preference.";}else status="Sloth HUD font changed. Chat and Tab keep their original fonts.";rebuildWidgets();});
        button(x+12,y+62,w-24,20,"Menu density: "+(Preferences.compact()?"Compact":"Comfortable"),b->{status=Preferences.toggle("compact")?"Menu density saved. Applies when menus rebuild.":"Could not save menu density.";rebuildWidgets();});
        int half=(w-30)/2;
        button(x+12,y+86,half,20,"Motion: "+(theme.animations.on()?"Smooth":"Reduced"),b->{boolean before=theme.animations.on();theme.animations.toggle();if(!ModuleManager.save()){theme.animations.set(before);status="Could not save motion preference.";}else status="Motion preference saved.";rebuildWidgets();});
        addRenderableWidget(new SlothSlider(x+18+half,y+86,half,20,(theme.animationSpeed.get()-.5)/1.5){
            {updateMessage();}
            @Override protected void updateMessage(){setMessage(Component.literal("Motion pace: "+theme.animationSpeed.display()));}
            @Override protected void applyValue(){double before=theme.animationSpeed.get();theme.animationSpeed.set(.5+value*1.5);if(!ModuleManager.save()){theme.animationSpeed.set(before);status="Could not save motion pace.";}updateMessage();}
        });
        int third=(w-36)/3;
        String[] names={"Glass","Focused","Minimal"};
        for(int i=0;i<3;i++){final int n=i;button(x+12+i*(third+6),y+112,third,20,"Preview "+names[i],b->palette(n,names[n]));}
        button(x+12,y+h-30,(w-30)/2,20,"Edit HUD layout",b->minecraft.setScreen(new HudEditorScreen(this)));
        primary(x+18+(w-30)/2,y+h-30,(w-30)/2,20,"Back",b->onClose());
    }
    private void palette(int kind,String label){
        var target=ModuleManager.snapshot();var modules=target.getAsJsonObject("modules");
        for(HudModule hud:ModuleManager.hudModules()){
            var settings=modules.getAsJsonObject(hud.id).getAsJsonObject("settings");settings.addProperty("background",kind!=2);settings.addProperty("shadow",kind==2);
            int[] colors={kind==1?0xFF151820:0xB0181B25,0xFFF5F3F0,kind==1?Ui.ACCENT_SOFT:0x807F748C};
            String[] keys={"background_color","text_color","border_color"};
            for(int i=0;i<3;i++){var color=new com.google.gson.JsonObject();color.addProperty("argb",String.format(java.util.Locale.ROOT,"#%08X",colors[i]));color.addProperty("chroma",false);settings.add(keys[i],color);}
        }
        modules.getAsJsonObject("menu_theme").getAsJsonObject("settings").addProperty("hud_font","Sloth");
        minecraft.setScreen(new SetupReviewScreen(this,label+" HUD style",target));
    }
    @Override public void renderBackground(GuiGraphics g,int mx,int my,float t){super.renderBackground(g,mx,my,t);Ui.panel(g,x,y,w,h,Ui.BG);}
    @Override public void render(GuiGraphics g,int mx,int my,float t){super.render(g,mx,my,t);
        g.drawString(font,"APPEARANCE STUDIO",x+12,y+14,Ui.TEXT,false);
        int py=y+142,ph=Math.max(20,h-194);Ui.panel(g,x+12,py,w-24,ph,Ui.PANEL);
        g.enableScissor(x+14,py+2,x+w-14,py+ph-2);
        var hudFont=MenuFont.hud();g.drawString(hudFont,"118 FPS   ·   Ping 28 ms   ·   Mining",x+22,py+8,Ui.TEXT,false);
        if(ph>36)g.drawString(hudFont,"X: 500   Y: 62   Z: 250   ·   Facing North",x+22,py+25,Ui.ACCENT_SOFT,false);
        if(ph>60)g.drawString(font,"Live font sample · layout and visibility stay yours",x+22,py+48,Ui.MUTED,false);
        g.disableScissor();g.drawString(font,Ui.ellipsize(font,status,w-24),x+12,y+h-45,Ui.MUTED,false);
    }
    @Override public void onClose(){minecraft.setScreen(parent);}
}
