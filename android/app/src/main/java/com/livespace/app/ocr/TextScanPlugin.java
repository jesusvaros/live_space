package com.livespace.app.ocr;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Rect;
import android.util.Base64;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.mlkit.vision.common.InputImage;
import com.google.mlkit.vision.text.Text;
import com.google.mlkit.vision.text.TextRecognition;
import com.google.mlkit.vision.text.TextRecognizer;
import com.google.mlkit.vision.text.latin.TextRecognizerOptions;

/**
 * On-device text recognition (ML Kit, Latin script) for the Spotify Wrapped
 * import (src/features/wrapped/recognizeText.ts).
 *
 * recognize({base64}) takes a JPEG/PNG without the data: prefix and returns
 * {blocks: [{top, left, right, lines: [string]}]}. The model is the unbundled one in
 * Google Play Services: the APK grows a few hundred KB, and the manifest asks
 * Play to fetch the model at install time (com.google.mlkit.vision.DEPENDENCIES).
 * Nothing leaves the device.
 */
@CapacitorPlugin(name = "TextScan")
public class TextScanPlugin extends Plugin {

    @PluginMethod
    public void recognize(PluginCall call) {
        String base64 = call.getString("base64");
        if (base64 == null || base64.isEmpty()) {
            call.reject("base64 required");
            return;
        }

        Bitmap bitmap;
        try {
            byte[] bytes = Base64.decode(base64, Base64.DEFAULT);
            bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
        } catch (IllegalArgumentException e) {
            call.reject("Invalid image", e);
            return;
        }
        if (bitmap == null) {
            call.reject("Invalid image");
            return;
        }

        final TextRecognizer recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS);
        recognizer
            .process(InputImage.fromBitmap(bitmap, 0))
            .addOnSuccessListener(text -> {
                recognizer.close();
                call.resolve(toResult(text));
            })
            .addOnFailureListener(e -> {
                recognizer.close();
                // Usually the model is still downloading on a fresh install.
                call.reject("Text recognition failed", "UNAVAILABLE", e);
            });
    }

    private JSObject toResult(Text text) {
        JSArray blocks = new JSArray();
        for (Text.TextBlock block : text.getTextBlocks()) {
            JSObject item = new JSObject();
            Rect box = block.getBoundingBox();
            item.put("top", box != null ? box.top : 0);
            item.put("left", box != null ? box.left : 0);
            item.put("right", box != null ? box.right : 0);
            JSArray lines = new JSArray();
            for (Text.Line line : block.getLines()) {
                lines.put(line.getText());
            }
            item.put("lines", lines);
            blocks.put(item);
        }
        JSObject result = new JSObject();
        result.put("blocks", blocks);
        return result;
    }
}
