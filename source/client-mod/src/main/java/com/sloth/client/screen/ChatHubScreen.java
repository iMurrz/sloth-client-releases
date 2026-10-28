package com.sloth.client.screen;

import com.sloth.client.SlothClient;
import com.sloth.client.studio.ChatHub;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.input.KeyEvent;
import net.minecraft.network.chat.Component;
import org.lwjgl.glfw.GLFW;
import java.time.*;
import java.time.format.DateTimeFormatter;

/** Read-only chat workspace. It never replaces vanilla chat or changes signed message components. */
public final class ChatHubScreen extends MenuFrame {
    private final SmoothScroll smooth=new SmoothScroll();private int listY,listH,contentHeight;
    private static final DateTimeFormatter TIME=DateTimeFormatter.ofPattern("HH:mm");
    public ChatHubScreen(Screen parent){super(parent,"Chat Hub");}
    protected Tab tab(){return Tab.STUDIO;} protected String railPage(){return "Chat";} protected String workspaceTitle(){return "CHAT HUB";} protected String workspaceSubtitle(){return "Memory only · vanilla signed chat remains unchanged.";}
    protected void initContent(){int tabW=Math.max(54,(contentW-12)/ChatHub.Tab.values().length);int i=0;for(var tab:ChatHub.Tab.values()){final var chosen=tab;String label=tab.label+(ChatHub.unread(tab)>0?" "+Math.min(99,ChatHub.unread(tab)):"");var b=button(contentX+i++*tabW,contentY,tabW-4,20,label,btn->{ChatHub.select(chosen);smooth.reset();rebuildWidgets();});b.selected=tab==ChatHub.selected();b.selectionLine=false;}listY=contentY+30;listH=contentH-60;button(contentX,contentY+contentH-22,96,20,"Clear session",b->{ChatHub.clear();smooth.reset();rebuildWidgets();});button(contentX+102,contentY+contentH-22,96,20,"Chat settings",b->minecraft.setScreen(new ModuleSettingsScreen(this,com.sloth.client.module.ModuleManager.get("chat_hub"))));primary(contentX+contentW-80,contentY+contentH-22,80,20,"Done",b->onClose());}
    protected void renderContentBackground(GuiGraphics g,int mx,int my){Ui.rounded(g,contentX,listY,contentW,listH,0x70201A27);Ui.roundedOutline(g,contentX,listY,contentW,listH,Ui.LINE);}
    protected void renderContent(GuiGraphics g,int mx,int my,float t){var entries=ChatHub.entries(ChatHub.selected());int inner=contentW-24;int calculated=0;for(var e:entries)calculated+=Math.max(22,font.split(e.component(),inner-54).size()*11+9);contentHeight=calculated;smooth.clamp(Math.max(0,contentHeight-listH));int scroll=smooth.get(),py=listY+4-scroll;g.enableScissor(contentX+2,listY+2,contentX+contentW-2,listY+listH-2);for(var e:entries){var lines=font.split(e.component(),inner-54);int eh=Math.max(22,lines.size()*11+9);Ui.rounded(g,contentX+6,py,contentW-12,eh-3,Ui.PANEL);String time=Instant.ofEpochMilli(e.receivedAt()).atZone(ZoneId.systemDefault()).format(TIME);g.drawString(font,time,contentX+13,py+7,Ui.DIM,false);int ly=py+7;for(var line:lines){g.drawString(font,line,contentX+58,ly,e.mention()?Ui.ACCENT_SOFT:Ui.TEXT,false);ly+=11;}py+=eh;}g.disableScissor();if(entries.isEmpty())Ui.centered(g,font,"No messages in this tab yet.",contentX+contentW/2,listY+12,Ui.MUTED);Ui.scrollbar(g,contentX+contentW-7,listY,listH,scroll,Math.max(0,contentHeight-listH));}
    public boolean mouseScrolled(double mx,double my,double dx,double dy){if(!Ui.inside(mx,my,contentX,listY,contentW,listH))return super.mouseScrolled(mx,my,dx,dy);smooth.by(-dy*30,Math.max(0,contentHeight-listH));return true;}
    public boolean keyPressed(KeyEvent event){if(SlothClient.CHAT_HUB.matches(event)){onClose();return true;}int max=Math.max(0,contentHeight-listH);if(event.key()==GLFW.GLFW_KEY_PAGE_DOWN){smooth.by(listH*.8,max);return true;}if(event.key()==GLFW.GLFW_KEY_PAGE_UP){smooth.by(-listH*.8,max);return true;}return super.keyPressed(event);}
}
