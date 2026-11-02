package com.touchwebsitestudio.app;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;

/** Tiny single-purpose HTTP/1.1 server for tests (the JDK's com.sun.net.httpserver is not on the Android unit-test classpath). */
class MiniServer {
    interface Handler { Response handle(String method, String path, Map<String, String> headers, byte[] body) throws Exception; }
    static class Response { final int code; final String body; Response(int c, String b) { code = c; body = b; } }

    private final ServerSocket socket;
    private final Handler handler;
    private final Thread thread;
    private volatile boolean running = true;

    MiniServer(Handler h) throws Exception {
        socket = new ServerSocket(0, 20, InetAddress.getByName("127.0.0.1"));
        handler = h;
        thread = new Thread(() -> {
            while (running) {
                try (Socket s = socket.accept()) { serve(s); } catch (Exception e) { if (!running) return; }
            }
        });
        thread.setDaemon(true);
        thread.start();
    }

    int port() { return socket.getLocalPort(); }
    void stop() { running = false; try { socket.close(); } catch (Exception ignored) { } }

    private void serve(Socket s) throws Exception {
        InputStream in = s.getInputStream();
        String requestLine = line(in);
        if (requestLine == null || requestLine.isEmpty()) return;
        String[] rl = requestLine.split(" ");
        Map<String, String> headers = new HashMap<>();
        String l;
        while ((l = line(in)) != null && !l.isEmpty()) {
            int i = l.indexOf(':');
            if (i > 0) headers.put(l.substring(0, i).trim().toLowerCase(), l.substring(i + 1).trim());
        }
        byte[] body = new byte[0];
        String cl = headers.get("content-length");
        if (cl != null) {
            body = new byte[Integer.parseInt(cl)];
            int off = 0;
            while (off < body.length) { int r = in.read(body, off, body.length - off); if (r < 0) break; off += r; }
        }
        String path = rl[1];
        int q = path.indexOf('?');
        if (q >= 0) path = path.substring(0, q);
        Response r;
        try { r = handler.handle(rl[0], path, headers, body); } catch (Exception e) { r = new Response(500, "{\"message\":\"" + e + "\"}"); }
        byte[] out = r.body.getBytes(StandardCharsets.UTF_8);
        OutputStream o = s.getOutputStream();
        o.write(("HTTP/1.1 " + r.code + " X\r\nContent-Type: application/json\r\nContent-Length: " + out.length + "\r\nConnection: close\r\n\r\n").getBytes(StandardCharsets.UTF_8));
        o.write(out);
        o.flush();
    }

    private static String line(InputStream in) throws Exception {
        ByteArrayOutputStream bo = new ByteArrayOutputStream();
        int c;
        while ((c = in.read()) >= 0) {
            if (c == '\n') break;
            if (c != '\r') bo.write(c);
        }
        if (c < 0 && bo.size() == 0) return null;
        return new String(bo.toByteArray(), StandardCharsets.UTF_8);
    }
}
