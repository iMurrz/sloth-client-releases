package com.sloth.client.studio;

import java.util.*;

/** Live, connection-scoped authorization emitted by the companion Paper plugin. */
public final class QaAuthorization {
    private static final String PREFIX="[SLOTH-QA] ";
    private static Set<String> capabilities=Set.of(); private static long expires;
    private QaAuthorization(){}
    public static boolean receiveSystem(String raw){
        if(raw==null)return false;String s=raw.replaceAll("§.","").trim();if(!s.startsWith(PREFIX))return false;
        String body=s.substring(PREFIX.length());if(body.equals("REVOKE")){clear();return true;}
        if(!body.startsWith("GRANT "))return true;Set<String> granted=new HashSet<>();for(String value:body.substring(6).split(","))if(value.matches("[a-z_]{1,32}"))granted.add(value);capabilities=Set.copyOf(granted);expires=System.currentTimeMillis()+15_000;return true;
    }
    public static boolean allows(String capability){if(System.currentTimeMillis()>expires){clear();return false;}return capabilities.contains(capability);}
    public static boolean active(){return !capabilities.isEmpty()&&System.currentTimeMillis()<=expires;}
    public static void clear(){capabilities=Set.of();expires=0;}
}
