package com.touchwebsitestudio.app;

import static org.junit.Assert.*;

import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;
import java.util.zip.ZipOutputStream;

public class ZipUtilTest {
    @Rule public TemporaryFolder tmp = new TemporaryFolder();

    private static Set<String> names(byte[] zip) throws Exception {
        Set<String> s = new TreeSet<>();
        try (ZipInputStream z = new ZipInputStream(new ByteArrayInputStream(zip))) {
            ZipEntry e;
            while ((e = z.getNextEntry()) != null) s.add(e.getName());
        }
        return s;
    }

    private static byte[] zipOf(String[] names, String[] bodies) throws Exception {
        ByteArrayOutputStream bo = new ByteArrayOutputStream();
        try (ZipOutputStream z = new ZipOutputStream(bo)) {
            for (int i = 0; i < names.length; i++) {
                z.putNextEntry(new ZipEntry(names[i]));
                z.write(bodies[i].getBytes(StandardCharsets.UTF_8));
                z.closeEntry();
            }
        }
        return bo.toByteArray();
    }

    @Test public void siteZipHasIndexAtRootAndOnlyUsedAssets() throws Exception {
        File assets = tmp.newFolder("assets");
        java.nio.file.Files.write(new File(assets, "a.jpg").toPath(), new byte[]{1});
        java.nio.file.Files.write(new File(assets, "unused.jpg").toPath(), new byte[]{2});
        Map<String, String> files = new LinkedHashMap<>();
        files.put("index.html", "<html></html>"); files.put("style.css", "a{}"); files.put("script.js", "");
        ByteArrayOutputStream bo = new ByteArrayOutputStream();
        ZipUtil.writeSiteZip(files, assets, Arrays.asList("a.jpg", "a.jpg"), bo);
        assertEquals(new TreeSet<>(Arrays.asList("index.html", "style.css", "script.js", "assets/a.jpg")), names(bo.toByteArray()));
    }

    @Test public void siteZipFailsLoudlyOnMissingImage() throws Exception {
        File assets = tmp.newFolder("assets");
        try {
            ZipUtil.writeSiteZip(Collections.singletonMap("index.html", "x"), assets, Collections.singletonList("gone.jpg"), new ByteArrayOutputStream());
            fail();
        } catch (java.io.IOException e) { assertTrue(e.getMessage().contains("gone.jpg")); }
    }

    @Test public void siteZipRejectsUnsafeNames() throws Exception {
        try { ZipUtil.writeSiteZip(Collections.singletonMap("../evil.html", "x"), tmp.newFolder("a"), new ArrayList<String>(), new ByteArrayOutputStream()); fail(); }
        catch (java.io.IOException expected) { }
        try { ZipUtil.writeSiteZip(Collections.singletonMap("index.html", "x"), tmp.newFolder("b"), Collections.singletonList("../x.jpg"), new ByteArrayOutputStream()); fail(); }
        catch (IllegalArgumentException expected) { }
    }

    @Test public void readerRejectsZipSlip() throws Exception {
        byte[] evil = zipOf(new String[]{"manifest.json", "project.json", "../../evil.txt"}, new String[]{"{\"format\":\"" + ZipUtil.PROJECT_FORMAT + "\"}", "{}", "x"});
        try { ZipUtil.readProjectZip(new ByteArrayInputStream(evil), tmp.newFolder("d1")); fail(); } catch (java.io.IOException expected) { }
        assertFalse(new File(tmp.getRoot(), "evil.txt").exists());
    }

    @Test public void readerRejectsForeignZipsAndUnexpectedLayout() throws Exception {
        byte[] foreign = zipOf(new String[]{"index.html"}, new String[]{"<html>"});
        try { ZipUtil.readProjectZip(new ByteArrayInputStream(foreign), tmp.newFolder("d2")); fail(); } catch (java.io.IOException expected) { }
        byte[] extra = zipOf(new String[]{"manifest.json", "project.json", "run.sh"}, new String[]{"{\"format\":\"" + ZipUtil.PROJECT_FORMAT + "\"}", "{}", "x"});
        try { ZipUtil.readProjectZip(new ByteArrayInputStream(extra), tmp.newFolder("d3")); fail(); } catch (java.io.IOException expected) { }
        byte[] noManifest = zipOf(new String[]{"project.json"}, new String[]{"{}"});
        try { ZipUtil.readProjectZip(new ByteArrayInputStream(noManifest), tmp.newFolder("d4")); fail(); } catch (java.io.IOException expected) { }
    }
}
