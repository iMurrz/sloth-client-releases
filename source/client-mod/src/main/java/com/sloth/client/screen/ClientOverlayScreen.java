package com.sloth.client.screen;
import com.sloth.client.SlothClient;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.input.KeyEvent;
import net.minecraft.client.renderer.RenderPipelines;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.Identifier;

/** Minimal entry overlay; gameplay remains visible behind the brand and three direct controls. */
public final class ClientOverlayScreen extends SlothScreen {
    private static final Identifier MARK=Identifier.fromNamespaceAndPath("sloth-client","textures/gui/pink-sloth-emblem.png");
    private final Screen parent;
    private int logoY,logoSize;
    public ClientOverlayScreen(Screen parent){super(Component.literal("Sloth Client"));this.parent=parent;}
    @Override protected void init(){
        logoSize=Math.min(72,Math.max(36,height/6));
        int total=Math.min(280,width-24),x=(width-total)/2,y=height/2+26;
        logoY=y-logoSize-33;
        int side=Math.min(72,(total-8)/3),center=total-side*2-8;
        button(x,y,side,30,"Edit HUD",b->minecraft.setScreen(new HudEditorScreen(this)));
        primary(x+side+4,y,center,30,"Features",b->minecraft.setScreen(new ModMenuScreen(this)));
        button(x+side+center+8,y,side,30,"Settings",b->minecraft.setScreen(new SettingsScreen(this)));
        button(10,height-34,24,24,"?",b->minecraft.setScreen(new StudioScreen(this,StudioScreen.Page.EXTRAS)));
        button(40,height-34,84,24,"Gameplay",b->minecraft.setScreen(new GameplayScreen(this)));
        button(130,height-34,72,24,"Chat Hub",b->minecraft.setScreen(new ChatHubScreen(this)));
        button(width-34,10,24,24,"×",b->onClose());
    }
    @Override public void renderBackground(GuiGraphics g,int mx,int my,float tick){
        if(minecraft.level!=null){renderBlurredBackground(g);g.fill(0,0,width,height,0x300C0B12);}
        else{super.renderBackground(g,mx,my,tick);}
    }
    @Override public void render(GuiGraphics g,int mx,int my,float tick){
        super.render(g,mx,my,tick);
        g.blit(RenderPipelines.GUI_TEXTURED,MARK,(width-logoSize)/2,logoY,0,0,logoSize,logoSize,1254,1254,1254,1254);
        Ui.centered(g,font,"SLOTH CLIENT",width/2,logoY+logoSize+8,Ui.TEXT);
    }
    @Override public void onClose(){minecraft.setScreen(parent);}
    @Override public boolean keyPressed(KeyEvent event){
        if(SlothClient.MOD_MENU.matches(event)||SlothClient.STUDIO.matches(event)){onClose();return true;}
        return super.keyPressed(event);
    }
}
