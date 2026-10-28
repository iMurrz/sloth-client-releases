package com.sloth.client;

import net.minecraft.client.Minecraft;
import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.core.LogEvent;
import org.apache.logging.log4j.core.LoggerContext;
import org.apache.logging.log4j.core.config.Configuration;
import org.apache.logging.log4j.core.config.LoggerConfig;
import org.apache.logging.log4j.core.filter.AbstractFilter;
import org.apache.logging.log4j.core.impl.Log4jContextFactory;

import java.util.Collections;
import java.util.IdentityHashMap;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * Drops any log event that contains the player's session token (or anything JWT-shaped) before it reaches
 * logs/latest.log or the console. Vanilla can print the token in Realms errors, and players share logs when
 * asking for help.
 */
final class TokenLogFilter extends AbstractFilter {
    private static final Pattern JWT = Pattern.compile("eyJ[A-Za-z0-9_-]{8,}\\.[A-Za-z0-9_-]{8,}\\.[A-Za-z0-9_-]{8,}");

    /**
     * Attaches the filter to every logger config of every log4j context (Fabric can have one per class loader).
     * LoggerConfig filters see the finished LogEvent, including parameters and exceptions.
     */
    static void install() {
        try {
            TokenLogFilter filter = new TokenLogFilter();
            filter.start();
            Set<LoggerContext> contexts = Collections.newSetFromMap(new IdentityHashMap<>());
            if (LogManager.getFactory() instanceof Log4jContextFactory factory) contexts.addAll(factory.getSelector().getLoggerContexts());
            if (LogManager.getContext(false) instanceof LoggerContext own) contexts.add(own);
            int configs = 0;
            for (LoggerContext context : contexts) {
                Configuration configuration = context.getConfiguration();
                Set<LoggerConfig> loggers = Collections.newSetFromMap(new IdentityHashMap<>());
                loggers.add(configuration.getRootLogger());
                loggers.addAll(configuration.getLoggers().values());
                for (LoggerConfig logger : loggers) logger.addFilter(filter);
                configs += loggers.size();
                context.updateLoggers();
            }
            SlothClient.LOG.info("Session-token log filter active on {} logger configs", configs);
        } catch (RuntimeException | LinkageError e) {
            SlothClient.LOG.warn("Could not install the session-token log filter", e);
        }
    }

    @Override
    public Result filter(LogEvent event) {
        if (leaks(event.getMessage() == null ? null : event.getMessage().getFormattedMessage())) return Result.DENY;
        for (Throwable t = event.getThrown(); t != null; t = t.getCause()) {
            if (leaks(t.getMessage())) return Result.DENY;
        }
        com.sloth.client.studio.ConnectionHealth.observe(event.getLoggerName(),event.getMessage()==null?null:event.getMessage().getFormattedMessage());
        PackDiagnostics.observe(event.getLoggerName(), event.getMessage()==null?null:event.getMessage().getFormattedMessage(), event.getLevel().isMoreSpecificThan(org.apache.logging.log4j.Level.WARN));
        return Result.NEUTRAL;
    }

    private static boolean leaks(String text) {
        if (text == null || text.isEmpty()) return false;
        if (JWT.matcher(text).find()) return true;
        Minecraft mc = Minecraft.getInstance();
        String token = mc == null || mc.getUser() == null ? null : mc.getUser().getAccessToken();
        return token != null && token.length() >= 16 && text.contains(token);
    }
}
