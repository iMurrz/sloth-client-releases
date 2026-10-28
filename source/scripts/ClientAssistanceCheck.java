import com.sloth.client.studio.HudPacking;
import com.sloth.client.studio.PackClues;
import java.util.*;
public class ClientAssistanceCheck {
 static void check(boolean pass,String message){if(!pass)throw new AssertionError(message);}
 public static void main(String[] args){
  var selected=List.of(new HudPacking.Box(20,20,40,20),new HudPacking.Box(20,20,40,20),new HudPacking.Box(20,20,40,20));
  var obstacles=List.of(new HudPacking.Box(0,0,100,16));var plan=HudPacking.arrange(selected,obstacles,220,140);check(plan.unresolved()==0,"All HUDs fit");
  for(int i=0;i<plan.boxes().size();i++){var a=plan.boxes().get(i);check(a.x()>=4&&a.y()>=4&&a.x()+a.w()<=216&&a.y()+a.h()<=136,"Canvas bounds");for(var b:obstacles)check(!a.overlaps(b),"Safe zone");for(int j=0;j<i;j++)check(!a.overlaps(plan.boxes().get(j)),"No collision");}
  check(HudPacking.arrange(selected,obstacles,220,140).equals(plan),"Deterministic layout");var oversized=new HudPacking.Box(5,5,500,500);var noFit=HudPacking.arrange(List.of(oversized),List.of(),50,50);check(noFit.unresolved()==1&&noFit.boxes().getFirst().equals(oversized),"Unresolved preserved");
  check(PackClues.classify("ServerPackManager","resource pack download failed 404 https://private.invalid/secret").advice().contains("public direct ZIP"),"Unavailable link");
  check(PackClues.classify("fontmanager","font provider failed secret-user").advice().contains("bitmap"),"Font clue");
  check(!PackClues.classify("renderer","not compatible with font atlas resizing").failure(),"Compatibility fallback not failure");
  check(!PackClues.classify("worker","Missing texture references in model private:secret").advice().contains("private"),"No raw log content");
  check(PackClues.classify("chat","ordinary message failed")==null,"Unrelated text ignored");
  check(PackClues.classify("ServerPackManager","resource pack hash failed").advice().contains("advertised hash"),"Hash guidance");
  System.out.println("PASS HUD arrangement: bounds, safe zones, collisions, deterministic results, unresolved preservation. Pack clues: link, fonts, fallback, privacy, unrelated text, hash.");
 }
}
