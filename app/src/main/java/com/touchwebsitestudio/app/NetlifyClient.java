package com.touchwebsitestudio.app;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/**
 * Minimal Netlify REST client (user-supplied personal access token). Uses only documented endpoints:
 * GET /user, POST /sites, GET /sites/{id}, POST /sites/{id}/deploys (application/zip), GET /deploys/{id}.
 * Not yet verified against the live service from this build environment (api.netlify.com is blocked there).
 */
public class NetlifyClient {
    public static final String DEFAULT_BASE = "https://api.netlify.com/api/v1";

    public static class NetlifyException extends IOException {
        public final int status;
        public final String kind; // auth | not_found | rejected | network | server | deploy_failed | timeout
        public NetlifyException(String kind, int status, String message) {
            super(message);
            this.kind = kind;
            this.status = status;
        }
    }

    public interface Progress { void onState(String state, String detail); }

    private final String base;

    public NetlifyClient(String baseUrl) { this.base = baseUrl.endsWith("/") ? baseUrl.substring(0, baseUrl.length() - 1) : baseUrl; }

    public JSONObject validateToken(String token) throws IOException {
        return request("GET", "/user", token, null, null, null);
    }

    public JSONObject createSite(String token, String nameOrNull) throws IOException {
        JSONObject body = new JSONObject();
        try { if (nameOrNull != null && !nameOrNull.isEmpty()) body.put("name", nameOrNull); } catch (JSONException e) { throw new IOException(e); }
        return request("POST", "/sites", token, "application/json", body.toString().getBytes(StandardCharsets.UTF_8), null);
    }

    public JSONObject getSite(String token, String siteId) throws IOException {
        return request("GET", "/sites/" + enc(siteId), token, null, null, null);
    }

    public JSONObject deployZip(String token, String siteId, File zip) throws IOException {
        return request("POST", "/sites/" + enc(siteId) + "/deploys", token, "application/zip", null, zip);
    }

    public JSONObject getDeploy(String token, String deployId) throws IOException {
        return request("GET", "/deploys/" + enc(deployId), token, null, null, null);
    }

    /** Uploads the ZIP to the SAME site and polls until the deploy is ready, failed, or the timeout passes. */
    public JSONObject publish(String token, String siteId, File zip, Progress progress, long pollMs, long timeoutMs) throws IOException {
        progress.onState("uploading", "Uploading site ZIP (" + (zip.length() / 1024) + " KB)");
        JSONObject deploy = deployZip(token, siteId, zip);
        String id = deploy.optString("id");
        if (id.isEmpty()) throw new NetlifyException("rejected", 0, "Netlify did not return a deploy id");
        long deadline = System.currentTimeMillis() + timeoutMs;
        while (true) {
            String state = deploy.optString("state", "");
            progress.onState(state.isEmpty() ? "processing" : state, "Netlify deploy " + id + ": " + state);
            if (state.equals("ready")) return deploy;
            if (state.equals("error")) {
                throw new NetlifyException("deploy_failed", 0, "Netlify reported a deploy error: " + deploy.optString("error_message", "no details"));
            }
            if (System.currentTimeMillis() > deadline) {
                throw new NetlifyException("timeout", 0, "Netlify has not finished the deploy yet (last state: " + state + "). It may still complete; check the Netlify dashboard.");
            }
            try { Thread.sleep(pollMs); } catch (InterruptedException e) { Thread.currentThread().interrupt(); throw new IOException("Interrupted"); }
            deploy = getDeploy(token, id);
        }
    }

    private JSONObject request(String method, String path, String token, String contentType, byte[] body, File bodyFile) throws IOException {
        if (token == null || token.trim().isEmpty()) throw new NetlifyException("auth", 401, "No Netlify access token set");
        HttpURLConnection c = null;
        try {
            c = (HttpURLConnection) new URL(base + path).openConnection();
            c.setRequestMethod(method);
            c.setConnectTimeout(20000);
            c.setReadTimeout(bodyFile != null ? 180000 : 30000);
            c.setRequestProperty("Authorization", "Bearer " + token.trim());
            c.setRequestProperty("Accept", "application/json");
            c.setRequestProperty("User-Agent", "TouchWebsiteStudio/0.1");
            if (contentType != null) c.setRequestProperty("Content-Type", contentType);
            if (body != null || bodyFile != null) {
                c.setDoOutput(true);
                if (bodyFile != null) {
                    c.setFixedLengthStreamingMode(bodyFile.length());
                    try (OutputStream o = c.getOutputStream(); InputStream in = new FileInputStream(bodyFile)) {
                        byte[] buf = new byte[16384];
                        int r;
                        while ((r = in.read(buf)) > 0) o.write(buf, 0, r);
                    }
                } else {
                    c.setFixedLengthStreamingMode(body.length);
                    try (OutputStream o = c.getOutputStream()) { o.write(body); }
                }
            }
            int status = c.getResponseCode();
            InputStream in = status >= 400 ? c.getErrorStream() : c.getInputStream();
            String text = in == null ? "" : readAll(in);
            if (status >= 200 && status < 300) {
                try { return new JSONObject(text.isEmpty() ? "{}" : text); }
                catch (JSONException e) { throw new NetlifyException("server", status, "Netlify returned an unreadable response"); }
            }
            String msg = text;
            try { msg = new JSONObject(text).optString("message", text); } catch (JSONException ignored) { }
            if (msg.length() > 300) msg = msg.substring(0, 300);
            if (status == 401 || status == 403) throw new NetlifyException("auth", status, "Netlify rejected the access token (" + status + "). " + msg);
            if (status == 404) throw new NetlifyException("not_found", status, "Not found on Netlify (404). " + msg);
            if (status == 422 || status == 400) throw new NetlifyException("rejected", status, "Netlify rejected the request (" + status + "): " + msg);
            throw new NetlifyException("server", status, "Netlify error " + status + ": " + msg);
        } catch (NetlifyException e) {
            throw e;
        } catch (IOException e) {
            throw new NetlifyException("network", 0, "Could not reach Netlify: " + e.getMessage());
        } finally {
            if (c != null) c.disconnect();
        }
    }

    private static String enc(String s) throws IOException {
        if (s == null || !s.matches("[A-Za-z0-9._-]+")) throw new NetlifyException("rejected", 0, "Invalid Netlify id");
        return s;
    }

    private static String readAll(InputStream in) throws IOException {
        ByteArrayOutputStream bo = new ByteArrayOutputStream();
        byte[] buf = new byte[8192];
        int r;
        while ((r = in.read(buf)) > 0) bo.write(buf, 0, r);
        return new String(bo.toByteArray(), StandardCharsets.UTF_8);
    }
}
