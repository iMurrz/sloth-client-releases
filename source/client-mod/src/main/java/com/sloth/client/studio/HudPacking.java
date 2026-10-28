package com.sloth.client.studio;
import java.util.*;
/** One-shot layout planning. It never changes a module or runs during gameplay. */
public final class HudPacking {
 public record Box(int x,int y,int w,int h) { public boolean overlaps(Box b){return x<b.x+b.w&&x+w>b.x&&y<b.y+b.h&&y+h>b.y;} }
 public record Plan(List<Box> boxes,int unresolved){}
 public static Plan arrange(List<Box> selected,List<Box> obstacles,int width,int height){
  List<Box> result=new ArrayList<>(),occupied=new ArrayList<>(obstacles);int unresolved=0,step=Math.max(8,(Math.max(width,height)+159)/160);
  for(int index=0;index<selected.size();index++){
   Box original=selected.get(index),best=null;long distance=Long.MAX_VALUE;
   // Unplaced HUDs retain their original location if space runs out; reserve it now.
   var blockers=new ArrayList<>(occupied);blockers.addAll(selected.subList(index+1,selected.size()));
   for(int y=4;y+original.h<=height-4;y+=step)for(int x=4;x+original.w<=width-4;x+=step){
    boolean blocked=false;for(var b:blockers)if(x<b.x+b.w&&x+original.w>b.x&&y<b.y+b.h&&y+original.h>b.y){blocked=true;break;}if(blocked)continue;Box candidate=new Box(x,y,original.w,original.h);
    long dx=x-original.x,dy=y-original.y,d=dx*dx+dy*dy;if(d<distance){best=candidate;distance=d;}
   }
   if(best==null){best=original;unresolved++;}result.add(best);occupied.add(best);
  }
  return new Plan(List.copyOf(result),unresolved);
 }
 private HudPacking(){}
}
