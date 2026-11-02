package com.touchwebsitestudio.app;

import static org.junit.Assert.*;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Before;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.nio.charset.StandardCharsets;

public class ProjectStoreTest {
    @Rule public TemporaryFolder tmp = new TemporaryFolder();
    private ProjectStore store;

    @Before public void setUp() throws Exception { store = new ProjectStore(tmp.newFolder("projects")); }

    private String project(String id, String name, String hash) throws Exception {
        return new JSONObject().put("id", id).put("name", name).put("contentHash", hash).put("updatedAt", 1000L)
                .put("template", "business").put("future", new JSONObject().put("keep", true)).put("publish", new JSONObject()).toString();
    }

    @Test public void saveLoadRoundTripKeepsUnknownFields() throws Exception {
        store.save("site-a", project("site-a", "A", "h1"));
        JSONObject p = new JSONObject(store.load("site-a"));
        assertEquals("A", p.getString("name"));
        assertTrue(p.getJSONObject("future").getBoolean("keep"));
    }

    @Test public void listShowsSummariesNewestFirstAndReportsCorrupt() throws Exception {
        store.save("site-a", project("site-a", "A", "h1"));
        store.save("site-b", new JSONObject(project("site-b", "B", "h")).put("updatedAt", 5000L).toString());
        File bad = new File(store.dir("site-c"), "project.json");
        bad.getParentFile().mkdirs();
        ProjectStore.writeAtomic(bad, "{not json".getBytes(StandardCharsets.UTF_8));
        JSONArray l = store.list();
        assertEquals(3, l.length());
        int posA = -1, posB = -1;
        for (int i = 0; i < l.length(); i++) {
            if (l.getJSONObject(i).getString("id").equals("site-a")) posA = i;
            if (l.getJSONObject(i).getString("id").equals("site-b")) posB = i;
        }
        assertTrue("newer project listed before older", posB >= 0 && posB < posA);
        boolean sawCorrupt = false;
        for (int i = 0; i < l.length(); i++) if (l.getJSONObject(i).optBoolean("corrupt")) sawCorrupt = true;
        assertTrue("corrupt projects must be reported, not hidden", sawCorrupt);
    }

    @Test public void saveSnapshotsOnlyWhenContentChanged() throws Exception {
        store.save("site-a", project("site-a", "A", "h1"));
        assertEquals(0, store.listVersions("site-a").length());
        store.save("site-a", project("site-a", "A renamed", "h1")); // same content hash: no snapshot
        assertEquals(0, store.listVersions("site-a").length());
        store.save("site-a", project("site-a", "A", "h2"));
        JSONArray v = store.listVersions("site-a");
        assertEquals(1, v.length());
        assertEquals("h1", new JSONObject(store.loadVersion("site-a", v.getJSONObject(0).getString("file"))).getString("contentHash"));
    }

    @Test public void versionsArePruned() throws Exception {
        store.save("site-a", project("site-a", "A", "h0"));
        for (int i = 1; i <= ProjectStore.MAX_VERSIONS + 8; i++) store.save("site-a", project("site-a", "A", "h" + i));
        assertEquals(ProjectStore.MAX_VERSIONS, store.listVersions("site-a").length());
    }

    @Test public void rejectsIdMismatchAndBadIds() throws Exception {
        try { store.save("site-a", project("site-b", "x", "h")); fail(); } catch (java.io.IOException expected) { }
        for (String bad : new String[]{"../x", "A", "a/b", "", "x y"}) {
            try { store.dir(bad); fail(bad); } catch (IllegalArgumentException expected) { }
        }
        try { store.assetFile("site-a", "../../etc/passwd"); fail(); } catch (IllegalArgumentException expected) { }
    }

    @Test public void duplicateCopiesAssetsButResetsPublishLink() throws Exception {
        JSONObject p = new JSONObject(project("site-a", "A", "h1")).put("publish", new JSONObject().put("siteId", "netlify-123"));
        store.save("site-a", p.toString());
        String asset = store.addAsset("site-a", "jpg", new byte[]{1, 2, 3});
        store.duplicate("site-a", "site-b", "A copy");
        JSONObject q = new JSONObject(store.load("site-b"));
        assertEquals("site-b", q.getString("id"));
        assertEquals("A copy", q.getString("name"));
        assertFalse("a copy must never publish over the original's site", q.getJSONObject("publish").has("siteId"));
        assertTrue(store.assetFile("site-b", asset).isFile());
        assertEquals("netlify-123", new JSONObject(store.load("site-a")).getJSONObject("publish").getString("siteId"));
    }

    @Test public void updatePublishLeavesContentAndHistoryAlone() throws Exception {
        store.save("site-a", project("site-a", "A", "h1"));
        store.updatePublish("site-a", new JSONObject().put("siteId", "s1").put("url", "https://x.netlify.app"));
        JSONObject p = new JSONObject(store.load("site-a"));
        assertEquals("s1", p.getJSONObject("publish").getString("siteId"));
        assertEquals("h1", p.getString("contentHash"));
        assertEquals(0, store.listVersions("site-a").length());
    }

    @Test public void projectZipRoundTripCreatesNewProject() throws Exception {
        store.save("site-a", project("site-a", "A", "h1"));
        store.updatePublish("site-a", new JSONObject().put("siteId", "s1"));
        String asset = store.addAsset("site-a", "png", new byte[]{9, 9, 9, 9});
        ByteArrayOutputStream bo = new ByteArrayOutputStream();
        store.exportProject("site-a", bo);
        String nid = store.importProject(new ByteArrayInputStream(bo.toByteArray()));
        assertNotEquals("site-a", nid);
        JSONObject q = new JSONObject(store.load(nid));
        assertEquals(nid, q.getString("id"));
        assertTrue(q.getString("name").contains("imported"));
        assertFalse(q.getJSONObject("publish").has("siteId"));
        assertTrue(q.getJSONObject("future").getBoolean("keep"));
        assertArrayEquals(new byte[]{9, 9, 9, 9}, java.nio.file.Files.readAllBytes(store.assetFile(nid, asset).toPath()));
        assertEquals("original untouched", "A", new JSONObject(store.load("site-a")).getString("name"));
    }

    @Test public void failedImportLeavesNothingBehind() throws Exception {
        int before = store.list().length();
        try { store.importProject(new ByteArrayInputStream("not a zip".getBytes(StandardCharsets.UTF_8))); fail(); } catch (java.io.IOException expected) { }
        assertEquals(before, store.list().length());
        File[] dirs = new File(tmp.getRoot(), "projects").listFiles();
        assertEquals(0, dirs == null ? 0 : dirs.length);
    }

    @Test public void deleteRemovesProject() throws Exception {
        store.save("site-a", project("site-a", "A", "h1"));
        store.delete("site-a");
        assertFalse(store.exists("site-a"));
    }
}
