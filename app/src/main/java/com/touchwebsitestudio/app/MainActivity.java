package com.touchwebsitestudio.app;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Hosts the HTML/JS studio UI in a WebView and exposes a small, promise-style native bridge. */
public class MainActivity extends Activity {
    static final String HOST = "appassets.studio";
    static final int RC_PICK_IMAGE = 11, RC_SAVE_ZIP = 12, RC_OPEN_PROJECT = 13;

    private WebView web;
    private ProjectStore store;
    private SecretStore secrets;
    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private String pendingCall, pendingProject;
    private File pendingFile;

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        store = new ProjectStore(new File(getFilesDir(), "projects"));
        secrets = new SecretStore(this);
        web = new WebView(this);
        setContentView(web);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setMediaPlaybackRequiresUserGesture(true);
        web.setOverScrollMode(WebView.OVER_SCROLL_NEVER);
        web.addJavascriptInterface(new Bridge(), "Native");
        web.setWebViewClient(new WebViewClient() {
            @Override public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest r) {
                Uri u = r.getUrl();
                if (!HOST.equals(u.getHost())) return null;
                try { return serve(u.getPath()); } catch (Exception e) { return notFound(); }
            }
            @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                Uri u = r.getUrl();
                if (HOST.equals(u.getHost())) return false;
                if ("http".equals(u.getScheme()) || "https".equals(u.getScheme())) {
                    try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (ActivityNotFoundException ignored) { }
                }
                return true;
            }
        });
        web.loadUrl("https://" + HOST + "/app/index.html");
    }

    private WebResourceResponse notFound() {
        return new WebResourceResponse("text/plain", "utf-8", 404, "Not found", null, new java.io.ByteArrayInputStream(new byte[0]));
    }

    private WebResourceResponse serve(String path) throws Exception {
        if (path.startsWith("/app/")) {
            String rel = path.substring(5);
            if (rel.contains("..")) return notFound();
            InputStream in = getAssets().open("studio/" + rel);
            return new WebResourceResponse(mime(rel), "utf-8", in);
        }
        String[] p = path.split("/");
        // /p/<id>/assets/<name>
        if (p.length == 5 && p[1].equals("p") && p[3].equals("assets")) {
            File f = store.assetFile(p[2], p[4]);
            if (!f.isFile()) return notFound();
            return new WebResourceResponse(mime(f.getName()), null, new FileInputStream(f));
        }
        return notFound();
    }

    static String mime(String n) {
        n = n.toLowerCase();
        if (n.endsWith(".html")) return "text/html";
        if (n.endsWith(".js")) return "application/javascript";
        if (n.endsWith(".css")) return "text/css";
        if (n.endsWith(".png")) return "image/png";
        if (n.endsWith(".jpg") || n.endsWith(".jpeg")) return "image/jpeg";
        if (n.endsWith(".webp")) return "image/webp";
        if (n.endsWith(".svg")) return "image/svg+xml";
        if (n.endsWith(".json")) return "application/json";
        return "application/octet-stream";
    }

    @Override
    public void onBackPressed() {
        web.evaluateJavascript("window.studio && window.studio.back ? window.studio.back() : false", v -> {
            if (!"true".equals(v)) finish();
        });
    }

    @Override
    protected void onPause() {
        super.onPause();
        web.evaluateJavascript("window.studio && window.studio.onPause && window.studio.onPause()", null);
    }

    @Override
    protected void onDestroy() {
        io.shutdown();
        super.onDestroy();
    }

    // ---------- results back to JS ----------

    private void resolve(String callId, boolean ok, String payloadJson) {
        final String js = "window.__nativeResult(" + JSONObject.quote(callId) + "," + ok + "," + JSONObject.quote(payloadJson) + ")";
        runOnUiThread(() -> web.evaluateJavascript(js, null));
    }

    private void event(String name, JSONObject data) {
        final String js = "window.__nativeEvent && window.__nativeEvent(" + JSONObject.quote(name) + "," + JSONObject.quote(data.toString()) + ")";
        runOnUiThread(() -> web.evaluateJavascript(js, null));
    }

    private void fail(String callId, Exception e) {
        JSONObject o = new JSONObject();
        try {
            o.put("message", e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage());
            if (e instanceof NetlifyClient.NetlifyException) {
                o.put("kind", ((NetlifyClient.NetlifyException) e).kind);
                o.put("status", ((NetlifyClient.NetlifyException) e).status);
            }
        } catch (Exception ignored) { }
        resolve(callId, false, o.toString());
    }

    // ---------- activity results ----------

    @Override
    protected void onActivityResult(int rc, int result, Intent data) {
        super.onActivityResult(rc, result, data);
        final String callId = pendingCall;
        final String projectId = pendingProject;
        final File file = pendingFile;
        if (callId == null) return;
        pendingCall = null; pendingProject = null; pendingFile = null;
        if (result != RESULT_OK || data == null || data.getData() == null) {
            resolve(callId, true, "{\"cancelled\":true}");
            return;
        }
        final Uri uri = data.getData();
        io.execute(() -> {
            try {
                if (rc == RC_PICK_IMAGE) {
                    byte[] raw = readAll(getContentResolver().openInputStream(uri), 40 * 1024 * 1024);
                    ImageUtil.Result r = ImageUtil.prepare(raw);
                    String name = store.addAsset(projectId, r.ext, r.data);
                    JSONObject o = new JSONObject();
                    o.put("file", name); o.put("width", r.width); o.put("height", r.height);
                    resolve(callId, true, o.toString());
                } else if (rc == RC_SAVE_ZIP) {
                    try (InputStream in = new FileInputStream(file); OutputStream out = getContentResolver().openOutputStream(uri)) {
                        byte[] buf = new byte[16384]; int n;
                        while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
                    }
                    resolve(callId, true, "{\"saved\":true}");
                } else if (rc == RC_OPEN_PROJECT) {
                    String id = store.importProject(getContentResolver().openInputStream(uri));
                    resolve(callId, true, new JSONObject().put("id", id).toString());
                }
            } catch (Exception e) {
                fail(callId, e);
            }
        });
    }

    static byte[] readAll(InputStream in, int max) throws java.io.IOException {
        try (InputStream i = in) {
            ByteArrayOutputStream bo = new ByteArrayOutputStream();
            byte[] buf = new byte[16384]; int n;
            while ((n = i.read(buf)) > 0) {
                bo.write(buf, 0, n);
                if (bo.size() > max) throw new java.io.IOException("File is too large");
            }
            return bo.toByteArray();
        }
    }

    private File shareFile(String name) {
        File d = new File(getCacheDir(), "share");
        d.mkdirs();
        return new File(d, name);
    }

    private File buildSiteZip(String id, JSONObject args) throws Exception {
        JSONObject files = args.getJSONObject("files");
        Map<String, String> text = new LinkedHashMap<>();
        for (Iterator<String> it = files.keys(); it.hasNext(); ) { String k = it.next(); text.put(k, files.getString(k)); }
        JSONArray used = args.optJSONArray("assets");
        List<String> assets = new ArrayList<>();
        if (used != null) for (int i = 0; i < used.length(); i++) assets.add(used.getString(i));
        File zip = shareFile("site-" + id + ".zip");
        try (OutputStream o = new FileOutputStream(zip)) { ZipUtil.writeSiteZip(text, store.assetsDir(id), assets, o); }
        return zip;
    }

    private String zipName(String base, String suffix) {
        String b = base == null ? "website" : base.toLowerCase().replaceAll("[^a-z0-9]+", "-").replaceAll("^-|-$", "");
        return (b.isEmpty() ? "website" : b) + suffix + ".zip";
    }

    // ---------- the bridge ----------

    private class Bridge {
        @JavascriptInterface
        public void invoke(final String callId, final String method, final String argsJson) {
            io.execute(() -> {
                try { dispatch(callId, method, new JSONObject(argsJson == null || argsJson.isEmpty() ? "{}" : argsJson)); }
                catch (Exception e) { fail(callId, e); }
            });
        }

        private void dispatch(String callId, String method, JSONObject a) throws Exception {
            switch (method) {
                case "appInfo": {
                    JSONObject o = new JSONObject();
                    o.put("version", getPackageManager().getPackageInfo(getPackageName(), 0).versionName);
                    resolve(callId, true, o.toString());
                    return;
                }
                case "listProjects": resolve(callId, true, store.list().toString()); return;
                case "newId": resolve(callId, true, new JSONObject().put("id", ProjectStore.newId()).toString()); return;
                case "loadProject": resolve(callId, true, store.load(a.getString("id"))); return;
                case "saveProject": store.save(a.getString("id"), a.getString("json")); resolve(callId, true, "{}"); return;
                case "updatePublish": store.updatePublish(a.getString("id"), a.getJSONObject("publish")); resolve(callId, true, "{}"); return;
                case "deleteProject": store.delete(a.getString("id")); resolve(callId, true, "{}"); return;
                case "duplicateProject": {
                    String nid = ProjectStore.newId();
                    store.duplicate(a.getString("id"), nid, a.getString("name"));
                    resolve(callId, true, new JSONObject().put("id", nid).toString());
                    return;
                }
                case "snapshot": {
                    String f = store.snapshot(a.getString("id"), a.optString("label", "snap"));
                    resolve(callId, true, new JSONObject().put("file", f == null ? "" : f).toString());
                    return;
                }
                case "listVersions": resolve(callId, true, store.listVersions(a.getString("id")).toString()); return;
                case "loadVersion": resolve(callId, true, store.loadVersion(a.getString("id"), a.getString("file"))); return;

                case "pickImage": {
                    ProjectStore.checkId(a.getString("id"));
                    pendingCall = callId; pendingProject = a.getString("id");
                    Intent i = new Intent(Intent.ACTION_GET_CONTENT).setType("image/*").addCategory(Intent.CATEGORY_OPENABLE);
                    runOnUiThread(() -> startActivityForResult(Intent.createChooser(i, "Choose a photo"), RC_PICK_IMAGE));
                    return;
                }
                case "exportSiteZip": {
                    String id = a.getString("id");
                    File zip = buildSiteZip(id, a);
                    pendingCall = callId; pendingFile = zip;
                    Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT).setType("application/zip").addCategory(Intent.CATEGORY_OPENABLE)
                            .putExtra(Intent.EXTRA_TITLE, zipName(a.optString("name"), "-site"));
                    runOnUiThread(() -> startActivityForResult(i, RC_SAVE_ZIP));
                    return;
                }
                case "exportProjectZip": {
                    String id = a.getString("id");
                    File zip = shareFile("project-" + id + ".zip");
                    try (OutputStream o = new FileOutputStream(zip)) { store.exportProject(id, o); }
                    pendingCall = callId; pendingFile = zip;
                    Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT).setType("application/zip").addCategory(Intent.CATEGORY_OPENABLE)
                            .putExtra(Intent.EXTRA_TITLE, zipName(a.optString("name"), "-project"));
                    runOnUiThread(() -> startActivityForResult(i, RC_SAVE_ZIP));
                    return;
                }
                case "importProjectZip": {
                    pendingCall = callId;
                    Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT).setType("*/*").addCategory(Intent.CATEGORY_OPENABLE)
                            .putExtra(Intent.EXTRA_MIME_TYPES, new String[]{"application/zip", "application/x-zip-compressed", "application/octet-stream"});
                    runOnUiThread(() -> startActivityForResult(i, RC_OPEN_PROJECT));
                    return;
                }
                case "shareForAi": {
                    String id = a.getString("id");
                    File zip = shareFile("project-" + id + ".zip");
                    try (OutputStream o = new FileOutputStream(zip)) { store.exportProject(id, o); }
                    Intent send = new Intent(Intent.ACTION_SEND).setType("application/zip")
                            .putExtra(Intent.EXTRA_STREAM, ShareProvider.uriFor(zip.getName()))
                            .putExtra(Intent.EXTRA_TEXT, a.optString("prompt"))
                            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    runOnUiThread(() -> startActivity(Intent.createChooser(send, "Share project with an AI app")));
                    resolve(callId, true, "{\"shared\":true}");
                    return;
                }

                case "tokenStatus": resolve(callId, true, new JSONObject().put("hasToken", secrets.has()).toString()); return;
                case "setToken": secrets.put(a.getString("token").trim()); resolve(callId, true, "{}"); return;
                case "clearToken": secrets.clear(); resolve(callId, true, "{}"); return;
                case "verifyToken": {
                    JSONObject u = netlify(a).validateToken(token());
                    resolve(callId, true, new JSONObject().put("email", u.optString("email")).put("name", u.optString("full_name")).toString());
                    return;
                }
                case "createSite": {
                    JSONObject s = netlify(a).createSite(token(), a.optString("name", ""));
                    resolve(callId, true, siteInfo(s).toString());
                    return;
                }
                case "linkSite": {
                    JSONObject s = netlify(a).getSite(token(), a.getString("siteId"));
                    resolve(callId, true, siteInfo(s).toString());
                    return;
                }
                case "publish": {
                    String id = a.getString("id");
                    File zip = buildSiteZip(id, a);
                    NetlifyClient c = netlify(a);
                    JSONObject d = c.publish(token(), a.getString("siteId"), zip,
                            (state, detail) -> { try { event("publishProgress", new JSONObject().put("state", state).put("detail", detail)); } catch (Exception ignored) { } },
                            a.optLong("pollMs", 2000), a.optLong("timeoutMs", 180000));
                    JSONObject o = new JSONObject();
                    o.put("deployId", d.optString("id"));
                    o.put("state", d.optString("state"));
                    String url = d.optString("ssl_url", d.optString("url", ""));
                    o.put("url", url);
                    o.put("deployUrl", d.optString("deploy_ssl_url", ""));
                    resolve(callId, true, o.toString());
                    return;
                }
                default:
                    throw new IllegalArgumentException("Unknown native method: " + method);
            }
        }

        private NetlifyClient netlify(JSONObject a) {
            // baseUrl override exists for tests only; the UI never sets it.
            return new NetlifyClient(a.optString("baseUrl", NetlifyClient.DEFAULT_BASE));
        }

        private String token() throws Exception {
            String t = secrets.get();
            if (t == null || t.isEmpty()) throw new NetlifyClient.NetlifyException("auth", 401, "No Netlify access token saved. Add one in Publish settings.");
            return t;
        }

        private JSONObject siteInfo(JSONObject s) throws Exception {
            return new JSONObject().put("siteId", s.optString("id")).put("name", s.optString("name"))
                    .put("url", s.optString("ssl_url", s.optString("url", "")))
                    .put("adminUrl", s.optString("admin_url", ""));
        }
    }
}
