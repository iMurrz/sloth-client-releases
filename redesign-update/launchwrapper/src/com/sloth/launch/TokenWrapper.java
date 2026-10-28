package com.sloth.launch;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.lang.invoke.MethodHandle;
import java.lang.invoke.MethodHandles;
import java.lang.invoke.MethodType;
import java.nio.charset.StandardCharsets;

/**
 * Entry point used by Sloth Launcher: {@code java ... com.sloth.launch.TokenWrapper <main class> <game args>}.
 *
 * <p>The Minecraft access token arrives as the first line on stdin and replaces the placeholder that follows
 * {@code --accessToken}. The token therefore never appears in the process command line, which Windows process
 * auditing, task managers, {@code jps}/{@code jcmd}, the {@code sun.java.command} property and JVM crash logs
 * ({@code hs_err_pid*.log}) all record.
 */
public final class TokenWrapper {
    private static final String PLACEHOLDER = "sloth-token-via-stdin";

    private TokenWrapper() {}

    public static void main(String[] args) throws Throwable {
        if (args.length == 0) throw new IllegalArgumentException("Usage: TokenWrapper <main class> [game args]");
        String token = readToken();
        String[] gameArgs = new String[args.length - 1];
        for (int i = 1; i < args.length; i++) {
            boolean placeholderSlot = PLACEHOLDER.equals(args[i]) && "--accessToken".equals(args[i - 1]);
            if (placeholderSlot && token == null) throw new IllegalStateException("The Sloth launcher did not send the session token on stdin.");
            gameArgs[i - 1] = placeholderSlot ? token : args[i];
        }
        Class<?> mainClass = Class.forName(args[0], true, ClassLoader.getSystemClassLoader());
        MethodHandle main = MethodHandles.publicLookup().findStatic(mainClass, "main", MethodType.methodType(void.class, String[].class));
        main.invokeExact(gameArgs);
    }

    private static String readToken() throws IOException {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in, StandardCharsets.UTF_8));
        String line = in.readLine();
        return line == null || line.isBlank() ? null : line.trim();
    }
}
