import "package:flutter/foundation.dart" show kIsWeb;
import "package:shared_preferences/shared_preferences.dart";

import "config_stub.dart" if (dart.library.io) "config_io.dart" as plat;

/// Configuration API (URL de base sans slash final).
class AppConfig {
  AppConfig._();

  static String? _override;

  /// À appeler au démarrage après [WidgetsFlutterBinding.ensureInitialized].
  static Future<void> init() async {
    final p = await SharedPreferences.getInstance();
    final raw = p.getString("api_base_url_override");
    if (raw != null) {
      final t = raw.trim();
      _override = t.isEmpty ? null : t;
    }
  }

  static Future<void> setBaseUrlOverride(String? url) async {
    final p = await SharedPreferences.getInstance();
    if (url == null || url.trim().isEmpty) {
      await p.remove("api_base_url_override");
      _override = null;
      return;
    }
    var u = url.trim();
    if (u.endsWith("/")) u = u.substring(0, u.length - 1);
    await p.setString("api_base_url_override", u);
    _override = u;
  }

  /// URL effective : préférence utilisateur > `--dart-define=API_BASE_URL=` > défaut plateforme.
  static String get baseUrl {
    if (_override != null && _override!.isNotEmpty) {
      return _override!;
    }
    const env = String.fromEnvironment("API_BASE_URL", defaultValue: "");
    if (env.isNotEmpty) {
      return env.endsWith("/") ? env.substring(0, env.length - 1) : env;
    }
    if (kIsWeb) {
      return "http://localhost:${plat.kDefaultApiPort}";
    }
    return plat.defaultPlatformBaseUrl();
  }
}
