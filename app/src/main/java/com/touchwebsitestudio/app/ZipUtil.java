package com.touchwebsitestudio.app;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;
import java.util.zip.ZipOutputStream;

/** ZIP builders and a defensive reader. The deployable-site ZIP and the editable project ZIP are deliberately different formats. */
public class ZipUtil {
    public static final String PROJECT_FORMAT = "touch-website-studio-project";
    static final long MAX_ENTRY = 40L * 1024 * 1024;
    static final long MAX_TOTAL = 150L * 1024 * 1024;

    /**
     * Deployable site: index.html + css/js + referenced assets only, at the ZIP root (what Netlify expects).
     * No project.json, version history or editor data is included.
     */
    public static void writeSiteZip(Map<String, String> textFiles, File assetsDir, Iterable<String> usedAssets, OutputStream out) throws IOException {
        try (ZipOutputStream z = new ZipOutputStream(out)) {
            for (Map.Entry<String, String> e : textFiles.entrySet()) {
                checkEntryName(e.getKey());
                z.putNextEntry(new ZipEntry(e.getKey()));
                z.write(e.getValue().getBytes(StandardCharsets.UTF_8));
                z.closeEntry();
            }
            java.util.HashSet<String> seen = new java.util.HashSet<>();
            for (String a : usedAssets) {
                ProjectStore.checkAssetName(a);
                if (!seen.add(a)) continue;
                File f = new File(assetsDir, a);
                if (!f.isFile()) throw new IOException("Missing image file: " + a);
                z.putNextEntry(new ZipEntry("assets/" + a));
                copyTo(f, z);
                z.closeEntry();
            }
        }
    }

    /** Editable project package: manifest + project.json + all assets. Version history stays on the device. */
    public static void writeProjectZip(File projectDir, OutputStream out) throws IOException {
        File pj = new File(projectDir, "project.json");
        if (!pj.isFile()) throw new IOException("Project not found");
        try (ZipOutputStream z = new ZipOutputStream(out)) {
            z.putNextEntry(new ZipEntry("manifest.json"));
            z.write(("{\"format\":\"" + PROJECT_FORMAT + "\",\"version\":1}").getBytes(StandardCharsets.UTF_8));
            z.closeEntry();
            z.putNextEntry(new ZipEntry("project.json"));
            copyTo(pj, z);
            z.closeEntry();
            File[] assets = new File(projectDir, "assets").listFiles();
            if (assets != null) {
                for (File a : assets) {
                    if (!a.isFile() || a.getName().endsWith(".tmp")) continue;
                    z.putNextEntry(new ZipEntry("assets/" + a.getName()));
                    copyTo(a, z);
                    z.closeEntry();
                }
            }
        }
    }

    /** Reads a project ZIP into destDir. Rejects traversal, unknown layouts and oversize content. */
    public static void readProjectZip(InputStream in, File destDir) throws IOException {
        boolean manifest = false, project = false;
        long total = 0;
        destDir.mkdirs();
        try (ZipInputStream z = new ZipInputStream(in)) {
            ZipEntry e;
            while ((e = z.getNextEntry()) != null) {
                String n = e.getName();
                if (e.isDirectory()) continue;
                checkEntryName(n);
                File target;
                if (n.equals("manifest.json")) {
                    String m = new String(readLimited(z, 4096), StandardCharsets.UTF_8);
                    if (!m.contains(PROJECT_FORMAT)) throw new IOException("Not a Touch Website Studio project package");
                    manifest = true;
                    continue;
                } else if (n.equals("project.json")) {
                    target = new File(destDir, "project.json");
                    project = true;
                } else if (n.startsWith("assets/") && n.indexOf('/', 7) < 0) {
                    ProjectStore.checkAssetName(n.substring(7));
                    new File(destDir, "assets").mkdirs();
                    target = new File(new File(destDir, "assets"), n.substring(7));
                } else {
                    throw new IOException("Unexpected file in project package: " + n);
                }
                try (OutputStream o = new FileOutputStream(target)) {
                    byte[] buf = new byte[16384];
                    long size = 0;
                    int r;
                    while ((r = z.read(buf)) > 0) {
                        size += r;
                        total += r;
                        if (size > MAX_ENTRY || total > MAX_TOTAL) throw new IOException("Project package too large");
                        o.write(buf, 0, r);
                    }
                }
            }
        }
        if (!manifest || !project) throw new IOException("Not a Touch Website Studio project package");
    }

    static void checkEntryName(String n) throws IOException {
        if (n.isEmpty() || n.startsWith("/") || n.contains("\\") || n.contains("..") || n.contains("\0")) throw new IOException("Unsafe path in ZIP: " + n);
    }

    static byte[] readLimited(InputStream in, int max) throws IOException {
        java.io.ByteArrayOutputStream bo = new java.io.ByteArrayOutputStream();
        byte[] buf = new byte[1024];
        int r;
        while ((r = in.read(buf)) > 0) {
            bo.write(buf, 0, r);
            if (bo.size() > max) throw new IOException("Entry too large");
        }
        return bo.toByteArray();
    }

    static void copyTo(File f, OutputStream o) throws IOException {
        try (InputStream in = new FileInputStream(f)) {
            byte[] buf = new byte[16384];
            int r;
            while ((r = in.read(buf)) > 0) o.write(buf, 0, r);
        }
    }
}
