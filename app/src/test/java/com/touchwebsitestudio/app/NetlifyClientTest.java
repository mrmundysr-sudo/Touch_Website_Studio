package com.touchwebsitestudio.app;

import static org.junit.Assert.*;

import org.json.JSONObject;
import org.junit.After;
import org.junit.Before;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

import java.io.File;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Collections;
import java.util.concurrent.atomic.AtomicInteger;

/** Exercises the real HTTP code path against a local mock of the Netlify API. This does NOT prove behaviour against the live service. */
public class NetlifyClientTest {
    @Rule public TemporaryFolder tmp = new TemporaryFolder();
    private MiniServer server;
    private NetlifyClient client;
    private final List<String> log = Collections.synchronizedList(new ArrayList<String>());
    private final AtomicInteger polls = new AtomicInteger();
    private volatile String finalState = "ready";
    private volatile byte[] lastUpload;
    private volatile String lastContentType;

    private static MiniServer.Response ok(int code, String body) { return new MiniServer.Response(code, body); }

    @Before public void start() throws Exception {
        server = new MiniServer((method, path, headers, body) -> {
            path = path.substring("/api/v1".length());
            log.add(method + " " + path);
            if (!"Bearer good-token".equals(headers.get("authorization"))) return ok(401, "{\"code\":401,\"message\":\"Access Denied\"}");
            if (path.equals("/user")) return ok(200, "{\"email\":\"me@example.com\",\"full_name\":\"Me\"}");
            if (path.equals("/sites") && method.equals("POST")) {
                if (new String(body, StandardCharsets.UTF_8).contains("taken")) return ok(422, "{\"message\":\"Subdomain must be unique\"}");
                return ok(201, "{\"id\":\"site123\",\"name\":\"my-site\",\"ssl_url\":\"https://my-site.netlify.app\",\"admin_url\":\"https://app.netlify.com/sites/my-site\"}");
            }
            if (path.equals("/sites/site123")) return ok(200, "{\"id\":\"site123\",\"ssl_url\":\"https://my-site.netlify.app\"}");
            if (path.equals("/sites/site123/deploys") && method.equals("POST")) {
                lastContentType = headers.get("content-type");
                lastUpload = body;
                return ok(200, "{\"id\":\"dep1\",\"state\":\"uploading\"}");
            }
            if (path.equals("/deploys/dep1")) {
                int n = polls.incrementAndGet();
                String st = n < 3 ? "processing" : finalState;
                return ok(200, "{\"id\":\"dep1\",\"state\":\"" + st + "\",\"ssl_url\":\"https://my-site.netlify.app\"" + (st.equals("error") ? ",\"error_message\":\"bad build\"" : "") + "}");
            }
            return ok(404, "{\"message\":\"Not Found\"}");
        });
        client = new NetlifyClient("http://127.0.0.1:" + server.port() + "/api/v1");
    }

    @After public void stop() { server.stop(); }

    private File zip() throws Exception {
        File f = File.createTempFile("site", ".zip", tmp.getRoot());
        java.nio.file.Files.write(f.toPath(), "PKfake-zip-bytes".getBytes(StandardCharsets.UTF_8));
        return f;
    }

    @Test public void validatesToken() throws Exception {
        assertEquals("me@example.com", client.validateToken("good-token").getString("email"));
    }

    @Test public void badTokenIsAnAuthError() throws Exception {
        try { client.validateToken("nope"); fail(); }
        catch (NetlifyClient.NetlifyException e) { assertEquals("auth", e.kind); assertEquals(401, e.status); assertTrue(e.getMessage().contains("Access Denied")); }
    }

    @Test public void missingTokenFailsBeforeAnyRequest() throws Exception {
        try { client.validateToken(""); fail(); } catch (NetlifyClient.NetlifyException e) { assertEquals("auth", e.kind); }
        assertTrue(log.isEmpty());
    }

    @Test public void createsSiteAndReportsRejectedNames() throws Exception {
        JSONObject s = client.createSite("good-token", null);
        assertEquals("site123", s.getString("id"));
        try { client.createSite("good-token", "taken"); fail(); }
        catch (NetlifyClient.NetlifyException e) { assertEquals("rejected", e.kind); assertTrue(e.getMessage().contains("unique")); }
    }

    @Test public void publishUploadsZipToSameSiteAndPollsUntilReady() throws Exception {
        final List<String> states = new ArrayList<>();
        JSONObject d = client.publish("good-token", "site123", zip(), (s, det) -> states.add(s), 5, 5000);
        assertEquals("ready", d.getString("state"));
        assertEquals("application/zip", lastContentType);
        assertEquals("PKfake-zip-bytes", new String(lastUpload, StandardCharsets.UTF_8));
        assertTrue("polled while processing", polls.get() >= 3);
        assertEquals("uploading", states.get(0));
        assertEquals("POST /sites/site123/deploys", log.get(0));
        // a second publish targets the SAME site id, never creating another site
        client.publish("good-token", "site123", zip(), (s, det) -> { }, 5, 5000);
        for (String l : log) assertNotEquals("POST /sites", l);
    }

    @Test public void deployErrorStateIsReportedTruthfully() throws Exception {
        finalState = "error";
        try { client.publish("good-token", "site123", zip(), (s, det) -> { }, 5, 5000); fail(); }
        catch (NetlifyClient.NetlifyException e) { assertEquals("deploy_failed", e.kind); assertTrue(e.getMessage().contains("bad build")); }
    }

    @Test public void stuckDeployTimesOutWithoutClaimingSuccess() throws Exception {
        finalState = "processing";
        try { client.publish("good-token", "site123", zip(), (s, det) -> { }, 5, 100); fail(); }
        catch (NetlifyClient.NetlifyException e) { assertEquals("timeout", e.kind); }
    }

    @Test public void unknownSiteIsNotFound() throws Exception {
        try { client.deployZip("good-token", "ghost", zip()); fail(); }
        catch (NetlifyClient.NetlifyException e) { assertEquals("not_found", e.kind); }
    }

    @Test public void unreachableHostIsANetworkError() throws Exception {
        NetlifyClient dead = new NetlifyClient("http://127.0.0.1:1/api/v1");
        try { dead.validateToken("good-token"); fail(); }
        catch (NetlifyClient.NetlifyException e) { assertEquals("network", e.kind); }
    }

    @Test public void hostileSiteIdsAreRefusedBeforeRequest() throws Exception {
        try { client.getSite("good-token", "../user"); fail(); } catch (NetlifyClient.NetlifyException e) { assertEquals("rejected", e.kind); }
        assertTrue(log.isEmpty());
    }
}
