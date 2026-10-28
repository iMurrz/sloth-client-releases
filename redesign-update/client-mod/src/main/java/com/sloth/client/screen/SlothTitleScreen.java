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

/**
 * Sloth start screen: a cherry-blossom sunset with drifting petals, the Sloth wordmark with the emblem between
 * the words, a framed cream menu, swaying hanging sloths and a "client loaded" bar.
 */
public final class SlothTitleScreen extends SlothScreen {
    private static final Identifier MARK=Identifier.fromNamespaceAndPath("sloth-client","textures/gui/pink-sloth-emblem.png");
    private static final Identifier BACKGROUND=Identifier.fromNamespaceAndPath("sloth-client","textures/gui/pink-workspace-background.png");
    private static final int PETALS=46;
    private static final int[] PETAL_COLOURS={0xFFFFC6DC,0xFFFFA6C9,0xFFFF8FBC,0xFFFFE0EC};
    private final float[] px=new float[PETALS],py=new float[PETALS],pv=new float[PETALS],pp=new float[PETALS];
    private final int[] pz=new int[PETALS];
    private long lastFrame,openedAt;
    private Supplier<PlayerSkin> skin;
    private String player="Player";
    private int emblem,titleY,panelX,panelY,panelW,panelH,barY;
    public SlothTitleScreen(){super(Component.literal("Sloth Client"));}

    @Override protected void init(){
        var user=minecraft.getUser();
        player=user.getName();
        skin=minecraft.getSkinManager().createLookup(new GameProfile(user.getProfileId(),user.getName()),false);
        boolean tight=height<300;
        int row=tight?19:22,gap=tight?4:5;
        emblem=Math.min(64,Math.max(34,height/6));
        titleY=Math.max(12,height/18);
        panelW=Math.min(250,width-36);
        panelH=6*row+5*gap+22;
        panelX=(width-panelW)/2;
        panelY=Math.min(titleY+emblem+14,height-panelH-48);
        barY=Math.min(height-26,panelY+panelH+22);
        int bx=panelX+11,bw=panelW-22,by=panelY+11;
        String[] labels={"SINGLEPLAYER","MULTIPLAYER","COSMETICS","SLOTH MODS","SETTINGS","QUIT GAME"};
        for(int i=0;i<labels.length;i++){
            final int item=i;
            pixel(bx,by+i*(row+gap),bw,row,labels[i],b->{
                switch(item){
                    case 0->minecraft.setScreen(new SelectWorldScreen(this));
                    case 1->minecraft.setScreen(new JoinMultiplayerScreen(this));
                    case 2->minecraft.setScreen(new AppearanceStudioScreen(this));
                    case 3->minecraft.setScreen(new ModMenuScreen(this));
                    case 4->minecraft.setScreen(new SettingsScreen(this));
                    default->minecraft.stop();
                }
            });
        }
        int pw=Math.min(190,Math.max(120,width/4));
        pixel(width-pw-12,10,pw,22,"      Welcome, "+player+"!",b->minecraft.setScreen(new ProfilesScreen(this)));
        // Small utility dock, bottom right.
        String[] dock={"Client menu","HUD","Friends","Options","What's new"};
        int dw=Math.min(74,Math.max(50,width/9)),dh=18,dx=width-12;
        for(int i=dock.length-1;i>=0;i--){
            final int item=i;
            dx-=dw;
            pixel(dx,height-dh-10,dw,dh,dock[i],b->minecraft.setScreen(switch(item){
                case 0->new ClientOverlayScreen(this);case 1->new HudEditorScreen(this);case 2->new FriendsScreen(this);
                case 3->new OptionsScreen(this,minecraft.options);default->new ChangelogScreen(this);
            }));
            dx-=4;
        }
        long now=System.nanoTime();
        lastFrame=now;
        if(openedAt==0)openedAt=now;
        for(int i=0;i<PETALS;i++){
            px[i]=(i*977%1000)/1000f*width;
            py[i]=(i*613%1000)/1000f*height;
            pv[i]=14+(i*37%22);
            pp[i]=i*1.7f;
            pz[i]=i%5==0?3:2;
        }
    }

    @Override public void renderBackground(GuiGraphics g,int mx,int my,float tick){
        g.blit(RenderPipelines.GUI_TEXTURED,BACKGROUND,0,0,0,0,width,height,1672,941,1672,941);
        // Cherry-blossom sunset grade: peach glow low, soft lilac above, deeper rose at the ground.
        g.fillGradient(0,0,width,height/2,0x40B79BE0,0x30FFB6D0);
        g.fillGradient(0,height/2,width,height,0x30FFC9A8,0x70802850);
        g.fillGradient(0,height-80,width,height,0x00200812,0x90200812);
        petals(g);
        // Hanging sloths on either side.
        if(width>520){
            hanging(g,panelX-Math.min(70,(width-panelW)/4),0,Math.min(54,emblem),0f,false);
            hanging(g,panelX+panelW+Math.min(70,(width-panelW)/4),0,Math.min(54,emblem),2.1f,true);
        }
        // Framed menu panel with flower corners.
        g.fill(panelX-3,panelY-3,panelX+panelW+3,panelY+panelH+3,0xFF4A2336);
        g.fill(panelX-2,panelY-2,panelX+panelW+2,panelY+panelH+2,0xFFB86A8A);
        g.fill(panelX,panelY,panelX+panelW,panelY+panelH,0xFFE9B5C9);
        g.fill(panelX+1,panelY+1,panelX+panelW-1,panelY+3,0xFFFFE0EC);
        for(int[] c:new int[][]{{panelX-5,panelY-5},{panelX+panelW-3,panelY-5},{panelX-5,panelY+panelH-3},{panelX+panelW-3,panelY+panelH-3}}){
            g.fill(c[0],c[1],c[0]+8,c[1]+8,0xFFFFA6C9);
            g.fill(c[0]+3,c[1]+3,c[0]+5,c[1]+5,0xFFFFE9A8);
        }
    }

    private void petals(GuiGraphics g){
        long now=System.nanoTime();
        float dt=Math.min(0.1f,(now-lastFrame)/1e9f);
        lastFrame=now;
        boolean move=SlothTheme.animated();
        for(int i=0;i<PETALS;i++){
            if(move){
                py[i]+=pv[i]*dt;
                pp[i]+=dt*1.3f;
                px[i]+=(float)Math.sin(pp[i])*10f*dt+6f*dt;
                if(py[i]>height){py[i]=-4;px[i]=Math.abs(i*389+(int)(now/1000000L))%Math.max(1,width);}
                if(px[i]>width)px[i]=-4;
            }
            int x=Math.round(px[i]),y=Math.round(py[i]),s=pz[i];
            g.fill(x,y,x+s,y+s,PETAL_COLOURS[i%PETAL_COLOURS.length]);
        }
    }

    private void word(GuiGraphics g,String text,int x,int y,float scale){
        g.pose().pushMatrix();
        g.pose().translate(x,y);
        g.pose().scale(scale,scale);
        g.drawString(font,text,2,2,0xFF5A2A40,false);
        g.drawString(font,text,1,1,0xFF7A3550,false);
        g.drawString(font,text,0,0,0xFFFFE4EE,false);
        g.pose().popMatrix();
    }

    private void hanging(GuiGraphics g,int x,int top,int size,float phase,boolean flip){
        long ms=System.currentTimeMillis();
        float sway=SlothTheme.animated()?(float)Math.sin(ms/900.0+phase)*0.09f:0f;
        g.fill(x-1,0,x+1,top,0xFF7A4A3A);
        g.pose().pushMatrix();
        g.pose().translate(x,top);
        g.pose().rotate(sway);
        g.blit(RenderPipelines.GUI_TEXTURED,MARK,-size/2,0,0,0,size,size,1254,1254,1254,1254);
        g.pose().popMatrix();
    }

    @Override public void render(GuiGraphics g,int mx,int my,float tick){
        super.render(g,mx,my,tick);
        // Wordmark: SLOTH [emblem] CLIENT.
        float scale=width<430?2f:3f;
        int sw=Math.round(font.width("SLOTH")*scale),cw=Math.round(font.width("CLIENT")*scale);
        int gap=8,total=sw+gap+emblem+gap+cw,tx=(width-total)/2;
        int ty=titleY+(emblem-Math.round(8*scale))/2;
        word(g,"SLOTH",tx,ty,scale);
        g.blit(RenderPipelines.GUI_TEXTURED,MARK,tx+sw+gap,titleY,0,0,emblem,emblem,1254,1254,1254,1254);
        word(g,"CLIENT",tx+sw+gap+emblem+gap,ty,scale);
        // Loaded bar.
        long ms=Math.max(0,(System.nanoTime()-openedAt)/1000000L);
        float p=SlothTheme.animated()?Math.min(1f,ms/1400f):1f;
        String state=p>=1f?"CLIENT LOADED!":"LOADING...";
        Ui.centered(g,font,state,width/2,barY-12,0xFFFFE4EE);
        int bw=Math.min(300,width-60),bx=(width-bw)/2;
        g.fill(bx-2,barY-2,bx+bw+2,barY+8,0xFF4A2336);
        g.fill(bx,barY,bx+bw,barY+6,0xFFFFE0EC);
        int fill=Math.round(bw*p);
        g.fill(bx,barY,bx+fill,barY+6,0xFFFF6DB5);
        g.fill(bx,barY,bx+fill,barY+2,0xFFFFA6C9);
        g.blit(RenderPipelines.GUI_TEXTURED,MARK,bx+Math.max(0,fill-9),barY-14,0,0,18,18,1254,1254,1254,1254);
        if(skin!=null)PlayerFaceRenderer.draw(g,skin.get(),width-Math.min(190,Math.max(120,width/4))-12+6,14,14);
        g.drawString(font,ClientUpdates.TITLE,10,height-13,0xFFFFE4EE,false);
    }
    @Override public boolean shouldCloseOnEsc(){return false;}
}
