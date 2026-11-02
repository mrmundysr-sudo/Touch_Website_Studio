package com.touchwebsitestudio.app;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Matrix;
import android.media.ExifInterface;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;

/** Downscales picked photos (budget-phone friendly, keeps site ZIPs small) and applies EXIF rotation. */
public class ImageUtil {
    public static final int MAX_EDGE = 1600;

    public static class Result {
        public byte[] data; public String ext; public int width, height;
    }

    public static Result prepare(byte[] src) throws IOException {
        BitmapFactory.Options o = new BitmapFactory.Options();
        o.inJustDecodeBounds = true;
        BitmapFactory.decodeByteArray(src, 0, src.length, o);
        if (o.outWidth <= 0 || o.outHeight <= 0) throw new IOException("That file is not a readable image");
        boolean png = "image/png".equals(o.outMimeType);
        int sample = 1;
        while (Math.max(o.outWidth, o.outHeight) / (sample * 2) >= MAX_EDGE) sample *= 2;
        BitmapFactory.Options d = new BitmapFactory.Options();
        d.inSampleSize = sample;
        Bitmap bmp = BitmapFactory.decodeByteArray(src, 0, src.length, d);
        if (bmp == null) throw new IOException("Could not decode image");
        int rot = 0;
        try {
            int orient = new ExifInterface(new ByteArrayInputStream(src)).getAttributeInt(ExifInterface.TAG_ORIENTATION, 1);
            if (orient == ExifInterface.ORIENTATION_ROTATE_90) rot = 90;
            else if (orient == ExifInterface.ORIENTATION_ROTATE_180) rot = 180;
            else if (orient == ExifInterface.ORIENTATION_ROTATE_270) rot = 270;
        } catch (IOException ignored) { }
        float scale = Math.min(1f, (float) MAX_EDGE / Math.max(bmp.getWidth(), bmp.getHeight()));
        if (rot != 0 || scale < 1f) {
            Matrix m = new Matrix();
            if (rot != 0) m.postRotate(rot);
            if (scale < 1f) m.postScale(scale, scale);
            Bitmap t = Bitmap.createBitmap(bmp, 0, 0, bmp.getWidth(), bmp.getHeight(), m, true);
            if (t != bmp) bmp.recycle();
            bmp = t;
        }
        ByteArrayOutputStream bo = new ByteArrayOutputStream();
        bmp.compress(png ? Bitmap.CompressFormat.PNG : Bitmap.CompressFormat.JPEG, 85, bo);
        Result r = new Result();
        r.data = bo.toByteArray();
        r.ext = png ? "png" : "jpg";
        r.width = bmp.getWidth();
        r.height = bmp.getHeight();
        bmp.recycle();
        return r;
    }
}
