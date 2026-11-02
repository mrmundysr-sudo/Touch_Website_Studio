package com.touchwebsitestudio.app;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.Random;
import java.util.regex.Pattern;

/** File-backed local project storage. Layout: root/<id>/{project.json, assets/, versions/}. Pure Java so it is unit-testable. */
public class ProjectStore {
    static final Pattern ID = Pattern.compile("[a-z0-9-]{1,48}");
    static final Pattern NAME = Pattern.compile("[A-Za-z0-9][A-Za-z0-9._-]{0,95}");
    static final int MAX_VERSIONS = 25;

    private final File root;

    public ProjectStore(File root) {
        this.root = root;
        root.mkdirs();
    }

    public static String checkId(String id) {
        if (id == null || !ID.matcher(id).matches()) throw new IllegalArgumentException("Invalid project id");
        return id;
    }

    public static String checkAssetName(String name) {
        if (name == null || !NAME.matcher(name).matches() || name.contains("..")) throw new IllegalArgumentException("Invalid asset name");
        return name;
    }

    public File dir(String id) { return new File(root, checkId(id)); }
    public File assetsDir(String id) { return new File(dir(id), "assets"); }
    public File assetFile(String id, String name) { return new File(assetsDir(id), checkAssetName(name)); }
    private File projectFile(String id) { return new File(dir(id), "project.json"); }
    private File versionsDir(String id) { return new File(dir(id), "versions"); }

    public static String newId() {
        String alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
        Random r = new java.security.SecureRandom();
        StringBuilder sb = new StringBuilder("site-");
        for (int i = 0; i < 10; i++) sb.append(alphabet.charAt(r.nextInt(alphabet.length())));
        return sb.toString();
    }

    public boolean exists(String id) { return projectFile(id).isFile(); }

    /** Summaries for the dashboard, newest first. Corrupt projects are reported, never silently dropped. */
    public JSONArray list() throws JSONException {
        List<JSONObject> items = new ArrayList<>();
        File[] dirs = root.listFiles();
        if (dirs != null) {
            for (File d : dirs) {
                if (!d.isDirectory() || !ID.matcher(d.getName()).matches()) continue;
                File pf = new File(d, "project.json");
                if (!pf.isFile()) continue;
                JSONObject s = new JSONObject();
                s.put("id", d.getName());
                try {
                    JSONObject p = new JSONObject(readString(pf));
                    s.put("name", p.optString("name", "Untitled"));
                    s.put("template", p.optString("template", ""));
                    s.put("updatedAt", p.optLong("updatedAt", pf.lastModified()));
                    s.put("contentHash", p.optString("contentHash", ""));
                    JSONObject pub = p.optJSONObject("publish");
                    if (pub != null) {
                        s.put("publishedUrl", pub.optString("url", ""));
                        s.put("publishedHash", pub.optString("publishedHash", ""));
                        s.put("siteId", pub.optString("siteId", ""));
                    }
                } catch (Exception e) {
                    s.put("name", d.getName());
                    s.put("corrupt", true);
                    s.put("updatedAt", pf.lastModified());
                }
                items.add(s);
            }
        }
        Collections.sort(items, (a, b) -> Long.compare(b.optLong("updatedAt"), a.optLong("updatedAt")));
        return new JSONArray(items);
    }

    public String load(String id) throws IOException {
        File f = projectFile(id);
        if (!f.isFile()) throw new IOException("Project not found");
        return readString(f);
    }

    /** Validates JSON, snapshots the previous version when content changed, then writes atomically. */
    public void save(String id, String json) throws IOException, JSONException {
        JSONObject p = new JSONObject(json);
        if (!checkId(id).equals(p.optString("id"))) throw new IOException("Project id mismatch");
        File f = projectFile(id);
        if (f.isFile()) {
            try {
                JSONObject old = new JSONObject(readString(f));
                if (!old.optString("contentHash").equals(p.optString("contentHash"))) snapshot(id, "save");
            } catch (JSONException ignored) {
                snapshot(id, "pre-corrupt");
            }
        }
        f.getParentFile().mkdirs();
        writeAtomic(f, json.getBytes(StandardCharsets.UTF_8));
    }

    /** Copies the current project.json into versions/. Returns the file name or null if there is nothing to snapshot. */
    public String snapshot(String id, String label) throws IOException {
        File f = projectFile(id);
        if (!f.isFile()) return null;
        File vd = versionsDir(id);
        vd.mkdirs();
        String safe = label.replaceAll("[^a-z0-9-]", "");
        if (safe.isEmpty()) safe = "snap";
        long ts = System.currentTimeMillis();
        File out = new File(vd, ts + "-" + safe + ".json");
        int n = 1;
        while (out.exists()) out = new File(vd, ts + "-" + safe + "-" + (n++) + ".json");
        copy(f, out);
        File[] all = vd.listFiles();
        if (all != null && all.length > MAX_VERSIONS) {
            Arrays.sort(all);
            for (int i = 0; i < all.length - MAX_VERSIONS; i++) all[i].delete();
        }
        return out.getName();
    }

    public JSONArray listVersions(String id) throws JSONException {
        JSONArray arr = new JSONArray();
        File[] all = versionsDir(id).listFiles();
        if (all == null) return arr;
        Arrays.sort(all, Collections.reverseOrder());
        for (File v : all) {
            String n = v.getName();
            if (!n.endsWith(".json")) continue;
            JSONObject o = new JSONObject();
            o.put("file", n);
            String[] parts = n.substring(0, n.length() - 5).split("-", 2);
            try { o.put("ts", Long.parseLong(parts[0])); } catch (NumberFormatException e) { o.put("ts", v.lastModified()); }
            o.put("label", parts.length > 1 ? parts[1] : "");
            arr.put(o);
        }
        return arr;
    }

    public String loadVersion(String id, String file) throws IOException {
        if (!file.matches("[0-9]+-[a-z0-9-]*\\.json")) throw new IllegalArgumentException("Invalid version");
        return readString(new File(versionsDir(id), file));
    }

    /** Patches only the "publish" block of the stored project (site link / deploy info) without touching content or history. */
    public void updatePublish(String id, JSONObject publish) throws IOException, JSONException {
        JSONObject p = new JSONObject(load(id));
        p.put("publish", publish);
        writeAtomic(projectFile(id), p.toString().getBytes(StandardCharsets.UTF_8));
    }

    public void delete(String id) throws IOException {
        File d = dir(id);
        if (d.exists()) deleteRecursive(d);
    }

    /** Copies a project (without version history) under a new id; publish link is reset so a copy never overwrites the original's site. */
    public void duplicate(String id, String newId, String newName) throws IOException, JSONException {
        File src = dir(id), dst = dir(newId);
        if (dst.exists()) throw new IOException("Target exists");
        dst.mkdirs();
        copy(projectFile(id), new File(dst, "project.json"));
        File[] assets = assetsDir(id).listFiles();
        if (assets != null) {
            new File(dst, "assets").mkdirs();
            for (File a : assets) copy(a, new File(new File(dst, "assets"), a.getName()));
        }
        JSONObject p = new JSONObject(readString(new File(dst, "project.json")));
        p.put("id", newId);
        p.put("name", newName);
        p.put("publish", new JSONObject());
        p.put("updatedAt", System.currentTimeMillis());
        writeAtomic(new File(dst, "project.json"), p.toString().getBytes(StandardCharsets.UTF_8));
    }

    public String addAsset(String id, String ext, byte[] data) throws IOException {
        if (!ext.matches("[a-z0-9]{2,5}")) throw new IllegalArgumentException("Bad extension");
        File d = assetsDir(id);
        d.mkdirs();
        String name = "img-" + Long.toString(System.nanoTime(), 36) + Integer.toString(new Random().nextInt(1296), 36) + "." + ext;
        writeAtomic(new File(d, name), data);
        return name;
    }

    // ---- ZIP project import/export ----

    public void exportProject(String id, OutputStream out) throws IOException {
        ZipUtil.writeProjectZip(dir(id), out);
    }

    /** Imports a project ZIP as a NEW project (never overwrites). Returns the new id. */
    public String importProject(InputStream in) throws IOException, JSONException {
        String newId = newId();
        File d = dir(newId);
        try {
            ZipUtil.readProjectZip(in, d);
            File pf = new File(d, "project.json");
            JSONObject p = new JSONObject(readString(pf));
            p.put("id", newId);
            p.put("name", p.optString("name", "Imported site") + " (imported)");
            p.put("publish", new JSONObject());
            p.put("updatedAt", System.currentTimeMillis());
            writeAtomic(pf, p.toString().getBytes(StandardCharsets.UTF_8));
        } catch (IOException | JSONException | RuntimeException e) {
            deleteRecursive(d);
            throw e;
        }
        return newId;
    }

    // ---- io helpers ----

    static String readString(File f) throws IOException {
        try (InputStream in = new FileInputStream(f)) {
            ByteArrayOutputStream bo = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            int n;
            while ((n = in.read(buf)) > 0) bo.write(buf, 0, n);
            return new String(bo.toByteArray(), StandardCharsets.UTF_8);
        }
    }

    static void writeAtomic(File f, byte[] data) throws IOException {
        File tmp = new File(f.getParentFile(), f.getName() + ".tmp");
        try (FileOutputStream o = new FileOutputStream(tmp)) {
            o.write(data);
            o.getFD().sync();
        }
        if (!tmp.renameTo(f)) {
            f.delete();
            if (!tmp.renameTo(f)) throw new IOException("Could not write " + f.getName());
        }
    }

    static void copy(File a, File b) throws IOException {
        try (InputStream in = new FileInputStream(a); OutputStream out = new FileOutputStream(b)) {
            byte[] buf = new byte[16384];
            int n;
            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
        }
    }

    static void deleteRecursive(File f) throws IOException {
        File[] kids = f.listFiles();
        if (kids != null) for (File k : kids) deleteRecursive(k);
        if (!f.delete() && f.exists()) throw new IOException("Could not delete " + f);
    }
}
