package com.sloth.client.screen;
import com.sloth.client.Friends;
import com.sloth.client.screen.widget.SlothButton;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.Component;
import java.util.*;

public final class FriendsScreen extends SlothScreen {
    private final Screen parent;
    private int page;
    public FriendsScreen(Screen parent) { super(Component.literal("Sloth Friends")); this.parent = parent; }
    @Override protected void init() {
        int w = Math.min(460, width - 24), x = (width-w)/2;
        addRenderableWidget(new SlothButton(x, height-32, 90, 20, Component.literal("Back"), SlothButton.Style.NORMAL, b -> onClose()));
        addRenderableWidget(new SlothButton(x+w-94, height-32, 44, 20, Component.literal("<"), SlothButton.Style.NORMAL, b -> page = Math.max(0, page-1)));
        addRenderableWidget(new SlothButton(x+w-44, height-32, 44, 20, Component.literal(">"), SlothButton.Style.NORMAL, b -> { if ((page+1)*rows() < Friends.names().size()) page++; }));
    }
    private int rows() { return Math.max(1, (height-135)/32); }
    @Override public void render(GuiGraphics g, int mx, int my, float dt) {
        int w = Math.min(460, width-24), x = (width-w)/2;
        g.fill(x-10, 18, x+w+10, height-16, Ui.BG);
        g.drawString(font, "YOUR CIRCLE", x+4, 30, Ui.ACCENT_SOFT, false);
        g.drawString(font, "Sloth Friends", x+4, 49, Ui.TEXT, false);
        g.drawString(font, Ui.ellipsize(font,"Active = listed on your current server. Manage in the launcher.", w-8), x+4, 68, Ui.MUTED, false);
        Set<String> online = Friends.online(minecraft);
        List<String> names = new ArrayList<>(Friends.names());
        names.sort(Comparator.comparing((String name) -> !online.contains(name.toLowerCase(Locale.ROOT))).thenComparing(String::compareToIgnoreCase));
        page = Math.min(page, Math.max(0, (names.size()-1)/rows()));
        int start = page*rows();
        for (int i=start; i<Math.min(names.size(),start+rows()); i++) {
            int y=92+(i-start)*32; String name=names.get(i); boolean active=online.contains(name.toLowerCase(Locale.ROOT));
            g.fill(x, y, x+w, y+27, Ui.PANEL);
            g.fill(x+9, y+11, x+14, y+16, active ? Ui.GOOD : Ui.DIM);
            g.drawString(font, name, x+23, y+9, Ui.TEXT, false);
            String status=active ? "On this server" : "Activity unknown";
            g.drawString(font, status, x+w-font.width(status)-10, y+9, active ? Ui.GOOD : Ui.MUTED, false);
        }
        if(names.isEmpty()) g.drawString(font,"Add friends from Sloth Client > Friends.",x+4,100,Ui.MUTED,false);
        super.render(g,mx,my,dt);
    }
    @Override public void onClose() { minecraft.setScreen(parent); }
}
