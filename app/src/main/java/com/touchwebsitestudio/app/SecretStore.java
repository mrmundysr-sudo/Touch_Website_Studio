package com.touchwebsitestudio.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import java.nio.charset.StandardCharsets;
import java.security.KeyStore;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/** Stores the user's Netlify token encrypted with a non-exportable Android Keystore key. Never logged, never written to project files. */
public class SecretStore {
    private static final String ALIAS = "tws_netlify_token_key";
    private static final String PREFS = "tws_secrets";
    private static final String KEY = "netlify_token";
    private final SharedPreferences prefs;

    public SecretStore(Context ctx) { prefs = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE); }

    public boolean has() { return prefs.contains(KEY); }

    public void put(String token) throws Exception {
        Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
        c.init(Cipher.ENCRYPT_MODE, key());
        byte[] ct = c.doFinal(token.getBytes(StandardCharsets.UTF_8));
        byte[] iv = c.getIV();
        byte[] all = new byte[iv.length + ct.length];
        System.arraycopy(iv, 0, all, 0, iv.length);
        System.arraycopy(ct, 0, all, iv.length, ct.length);
        prefs.edit().putString(KEY, Base64.encodeToString(all, Base64.NO_WRAP)).apply();
    }

    public String get() throws Exception {
        String s = prefs.getString(KEY, null);
        if (s == null) return null;
        byte[] all = Base64.decode(s, Base64.NO_WRAP);
        Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
        c.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, all, 0, 12));
        return new String(c.doFinal(all, 12, all.length - 12), StandardCharsets.UTF_8);
    }

    public void clear() { prefs.edit().remove(KEY).apply(); }

    private SecretKey key() throws Exception {
        KeyStore ks = KeyStore.getInstance("AndroidKeyStore");
        ks.load(null);
        if (ks.containsAlias(ALIAS)) return (SecretKey) ks.getKey(ALIAS, null);
        KeyGenerator g = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        g.init(new KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256).build());
        return g.generateKey();
    }
}
