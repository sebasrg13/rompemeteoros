package com.rompemeteoros.app;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/**
 * Rompemeteoros para Android.
 *
 * El juego (un único index.html) se sirve desde una dirección fija
 * https://appassets.androidplatform.net/game/index.html para que el progreso guardado
 * (localStorage) nunca se pierda al actualizar.
 *
 * ACTUALIZADOR:
 *  - Al abrir (y cada 10 minutos) lee UPDATE_BASE + "version.json".
 *  - Si hay un JUEGO más nuevo, lo descarga al instante, sin reinstalar nada, y ofrece reiniciar.
 *  - Si hay una APP más nueva (cambios en la carpeta android/), ofrece descargar el APK nuevo.
 *  - Sin internet se juega igual con la última versión descargada (o la que vino en el APK).
 */
public class MainActivity extends Activity {

    private static final String HOST = "appassets.androidplatform.net";
    private static final String GAME_URL = "https://" + HOST + "/game/index.html";
    private static final long CHECK_EVERY_MS = 10 * 60 * 1000L;

    private WebView web;
    private SharedPreferences prefs;
    private final Handler main = new Handler(Looper.getMainLooper());
    private volatile boolean checking = false;
    private boolean apkOffered = false;

    // ---------------------------------------------------------------- ciclo de vida

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        prefs = getSharedPreferences("rompemeteoros", MODE_PRIVATE);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        getWindow().setStatusBarColor(Color.parseColor("#070a1f"));
        getWindow().setNavigationBarColor(Color.parseColor("#070a1f"));

        web = new WebView(this);
        web.setBackgroundColor(Color.parseColor("#070a1f"));
        setContentView(web);
        goFullscreen();

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);          // guardado del juego (localStorage)
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(false);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        s.setTextZoom(100);

        web.addJavascriptInterface(new Bridge(), "RompeApp");
        web.setWebChromeClient(new WebChromeClient());
        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest req) {
                Uri u = req.getUrl();
                if (HOST.equals(u.getHost()) && u.getPath() != null && u.getPath().startsWith("/game/")) {
                    return serveGame(u.getPath().substring("/game/".length()));
                }
                return null; // el resto (tipografías, etc.) va por la red normal
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
                Uri u = req.getUrl();
                if (HOST.equals(u.getHost())) return false;
                // enlaces externos: se abren en el navegador
                try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (Exception ignored) { }
                return true;
            }
        });

        if (savedInstanceState != null) web.restoreState(savedInstanceState);
        else web.loadUrl(GAME_URL);

        checkUpdates(false);
        main.postDelayed(periodic, CHECK_EVERY_MS);
    }

    private final Runnable periodic = new Runnable() {
        @Override public void run() { checkUpdates(false); main.postDelayed(this, CHECK_EVERY_MS); }
    };

    @Override protected void onSaveInstanceState(Bundle out) { super.onSaveInstanceState(out); web.saveState(out); }
    @Override protected void onResume() { super.onResume(); web.onResume(); goFullscreen(); }
    @Override protected void onPause() { web.onPause(); super.onPause(); }
    @Override protected void onDestroy() { main.removeCallbacks(periodic); web.destroy(); super.onDestroy(); }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) goFullscreen();
    }

    @SuppressWarnings("deprecation")
    private void goFullscreen() {
        Window w = getWindow();
        if (Build.VERSION.SDK_INT >= 30) {
            w.setDecorFitsSystemWindows(false);
            WindowInsetsController c = w.getInsetsController();
            if (c != null) {
                c.hide(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
                c.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            }
        } else {
            w.getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                    | View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                    | View.SYSTEM_UI_FLAG_LAYOUT_STABLE | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                    | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
        }
    }

    // Atrás: pausa el juego si está en partida; en el menú pregunta si salir.
    @SuppressWarnings("deprecation")
    @Override
    public void onBackPressed() {
        web.evaluateJavascript("(function(){try{var g=BB.game;if(g.isPlaying()){g.pause();return 'paused'}if(g.state!=='MENU'){g.toMenu();return 'menu'}}catch(e){}return 'exit'})()", r -> {
            if (r != null && r.contains("exit")) {
                new AlertDialog.Builder(this).setTitle("¿Salir de Rompemeteoros?")
                        .setPositiveButton("SALIR", (d, w) -> finish())
                        .setNegativeButton("SEGUIR JUGANDO", null).show();
            }
        });
    }

    // ---------------------------------------------------------------- juego local

    private File gameDir() { File d = new File(getFilesDir(), "game"); if (!d.exists()) d.mkdirs(); return d; }

    private int bundledGameVersion() {
        try (InputStream in = getAssets().open("game/version.txt")) {
            return Integer.parseInt(new String(readAll(in), StandardCharsets.UTF_8).trim());
        } catch (Exception e) { return BuildConfig.BUNDLED_GAME_VERSION; }
    }

    /** Versión del juego que se está usando: la descargada si es más nueva que la del APK. */
    private int currentGameVersion() {
        int dl = prefs.getInt("gameVersion", 0);
        File f = new File(gameDir(), "index.html");
        int bundled = bundledGameVersion();
        return (f.exists() && dl > bundled) ? dl : bundled;
    }

    private WebResourceResponse serveGame(String name) {
        if (name.isEmpty()) name = "index.html";
        try {
            InputStream in;
            File f = new File(gameDir(), name);
            int bundled = bundledGameVersion();
            if (f.exists() && prefs.getInt("gameVersion", 0) > bundled) in = new FileInputStream(f);
            else in = getAssets().open("game/" + name);
            String mime = name.endsWith(".html") ? "text/html" : name.endsWith(".json") ? "application/json" : name.endsWith(".js") ? "text/javascript" : "application/octet-stream";
            WebResourceResponse r = new WebResourceResponse(mime, "utf-8", in);
            java.util.Map<String, String> h = new java.util.HashMap<>();
            h.put("Cache-Control", "no-cache");
            r.setResponseHeaders(h);
            return r;
        } catch (Exception e) {
            return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found", null, null);
        }
    }

    // ---------------------------------------------------------------- actualizador

    private void checkUpdates(final boolean manual) {
        if (checking) return;
        checking = true;
        new Thread(() -> {
            String msg = null;
            try {
                String base = BuildConfig.UPDATE_BASE;
                JSONObject v = new JSONObject(new String(download(base + "version.json?t=" + System.currentTimeMillis()), StandardCharsets.UTF_8));
                int remoteGame = v.optInt("game", 0);
                int remoteApk = v.optInt("apk", 0);
                String notes = v.optString("notes", "");

                // 1) app nueva (cáscara Android): hay que instalar un APK
                if (remoteApk > BuildConfig.VERSION_CODE) {
                    final String apkUrl = resolve(base, v.optString("apkUrl", "rompemeteoros.apk"));
                    final String apkName = v.optString("apkName", "");
                    main.post(() -> offerApk(apkUrl, apkName, notes, manual));
                    msg = null;
                }
                // 2) juego nuevo: se descarga al instante, sin reinstalar
                if (remoteGame > currentGameVersion()) {
                    String gameUrl = resolve(base, v.optString("gameUrl", "game/index.html"));
                    byte[] html = download(gameUrl + (gameUrl.contains("?") ? "&" : "?") + "v=" + remoteGame);
                    String head = new String(html, 0, Math.min(html.length, 4000), StandardCharsets.UTF_8);
                    if (html.length < 20000 || !head.toLowerCase().contains("<html")) throw new Exception("archivo del juego inválido");
                    File tmp = new File(gameDir(), "index.html.tmp");
                    try (OutputStream o = new FileOutputStream(tmp)) { o.write(html); }
                    File dst = new File(gameDir(), "index.html");
                    if (dst.exists()) dst.delete();
                    if (!tmp.renameTo(dst)) throw new Exception("no se pudo guardar la actualización");
                    prefs.edit().putInt("gameVersion", remoteGame).apply();
                    final int ver = remoteGame;
                    main.post(() -> offerRestart(ver, notes));
                } else if (manual && remoteApk <= BuildConfig.VERSION_CODE) {
                    msg = "Ya tenés la última versión (juego v" + currentGameVersion() + ").";
                }
            } catch (Exception e) {
                if (manual) msg = "No se pudo buscar actualizaciones. Revisá tu conexión.";
            } finally {
                checking = false;
            }
            if (msg != null) { final String m = msg; main.post(() -> Toast.makeText(this, m, Toast.LENGTH_LONG).show()); }
        }).start();
    }

    private void offerRestart(int ver, String notes) {
        if (isFinishing()) return;
        new AlertDialog.Builder(this)
                .setTitle("¡Actualización lista! (v" + ver + ")")
                .setMessage((notes.isEmpty() ? "Hay mejoras nuevas en el juego." : notes) + "\n\nTu progreso se mantiene.")
                .setPositiveButton("REINICIAR AHORA", (d, w) -> reloadGame())
                .setNegativeButton("DESPUÉS", (d, w) -> Toast.makeText(this, "Se aplica la próxima vez que abras el juego.", Toast.LENGTH_SHORT).show())
                .show();
    }

    private void reloadGame() {
        // guarda antes de recargar para no perder nada de la partida actual
        web.evaluateJavascript("try{BB.game.save.save(true)}catch(e){}", r -> web.loadUrl(GAME_URL + "?v=" + System.currentTimeMillis()));
    }

    private void offerApk(String apkUrl, String name, String notes, boolean manual) {
        if (isFinishing() || (apkOffered && !manual)) return;
        apkOffered = true;
        new AlertDialog.Builder(this)
                .setTitle("Nueva versión de la app" + (name.isEmpty() ? "" : " (" + name + ")"))
                .setMessage((notes.isEmpty() ? "" : notes + "\n\n") + "Se descarga el instalador. Abrilo y tocá INSTALAR (tu progreso se mantiene).")
                .setPositiveButton("DESCARGAR", (d, w) -> {
                    try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(apkUrl))); }
                    catch (Exception e) { Toast.makeText(this, "No se pudo abrir la descarga.", Toast.LENGTH_LONG).show(); }
                })
                .setNegativeButton("DESPUÉS", null)
                .show();
    }

    private static String resolve(String base, String path) {
        if (path.startsWith("http://") || path.startsWith("https://")) return path;
        return base + (path.startsWith("/") ? path.substring(1) : path);
    }

    private static byte[] download(String url) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        c.setConnectTimeout(10000);
        c.setReadTimeout(30000);
        c.setUseCaches(false);
        c.setRequestProperty("Cache-Control", "no-cache");
        try {
            int code = c.getResponseCode();
            if (code != 200) throw new Exception("HTTP " + code);
            try (InputStream in = c.getInputStream()) { return readAll(in); }
        } finally { c.disconnect(); }
    }

    private static byte[] readAll(InputStream in) throws Exception {
        ByteArrayOutputStream o = new ByteArrayOutputStream();
        byte[] b = new byte[16384];
        int n;
        while ((n = in.read(b)) > 0) o.write(b, 0, n);
        return o.toByteArray();
    }

    // ---------------------------------------------------------------- puente con el juego (window.RompeApp)

    private class Bridge {
        @JavascriptInterface
        public String version() {
            return "App " + BuildConfig.VERSION_NAME + " · Juego v" + currentGameVersion();
        }

        @JavascriptInterface
        public void checkUpdates() {
            main.post(() -> {
                Toast.makeText(MainActivity.this, "Buscando actualizaciones…", Toast.LENGTH_SHORT).show();
                apkOffered = false;
                MainActivity.this.checkUpdates(true);
            });
        }
    }
}
