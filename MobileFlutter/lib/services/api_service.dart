import "dart:convert";

import "package:http/http.dart" as http;

import "../core/config.dart";
import "../models/preorder_models.dart";

class ApiService {
  final http.Client _client = http.Client();

  Uri _uri(String path) => Uri.parse("${AppConfig.baseUrl}$path");

  static String _friendlyNetworkError(Object e) {
    final raw = e.toString();
    final lower = raw.toLowerCase();
    if (lower.contains("failed to fetch") ||
        lower.contains("socketexception") ||
        lower.contains("connection refused") ||
        lower.contains("connection reset") ||
        lower.contains("clientexception") ||
        lower.contains("network is unreachable")) {
      return "Connexion impossible au serveur (${AppConfig.baseUrl}). "
          "Vérifiez que le backend tourne, le port (souvent 3003), "
          "et sur Android que le trafic HTTP est autorisé. "
          "Téléphone physique : utilisez l’IP locale du PC, pas 10.0.2.2.";
    }
    return raw;
  }

  Future<MobileUser> signin({
    required String email,
    required String password,
  }) async {
    final http.Response res;
    try {
      res = await _client
          .post(
            _uri("/pos/preorders/auth/signin"),
            headers: {"Content-Type": "application/json"},
            body: jsonEncode({"email": email, "password": password}),
          )
          .timeout(const Duration(seconds: 25));
    } catch (e) {
      throw Exception(_friendlyNetworkError(e));
    }
    final data = jsonDecode(res.body) as Map<String, dynamic>;
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw Exception("${data["error"] ?? "Connexion impossible"}");
    }
    return MobileUser.fromJson(data);
  }

  Future<void> signup({
    required String fullName,
    required String email,
    required String password,
    String? phone,
  }) async {
    final http.Response res;
    try {
      res = await _client
          .post(
            _uri("/pos/preorders/auth/signup"),
            headers: {"Content-Type": "application/json"},
            body: jsonEncode({
              "fullName": fullName,
              "email": email,
              "password": password,
              "phone": phone,
            }),
          )
          .timeout(const Duration(seconds: 25));
    } catch (e) {
      throw Exception(_friendlyNetworkError(e));
    }
    final data = jsonDecode(res.body) as Map<String, dynamic>;
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw Exception("${data["error"] ?? "Inscription impossible"}");
    }
  }

  Future<List<MenuItemDto>> getMenu() async {
    final res = await _client
        .get(_uri("/pos/preorders/menu"))
        .timeout(const Duration(seconds: 25));
    final data = jsonDecode(res.body);
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw Exception("Chargement menu impossible");
    }
    return (data as List<dynamic>)
        .map((e) => MenuItemDto.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<List<PreorderDto>> getMyPreorders(String token) async {
    final res = await _client
        .get(
          _uri("/pos/preorders"),
          headers: {"Authorization": "Bearer $token"},
        )
        .timeout(const Duration(seconds: 25));
    final data = jsonDecode(res.body);
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw Exception("${data["error"] ?? "Chargement precommandes impossible"}");
    }
    return (data as List<dynamic>)
        .map((e) => PreorderDto.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<void> createPreorder({
    required String token,
    required String customerName,
    String? customerPhone,
    required List<CartLine> cart,
    String mode = "DELIVERY",
  }) async {
    final payload = {
      "customerName": customerName,
      "customerPhone": customerPhone,
      "mode": mode,
      "items": cart
          .map((c) => {"productId": c.item.id, "quantity": c.quantity})
          .toList(),
    };
    final res = await _client
        .post(
          _uri("/pos/preorders"),
          headers: {
            "Content-Type": "application/json",
            "Authorization": "Bearer $token",
          },
          body: jsonEncode(payload),
        )
        .timeout(const Duration(seconds: 30));
    if (res.statusCode < 200 || res.statusCode >= 300) {
      final data = jsonDecode(res.body);
      throw Exception("${data["error"] ?? "Creation precommande impossible"}");
    }
  }
}
