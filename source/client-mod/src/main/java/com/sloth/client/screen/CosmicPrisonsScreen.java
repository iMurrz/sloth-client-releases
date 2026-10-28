package com.sloth.client.screen;

import com.sloth.client.module.ModuleManager;
import com.sloth.client.studio.CosmicPrisons;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.EditBox;
import net.minecraft.client.gui.screens.ChatScreen;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.Component;

/** Cosmic Prisons workspace: no commands are sent until the player confirms them in chat. */
public final class CosmicPrisonsScreen extends MenuFrame {
    private EditBox note,gang,cell; private String status="Reads only information already shown by the server.";
    public CosmicPrisonsScreen(Screen parent){super(parent,"Cosmic Prisons");}
    protected Tab tab(){return Tab.STUDIO;} protected String railPage(){return "Gameplay";}
    protected String workspaceTitle(){return "COSMIC PRISONS";} protected String workspaceSubtitle(){return "Mining intelligence without automated play.";}
    protected void initContent(){
        int col=(contentW-8)/2;
        note=input(contentX,contentY,contentW,"Session note",CosmicPrisons.note(),240);
        gang=input(contentX,contentY+28,col,"Gang / teammates",CosmicPrisons.gang(),80);
        cell=input(contentX+col+8,contentY+28,col,"Cell / route note",CosmicPrisons.cell(),120);
        int y=contentY+61,w=(contentW-16)/3;
        primary(contentX,y,w,21,"Save notebook",b->{CosmicPrisons.setNotes(note.getValue(),gang.getValue(),cell.getValue());status="Notebook saved locally.";});
        button(contentX+w+8,y,w,21,"Enable all HUDs",b->{set(true);status="Cosmic HUDs enabled.";});
        button(contentX+(w+8)*2,y,w,21,"Enchant Hub",b->minecraft.setScreen(new EnchantmentHubScreen(this)));
        int qy=contentY+contentH-48,qw=(contentW-24)/4;
        button(contentX,qy,qw,21,"/events",b->draft("/events")); button(contentX+qw+8,qy,qw,21,"/exec",b->draft("/exec"));
        button(contentX+(qw+8)*2,qy,qw,21,"All tools",b->minecraft.setScreen(new CosmicSuiteScreen(this))); button(contentX+(qw+8)*3,qy,qw,21,"/cell",b->draft("/cell"));
        primary(contentX+contentW-86,contentY+contentH-22,86,20,"Done",b->onClose());
    }
    private EditBox input(int x,int y,int w,String hint,String value,int max){EditBox e=new EditBox(font,x,y,w,21,Component.literal(hint));e.setHint(Component.literal(hint));e.setMaxLength(max);e.setValue(value);addRenderableWidget(e);return e;}
    private void set(boolean enabled){for(String id:new String[]{"cosmic_mining","cosmic_events","cosmic_safety","cosmic_set_calculator"})ModuleManager.get(id).setEnabled(enabled);ModuleManager.save();}
    private void draft(String command){minecraft.setScreen(new ChatScreen(command,false));}
    protected void renderContentBackground(GuiGraphics g,int mx,int my){Ui.rounded(g,contentX,contentY+91,contentW,contentH-143,0x70201A27);Ui.roundedOutline(g,contentX,contentY+91,contentW,contentH-143,Ui.LINE);}
    protected void renderContent(GuiGraphics g,int mx,int my,float t){int y=contentY+102;g.drawString(font,"LIVE ASSISTANT",contentX+12,y,Ui.ACCENT_SOFT,false);g.drawString(font,"Blocks "+com.sloth.client.studio.GameplayTracker.blocks()+" · Energy +"+Math.round(CosmicPrisons.energy())+" · Money +$"+Math.round(CosmicPrisons.money()),contentX+12,y+16,Ui.TEXT,false);g.drawString(font,"Momentum "+CosmicPrisons.momentum()+" · Payday "+CosmicPrisons.payday()+" · Inventory "+CosmicPrisons.openSlots()+" free",contentX+12,y+31,Ui.MUTED,false);g.drawString(font,Ui.ellipsize(font,CosmicPrisons.lastEvent(),contentW-24),contentX+12,y+50,Ui.MUTED,false);var j=CosmicPrisons.journal();if(!j.isEmpty())g.drawString(font,Ui.ellipsize(font,"Last proc/event · "+j.get(j.size()-1),contentW-24),contentX+12,y+66,Ui.MUTED,false);g.drawString(font,Ui.ellipsize(font,status,contentW-110),contentX+12,contentY+contentH-18,Ui.MUTED,false);}
}
