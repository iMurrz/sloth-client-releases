package com.sloth.client.screen;
import com.mojang.authlib.GameProfile;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.PlayerFaceRenderer;
import net.minecraft.client.gui.screens.multiplayer.JoinMultiplayerScreen;
import net.minecraft.client.gui.screens.options.OptionsScreen;
import net.minecraft.client.gui.screens.worldselection.SelectWorldScreen;
import net.minecraft.client.renderer.RenderPipelines;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.Identifier;
import net.minecraft.world.entity.player.PlayerSkin;
import java.util.function.Supplier;

/** Centred Sloth start screen with a live Minecraft panorama and a compact utility dock. */
public final class SlothTitleScreen extends SlothScreen {
    private static final Identifier MARK=Identifier.fromNamespaceAndPath("sloth-client","textures/gui/pink-sloth-emblem.png");
    private static final Identifier BACKGROUND=Identifier.fromNamespaceAndPath("sloth-client","textures/gui/pink-workspace-background.png");
    private Supplier<PlayerSkin> skin;
    private int logoY,logoSize;
    public SlothTitleScreen(){super(Component.literal("Sloth Client"));}
    @Override protected void init(){
        var user=minecraft.getUser();
        skin=minecraft.getSkinManager().createLookup(new GameProfile(user.getProfileId(),user.getName()),false);
        int w=Math.min(240,width-36),x=(width-w)/2,row=height<280?20:24;
        logoSize=Math.min(72,Math.max(36,height/6));
        int y=Math.max(logoSize+44,Math.min(height/2-5,height-4*row-50));
        logoY=y-logoSize-22;
        button(x,y,w,row,"Singleplayer",b->minecraft.setScreen(new SelectWorldScreen(this)));
        button(x,y+row+5,w,row,"Multiplayer",b->minecraft.setScreen(new JoinMultiplayerScreen(this)));
        int half=(w-6)/2;
        primary(x,y+2*(row+5),half,row,"Client menu",b->minecraft.setScreen(new ClientOverlayScreen(this)));
        button(x+half+6,y+2*(row+5),half,row,"Game options",b->minecraft.setScreen(new OptionsScreen(this,minecraft.options)));
        button(12,10,Math.min(146,Math.max(100,width/4)),22,"   "+user.getName(),b->minecraft.setScreen(new ProfilesScreen(this)));
        button(width-36,10,24,22,"×",b->minecraft.stop());
        button(width-106,10,64,22,"Appearance",b->minecraft.setScreen(new AppearanceStudioScreen(this)));
        String[] labels={"HUD","Mods","Friends","Settings","What's new"};
        int dockW=Math.min(width-24,330),gap=5,bw=(dockW-gap*4)/5,dx=(width-dockW)/2;
        for(int i=0;i<labels.length;i++){
            final int item=i;
            button(dx+i*(bw+gap),height-42,bw,22,labels[i],b->minecraft.setScreen(switch(item){
                case 0->new HudEditorScreen(this);case 1->new ModMenuScreen(this);case 2->new FriendsScreen(this);case 3->new SettingsScreen(this);default->new ChangelogScreen(this);
            }));
        }
    }
    @Override public void renderBackground(GuiGraphics g,int mx,int my,float tick){
        g.blit(RenderPipelines.GUI_TEXTURED,BACKGROUND,0,0,0,0,width,height,1672,941,1672,941);
        g.fill(0,0,width,height,0x360B0710);
        g.fillGradient(0,height-74,width,height,0x000C0B12,0xA00C0B12);
        // Pink glow behind the emblem, then a perspective grid floor.
        g.fillGradient(0,logoY-30,width,logoY+logoSize+40,0x00FF2E97,0x30FF2E97);
        g.fillGradient(0,logoY+logoSize+40,width,logoY+logoSize+80,0x30FF2E97,0x00FF2E97);
        int horizon=(int)(height*0.66f),vx=width/2,span=Math.max(1,height-horizon);
        for(int k=-10;k<=10;k++){
            int fan=k*width/9;
            for(int y=horizon;y<height;y+=3){
                int x=vx+fan*(y-horizon)/span;
                int a=Math.min(0x46,0x0A+(y-horizon)*0x3C/span);
                g.fill(x,y,x+1,y+3,a<<24|0xFF2E97);
            }
        }
        for(int i=1;i<=8;i++){
            float t=i/8f;
            int y=horizon+(int)(span*t*t);
            g.fill(0,y,width,y+1,(0x1A+(int)(0x30*t))<<24|0xFF2E97);
        }
        g.fill(0,horizon,width,horizon+1,0x60FF6DB5);
    }
    @Override public void render(GuiGraphics g,int mx,int my,float tick){
        super.render(g,mx,my,tick);
        g.blit(RenderPipelines.GUI_TEXTURED,MARK,(width-logoSize)/2,logoY,0,0,logoSize,logoSize,1254,1254,1254,1254);
        Ui.centered(g,font,"SLOTH CLIENT",width/2-1,logoY+logoSize+7,0xFFFF6DB5);
        Ui.centered(g,font,"SLOTH CLIENT",width/2+1,logoY+logoSize+7,0xFFFF2E97);
        Ui.centered(g,font,"SLOTH CLIENT",width/2,logoY+logoSize+7,Ui.TEXT);
        if(skin!=null)PlayerFaceRenderer.draw(g,skin.get(),17,14,14);
        g.drawString(font,ClientUpdates.TITLE,10,height-13,Ui.MUTED,false);
        String note="Not affiliated with Mojang or Microsoft";
        if(width>460)g.drawString(font,note,width-font.width(note)-10,height-13,Ui.MUTED,false);
    }
    @Override public boolean shouldCloseOnEsc(){return false;}
}
