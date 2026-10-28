package com.sloth.client.screen;

import com.google.gson.JsonObject;
import com.sloth.client.module.ModuleManager;
import com.sloth.client.studio.GameplayTracker;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.EditBox;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.Component;

/** A local gameplay hub: goals, recovery, journal moments, build measurements and reviewable presets. */
public final class GameplayScreen extends MenuFrame {
    private EditBox label;
    private boolean compact;
    private String status="All history stays on this computer.";
    public GameplayScreen(Screen parent){super(parent,"Gameplay");}
    @Override protected Tab tab(){return Tab.STUDIO;}
    @Override protected String railPage(){return "Gameplay";}
    @Override protected String workspaceTitle(){return "GAMEPLAY";}
    @Override protected String workspaceSubtitle(){return "Plan, track and review your play session.";}
    @Override protected void initContent(){
        compact=contentH<270;
        int inputY=contentY;
        label=new EditBox(font,contentX,inputY,contentW-116,22,Component.literal("Moment label"));label.setMaxLength(80);label.setHint(Component.literal("Moment label"));addRenderableWidget(label);
        primary(contentX+contentW-108,inputY,108,22,"Save moment",b->{var p=GameplayTracker.bookmark(label.getValue());status=p==null?"Join a world before saving a moment.":"Saved "+GameplayTracker.coords(p);label.setValue("");});
        int gap=8,col=(contentW-gap*2)/3,row1=inputY+32,row2=row1+30;
        button(contentX,row1,col,22,"Set build anchor",b->{GameplayTracker.setBuildAnchor();status=GameplayTracker.buildMeasure();});
        button(contentX+col+gap,row1,col,22,"Mining preset",b->preset("Mining",new String[]{"session_goals","inventory_planner","coordinates","inventory_space","light","item_counter"}));
        button(contentX+(col+gap)*2,row1,col,22,"Builder preset",b->preset("Building",new String[]{"builder_measure","recovery_hud","coordinates","light","direction"}));
        button(contentX,row2,col,22,"Combat preset",b->preset("Combat practice",new String[]{"combat_recap","cps","reach","combo","armor_status"}));
        button(contentX+col+gap,row2,col,22,"Explore preset",b->preset("Exploration",new String[]{"recovery_hud","coordinates","biome","dimension","direction"}));
        button(contentX+(col+gap)*2,row2,col,22,"Cosmic Prisons",b->minecraft.setScreen(new CosmicPrisonsScreen(this)));
        int bottomY=contentY+contentH-24,bottomW=(contentW-gap*3)/4;
        button(contentX,bottomY,bottomW,22,"Goals",b->open("session_goals"));
        button(contentX+bottomW+gap,bottomY,bottomW,22,"Planner",b->open("inventory_planner"));
        button(contentX+(bottomW+gap)*2,bottomY,bottomW,22,"Build HUD",b->open("builder_measure"));
        primary(contentX+(bottomW+gap)*3,bottomY,bottomW,22,"Done",b->onClose());
    }
    private void open(String id){minecraft.setScreen(new ModuleSettingsScreen(this,ModuleManager.get(id)));}
    private void preset(String name,String[] ids){JsonObject target=ModuleManager.snapshot();JsonObject modules=target.getAsJsonObject("modules");for(String id:ids)if(modules.has(id))modules.getAsJsonObject(id).addProperty("enabled",true);minecraft.setScreen(new SetupReviewScreen(this,name+" gameplay preset",target));}
    @Override protected void renderContentBackground(GuiGraphics g,int mx,int my){
        Ui.rounded(g,contentX,contentY+94,contentW,contentH-124,0x70201A27);Ui.roundedOutline(g,contentX,contentY+94,contentW,contentH-124,Ui.LINE);
    }
    @Override protected void renderContent(GuiGraphics g,int mx,int my,float t){
        int textY=contentY+106;g.drawString(font,GameplayTracker.sessionSummary(),contentX+12,textY,Ui.TEXT,false);
        g.drawString(font,Ui.ellipsize(font,GameplayTracker.performanceAdvice(),contentW-24),contentX+12,textY+16,Ui.MUTED,false);
        var points=GameplayTracker.points();int journalY=textY+42;g.drawString(font,"RECENT JOURNAL",contentX+12,journalY,Ui.ACCENT_SOFT,false);
        int limit=compact?1:5,shown=0;for(int i=points.size()-1;i>=0&&shown<limit;i--,shown++){var p=points.get(i);g.drawString(font,Ui.ellipsize(font,p.label()+" · "+GameplayTracker.coords(p),contentW-24),contentX+12,journalY+17+shown*15,Ui.MUTED,false);}
        if(points.isEmpty())g.drawString(font,"No moments or deaths saved yet.",contentX+12,journalY+17,Ui.MUTED,false);
        g.drawString(font,Ui.ellipsize(font,status,contentW-24),contentX+12,contentY+contentH-41,Ui.MUTED,false);
    }
}
