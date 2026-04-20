import "dart:ui" show ImageFilter;

import "package:flutter/material.dart";
import "package:shared_preferences/shared_preferences.dart";
import "core/config.dart";
import "models/preorder_models.dart";
import "services/api_service.dart";

/// Thème persistant (clair / sombre / système).
final ValueNotifier<ThemeMode> axiaThemeMode = ValueNotifier(ThemeMode.system);

const Color _kSeed = Color(0xFF4F46E5);

ThemeData _buildLightTheme() {
  final base = ThemeData(
    useMaterial3: true,
    colorScheme: ColorScheme.fromSeed(
      seedColor: _kSeed,
      brightness: Brightness.light,
    ),
  );
  return base.copyWith(
    scaffoldBackgroundColor: const Color(0xFFF8FAFC),
    appBarTheme: const AppBarTheme(
      backgroundColor: Colors.transparent,
      foregroundColor: Color(0xFF0F172A),
      elevation: 0,
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: Colors.white,
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: const BorderSide(color: Color(0xFFE2E8F0)),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: const BorderSide(color: Color(0xFFE2E8F0)),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: const BorderSide(color: Color(0xFF6366F1), width: 1.4),
      ),
    ),
  );
}

ThemeData _buildDarkTheme() {
  final base = ThemeData(
    useMaterial3: true,
    colorScheme: ColorScheme.fromSeed(
      seedColor: _kSeed,
      brightness: Brightness.dark,
    ),
  );
  return base.copyWith(
    scaffoldBackgroundColor: const Color(0xFF0F172A),
    appBarTheme: const AppBarTheme(
      backgroundColor: Colors.transparent,
      foregroundColor: Color(0xFFF1F5F9),
      elevation: 0,
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: const Color(0xFF1E293B),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: const BorderSide(color: Color(0xFF334155)),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: const BorderSide(color: Color(0xFF334155)),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: const BorderSide(color: Color(0xFF818CF8), width: 1.4),
      ),
    ),
  );
}

Future<void> _persistThemeMode(ThemeMode mode) async {
  final p = await SharedPreferences.getInstance();
  await p.setString("theme_mode", mode.name);
}

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await AppConfig.init();
  final p = await SharedPreferences.getInstance();
  switch (p.getString("theme_mode")) {
    case "light":
      axiaThemeMode.value = ThemeMode.light;
      break;
    case "dark":
      axiaThemeMode.value = ThemeMode.dark;
      break;
    default:
      axiaThemeMode.value = ThemeMode.system;
  }
  runApp(const AxiaFlexFlutterApp());
}

class AxiaFlexFlutterApp extends StatelessWidget {
  const AxiaFlexFlutterApp({super.key});

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<ThemeMode>(
      valueListenable: axiaThemeMode,
      builder: (context, mode, _) {
        return MaterialApp(
          debugShowCheckedModeBanner: false,
          title: "AxiaFlex Mobile",
          theme: _buildLightTheme(),
          darkTheme: _buildDarkTheme(),
          themeMode: mode,
          home: const SplashScreen(),
        );
      },
    );
  }
}

class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key});

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _goNext());
  }

  Future<void> _goNext() async {
    await Future<void>.delayed(const Duration(milliseconds: 1700));
    if (!mounted) return;
    Navigator.of(context).pushReplacement(
      MaterialPageRoute<void>(builder: (_) => const AuthPage()),
    );
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Scaffold(
      body: DecoratedBox(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            colors: isDark
                ? [const Color(0xFF312E81), cs.surface]
                : [const Color(0xFFE0E7FF), const Color(0xFFF8FAFC)],
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
          ),
        ),
        child: SafeArea(
          child: Center(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(Icons.storefront_rounded, size: 88, color: cs.primary),
                const SizedBox(height: 20),
                Text(
                  "AxiaFlex",
                  style: TextStyle(
                    fontSize: 36,
                    fontWeight: FontWeight.w900,
                    color: cs.onSurface,
                    letterSpacing: -0.5,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  "Précommande client",
                  style: TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w600,
                    color: cs.onSurfaceVariant,
                  ),
                ),
                const SizedBox(height: 48),
                SizedBox(
                  width: 36,
                  height: 36,
                  child: CircularProgressIndicator(
                    strokeWidth: 3,
                    color: cs.primary,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class AuthPage extends StatefulWidget {
  const AuthPage({super.key});

  @override
  State<AuthPage> createState() => _AuthPageState();
}

class _AuthPageState extends State<AuthPage> with SingleTickerProviderStateMixin {
  final _api = ApiService();
  final _name = TextEditingController();
  final _phone = TextEditingController();
  final _email = TextEditingController();
  final _password = TextEditingController();
  late final TextEditingController _serverUrl;
  late TabController _tabController;
  String _message = "";
  bool _loading = false;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this)
      ..addListener(() {
        if (_tabController.indexIsChanging) return;
        setState(() {});
      });
    _serverUrl = TextEditingController(text: AppConfig.baseUrl);
  }

  @override
  void dispose() {
    _tabController.dispose();
    _serverUrl.dispose();
    _name.dispose();
    _phone.dispose();
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _saveServerUrl() async {
    await AppConfig.setBaseUrlOverride(_serverUrl.text.trim());
    if (!mounted) return;
    setState(() {
      _message =
          "URL API enregistrée : ${AppConfig.baseUrl}";
    });
  }

  Future<void> _signup() async {
    setState(() {
      _loading = true;
      _message = "";
    });
    try {
      await _api.signup(
        fullName: _name.text.trim(),
        email: _email.text.trim(),
        password: _password.text.trim(),
        phone: _phone.text.trim().isEmpty ? null : _phone.text.trim(),
      );
      setState(() => _message = "Compte créé. Connecte-toi.");
      _tabController.animateTo(0);
    } catch (e) {
      setState(() => _message = "$e");
    } finally {
      setState(() => _loading = false);
    }
  }

  Future<void> _signin() async {
    setState(() {
      _loading = true;
      _message = "";
    });
    try {
      final user = await _api.signin(
        email: _email.text.trim(),
        password: _password.text.trim(),
      );
      if (!mounted) return;
      Navigator.of(context).pushReplacement(
        MaterialPageRoute<void>(builder: (_) => HomePage(user: user)),
      );
    } catch (e) {
      setState(() => _message = "$e");
    } finally {
      setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final topGradient = isDark
        ? [const Color(0xFF1E1B4B), const Color(0xFF0F172A)]
        : [const Color(0xFFEEF2FF), const Color(0xFFF8FAFC)];

    return Scaffold(
      body: Stack(
        children: [
          DecoratedBox(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                colors: topGradient,
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              ),
            ),
            child: Stack(
              children: [
                Positioned(
                  top: -80,
                  right: -60,
                  child: _GlowBlob(
                    color: cs.primary.withValues(alpha: isDark ? 0.35 : 0.45),
                    size: 220,
                  ),
                ),
                Positioned(
                  bottom: 120,
                  left: -40,
                  child: _GlowBlob(
                    color: const Color(0xFF06B6D4).withValues(alpha: 0.22),
                    size: 180,
                  ),
                ),
              ],
            ),
          ),
          SafeArea(
            child: Center(
              child: SingleChildScrollView(
                padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 420),
                  child: Column(
                    children: [
                      const SizedBox(height: 8),
                      _BrandHeader(cs: cs),
                      const SizedBox(height: 28),
                      ClipRRect(
                        borderRadius: BorderRadius.circular(28),
                        child: BackdropFilter(
                          filter: ImageFilter.blur(sigmaX: 18, sigmaY: 18),
                          child: Container(
                            width: double.infinity,
                            decoration: BoxDecoration(
                              borderRadius: BorderRadius.circular(28),
                              border: Border.all(
                                color: cs.outlineVariant.withValues(alpha: 0.5),
                              ),
                              color: cs.surface.withValues(alpha: isDark ? 0.55 : 0.72),
                              boxShadow: [
                                BoxShadow(
                                  color: cs.shadow.withValues(alpha: 0.12),
                                  blurRadius: 40,
                                  offset: const Offset(0, 20),
                                ),
                              ],
                            ),
                            child: Padding(
                              padding: const EdgeInsets.fromLTRB(20, 20, 20, 18),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.stretch,
                                children: [
                                  Container(
                                    decoration: BoxDecoration(
                                      color: cs.surfaceContainerHighest
                                          .withValues(alpha: 0.65),
                                      borderRadius: BorderRadius.circular(16),
                                    ),
                                    padding: const EdgeInsets.all(4),
                                    child: TabBar(
                                      controller: _tabController,
                                      dividerColor: Colors.transparent,
                                      indicatorSize: TabBarIndicatorSize.tab,
                                      indicator: BoxDecoration(
                                        borderRadius: BorderRadius.circular(12),
                                        color: cs.primary,
                                      ),
                                      labelColor: cs.onPrimary,
                                      unselectedLabelColor: cs.onSurfaceVariant,
                                      labelStyle: const TextStyle(
                                        fontWeight: FontWeight.w800,
                                        fontSize: 14,
                                      ),
                                      unselectedLabelStyle: const TextStyle(
                                        fontWeight: FontWeight.w700,
                                        fontSize: 14,
                                      ),
                                      tabs: const [
                                        Tab(text: "Connexion"),
                                        Tab(text: "Inscription"),
                                      ],
                                    ),
                                  ),
                                  const SizedBox(height: 20),
                                  SizedBox(
                                    height: 380,
                                    child: TabBarView(
                                      controller: _tabController,
                                      children: [
                                        SingleChildScrollView(
                                          child: _buildLoginFields(),
                                        ),
                                        SingleChildScrollView(
                                          child: _buildSignupFields(),
                                        ),
                                      ],
                                    ),
                                  ),
                                  const SizedBox(height: 8),
                                  SizedBox(
                                    width: double.infinity,
                                    height: 52,
                                    child: FilledButton(
                                      onPressed: _loading
                                          ? null
                                          : () {
                                              if (_tabController.index == 0) {
                                                _signin();
                                              } else {
                                                _signup();
                                              }
                                            },
                                      style: FilledButton.styleFrom(
                                        elevation: 0,
                                        backgroundColor: cs.primary,
                                        foregroundColor: cs.onPrimary,
                                        shape: RoundedRectangleBorder(
                                          borderRadius: BorderRadius.circular(16),
                                        ),
                                      ),
                                      child: _loading
                                          ? SizedBox(
                                              height: 22,
                                              width: 22,
                                              child: CircularProgressIndicator(
                                                strokeWidth: 2.2,
                                                color: cs.onPrimary,
                                              ),
                                            )
                                          : Text(
                                              _tabController.index == 0
                                                  ? "Se connecter"
                                                  : "Créer mon compte",
                                              style: const TextStyle(
                                                fontWeight: FontWeight.w800,
                                                fontSize: 16,
                                              ),
                                            ),
                                    ),
                                  ),
                                  if (_message.isNotEmpty) ...[
                                    const SizedBox(height: 14),
                                    _AuthMessageBanner(
                                      message: _message,
                                      cs: cs,
                                    ),
                                  ],
                                ],
                              ),
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(height: 16),
                      Theme(
                        data: Theme.of(context).copyWith(
                          dividerColor: Colors.transparent,
                        ),
                        child: ExpansionTile(
                          tilePadding: EdgeInsets.zero,
                          childrenPadding: const EdgeInsets.only(top: 4),
                          title: Text(
                            "Serveur API",
                            style: TextStyle(
                              fontWeight: FontWeight.w800,
                              fontSize: 13,
                              color: cs.onSurfaceVariant,
                            ),
                          ),
                          subtitle: Text(
                            AppConfig.baseUrl,
                            style: TextStyle(
                              fontSize: 11,
                              color: cs.onSurfaceVariant.withValues(alpha: 0.85),
                            ),
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                          ),
                          children: [
                            TextField(
                              controller: _serverUrl,
                              decoration: const InputDecoration(
                                labelText: "URL de base (ex. http://10.0.2.2:3003)",
                                prefixIcon: Icon(Icons.dns_rounded),
                              ),
                              keyboardType: TextInputType.url,
                              autocorrect: false,
                            ),
                            const SizedBox(height: 10),
                            OutlinedButton.icon(
                              onPressed: _saveServerUrl,
                              icon: const Icon(Icons.save_outlined, size: 18),
                              label: const Text("Enregistrer l’URL"),
                            ),
                            const SizedBox(height: 6),
                            Text(
                              "Émulateur Android : 10.0.2.2 pointe vers ton PC. "
                              "Téléphone réel : IP locale du PC (même Wi‑Fi). "
                              "Le port doit correspondre au backend (souvent 3003).",
                              style: TextStyle(
                                fontSize: 11,
                                height: 1.4,
                                color: cs.onSurfaceVariant,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildLoginFields() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        TextField(
          controller: _email,
          keyboardType: TextInputType.emailAddress,
          autocorrect: false,
          decoration: const InputDecoration(
            labelText: "E-mail",
            prefixIcon: Icon(Icons.alternate_email_rounded),
          ),
        ),
        const SizedBox(height: 14),
        TextField(
          controller: _password,
          obscureText: true,
          decoration: const InputDecoration(
            labelText: "Mot de passe",
            prefixIcon: Icon(Icons.lock_outline_rounded),
          ),
        ),
      ],
    );
  }

  Widget _buildSignupFields() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        TextField(
          controller: _name,
          textCapitalization: TextCapitalization.words,
          decoration: const InputDecoration(
            labelText: "Nom complet",
            prefixIcon: Icon(Icons.person_outline_rounded),
          ),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _phone,
          keyboardType: TextInputType.phone,
          decoration: const InputDecoration(
            labelText: "Téléphone",
            prefixIcon: Icon(Icons.phone_android_rounded),
          ),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _email,
          keyboardType: TextInputType.emailAddress,
          autocorrect: false,
          decoration: const InputDecoration(
            labelText: "E-mail",
            prefixIcon: Icon(Icons.alternate_email_rounded),
          ),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _password,
          obscureText: true,
          decoration: const InputDecoration(
            labelText: "Mot de passe",
            prefixIcon: Icon(Icons.lock_outline_rounded),
          ),
        ),
      ],
    );
  }
}

class _AuthMessageBanner extends StatelessWidget {
  const _AuthMessageBanner({required this.message, required this.cs});

  final String message;
  final ColorScheme cs;

  bool get _isSuccess {
    final m = message.toLowerCase();
    return m.contains("compte") ||
        m.contains("enregistrée") ||
        m.contains("enregistree");
  }

  @override
  Widget build(BuildContext context) {
    final ok = _isSuccess;
    return Material(
      color: ok
          ? cs.tertiaryContainer.withValues(alpha: 0.55)
          : cs.errorContainer.withValues(alpha: 0.4),
      borderRadius: BorderRadius.circular(14),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(
              ok ? Icons.check_circle_outline_rounded : Icons.error_outline_rounded,
              size: 20,
              color: ok ? cs.tertiary : cs.error,
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                message,
                style: TextStyle(
                  color: ok ? cs.onTertiaryContainer : cs.onErrorContainer,
                  fontWeight: FontWeight.w600,
                  height: 1.35,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _BrandHeader extends StatelessWidget {
  const _BrandHeader({required this.cs});

  final ColorScheme cs;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Container(
          padding: const EdgeInsets.all(18),
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            gradient: LinearGradient(
              colors: [cs.primary, cs.primary.withValues(alpha: 0.75)],
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
            ),
            boxShadow: [
              BoxShadow(
                color: cs.primary.withValues(alpha: 0.45),
                blurRadius: 28,
                offset: const Offset(0, 12),
              ),
            ],
          ),
          child: Icon(Icons.storefront_rounded, size: 40, color: cs.onPrimary),
        ),
        const SizedBox(height: 18),
        Text(
          "AxiaFlex",
          style: TextStyle(
            fontSize: 32,
            fontWeight: FontWeight.w900,
            letterSpacing: -1,
            color: cs.onSurface,
          ),
        ),
        const SizedBox(height: 6),
        Text(
          "Précommande — rapide et claire",
          textAlign: TextAlign.center,
          style: TextStyle(
            fontSize: 15,
            fontWeight: FontWeight.w600,
            color: cs.onSurfaceVariant,
            height: 1.3,
          ),
        ),
      ],
    );
  }
}

class _GlowBlob extends StatelessWidget {
  const _GlowBlob({required this.color, required this.size});

  final Color color;
  final double size;

  @override
  Widget build(BuildContext context) {
    return IgnorePointer(
      child: Container(
        width: size,
        height: size,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          gradient: RadialGradient(
            colors: [color, color.withValues(alpha: 0)],
          ),
        ),
      ),
    );
  }
}

class _StatChip extends StatelessWidget {
  final String label;
  final String value;
  final Color accent;
  const _StatChip({
    required this.label,
    required this.value,
    required this.accent,
  });

  @override
  Widget build(BuildContext context) {
    final onSurf = Theme.of(context).colorScheme.onSurface;
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(14),
        color: accent.withValues(alpha: 0.12),
        border: Border.all(color: accent.withValues(alpha: 0.35)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w700,
              color: muted,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            value,
            style: TextStyle(
              fontSize: 15,
              fontWeight: FontWeight.w900,
              color: onSurf,
            ),
          ),
        ],
      ),
    );
  }
}

class _CardShell extends StatelessWidget {
  final Widget child;
  const _CardShell({required this.child});

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Container(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(18),
        color: cs.surface,
        border: Border.all(color: cs.outlineVariant),
      ),
      child: child,
    );
  }
}

class HomePage extends StatefulWidget {
  final MobileUser user;
  const HomePage({super.key, required this.user});

  @override
  State<HomePage> createState() => _HomePageState();
}

class _HomePageState extends State<HomePage> {
  final _api = ApiService();
  final List<CartLine> _cart = [];
  List<MenuItemDto> _menu = [];
  List<PreorderDto> _orders = [];
  bool _loading = false;
  String _message = "";
  int _tab = 0;

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  Future<void> _loadData() async {
    setState(() => _loading = true);
    try {
      final menu = await _api.getMenu();
      final orders = await _api.getMyPreorders(widget.user.token);
      setState(() {
        _menu = menu;
        _orders = orders;
      });
    } catch (e) {
      setState(() => _message = "$e");
    } finally {
      setState(() => _loading = false);
    }
  }

  void _addToCart(MenuItemDto item) {
    final idx = _cart.indexWhere((c) => c.item.id == item.id);
    setState(() {
      if (idx < 0) {
        _cart.add(CartLine(item: item, quantity: 1));
      } else {
        _cart[idx].quantity += 1;
      }
    });
  }

  double get _total =>
      _cart.fold(0, (sum, line) => sum + line.item.price * line.quantity);

  Future<void> _sendOrder() async {
    if (_cart.isEmpty) return;
    setState(() {
      _loading = true;
      _message = "";
    });
    try {
      await _api.createPreorder(
        token: widget.user.token,
        customerName: widget.user.fullName,
        customerPhone: widget.user.phone,
        cart: _cart,
      );
      _cart.clear();
      await _loadData();
      setState(() => _message = "Precommande envoyee.");
    } catch (e) {
      setState(() => _message = "$e");
    } finally {
      setState(() => _loading = false);
    }
  }

  void _logout() {
    Navigator.of(context).pushAndRemoveUntil(
      MaterialPageRoute<void>(builder: (_) => const AuthPage()),
      (_) => false,
    );
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final body = _loading
        ? const Center(child: CircularProgressIndicator())
        : IndexedStack(
            index: _tab,
            children: [
              _buildMenu(),
              _buildCart(),
              _buildOrders(),
              ProfileTab(
                user: widget.user,
                orders: _orders,
                onRefresh: _loadData,
                onLogout: _logout,
              ),
            ],
          );
    return Scaffold(
      appBar: AppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              "Bonjour ${widget.user.fullName}",
              style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w900,
                color: cs.onSurface,
              ),
            ),
            Text(
              "AxiaFlex Mobile POS",
              style: TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w700,
                color: cs.onSurfaceVariant,
              ),
            ),
          ],
        ),
        actions: [
          IconButton(
            onPressed: _loadData,
            icon: const Icon(Icons.refresh_rounded),
          ),
        ],
      ),
      body: Column(
        children: [
          if (_tab != 3)
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 4, 12, 8),
              child: Row(
                children: [
                  Expanded(
                    child: _StatChip(
                      label: "Articles",
                      value: "${_menu.length}",
                      accent: const Color(0xFF4F46E5),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: _StatChip(
                      label: "Panier",
                      value: "${_cart.length}",
                      accent: const Color(0xFF0EA5E9),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: _StatChip(
                      label: "Commandes",
                      value: "${_orders.length}",
                      accent: const Color(0xFF10B981),
                    ),
                  ),
                ],
              ),
            ),
          Expanded(child: body),
          if (_message.isNotEmpty)
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 0, 12, 8),
              child: _CardShell(
                child: Padding(
                  padding: const EdgeInsets.all(10),
                  child: Text(
                    _message,
                    style: TextStyle(
                      color: cs.onSurface,
                      fontSize: 12,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
              ),
            ),
        ],
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _tab,
        onDestinationSelected: (idx) => setState(() => _tab = idx),
        destinations: const [
          NavigationDestination(
            icon: Icon(Icons.restaurant_menu_rounded),
            label: "Menu",
          ),
          NavigationDestination(
            icon: Icon(Icons.shopping_cart_rounded),
            label: "Panier",
          ),
          NavigationDestination(
            icon: Icon(Icons.receipt_long_rounded),
            label: "Commandes",
          ),
          NavigationDestination(
            icon: Icon(Icons.person_rounded),
            label: "Profil",
          ),
        ],
      ),
    );
  }

  Widget _buildMenu() {
    final cs = Theme.of(context).colorScheme;
    return ListView.builder(
      padding: const EdgeInsets.fromLTRB(12, 4, 12, 12),
      itemCount: _menu.length,
      itemBuilder: (_, i) {
        final m = _menu[i];
        return Padding(
          padding: const EdgeInsets.only(bottom: 8),
          child: _CardShell(
            child: ListTile(
              contentPadding: const EdgeInsets.symmetric(
                horizontal: 14,
                vertical: 2,
              ),
              title: Text(
                m.name,
                style: TextStyle(
                  fontWeight: FontWeight.w900,
                  color: cs.onSurface,
                ),
              ),
              subtitle: Text(
                "${m.price.toStringAsFixed(3)} DT",
                style: TextStyle(
                  color: cs.onSurfaceVariant,
                  fontWeight: FontWeight.w700,
                ),
              ),
              trailing: FilledButton(
                onPressed: () => _addToCart(m),
                style: FilledButton.styleFrom(
                  backgroundColor: const Color(0xFF4F46E5),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                ),
                child: const Text("Ajouter"),
              ),
            ),
          ),
        );
      },
    );
  }

  Widget _buildCart() {
    final cs = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 4, 12, 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Expanded(
            child: _CardShell(
              child: ListView(
                padding: const EdgeInsets.all(8),
                children: _cart
                    .map(
                      (c) => ListTile(
                        title: Text(
                          c.item.name,
                          style: TextStyle(
                            fontWeight: FontWeight.w800,
                            color: cs.onSurface,
                          ),
                        ),
                        subtitle: Text(
                          "x${c.quantity}",
                          style: TextStyle(
                            color: cs.onSurfaceVariant,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        trailing: Text(
                          "${(c.item.price * c.quantity).toStringAsFixed(3)} DT",
                          style: TextStyle(
                            color: cs.onSurface,
                            fontWeight: FontWeight.w900,
                          ),
                        ),
                      ),
                    )
                    .toList(),
              ),
            ),
          ),
          const SizedBox(height: 8),
          _CardShell(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(
                    "Total panier",
                    style: TextStyle(
                      fontWeight: FontWeight.w900,
                      color: cs.onSurfaceVariant,
                    ),
                  ),
                  Text(
                    "${_total.toStringAsFixed(3)} DT",
                    style: TextStyle(
                      fontWeight: FontWeight.w900,
                      color: cs.onSurface,
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 8),
          FilledButton(
            onPressed: _cart.isEmpty ? null : _sendOrder,
            style: FilledButton.styleFrom(
              backgroundColor: const Color(0xFF10B981),
              padding: const EdgeInsets.symmetric(vertical: 14),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(14),
              ),
            ),
            child: const Text("Valider la precommande"),
          ),
        ],
      ),
    );
  }

  Widget _buildOrders() {
    final cs = Theme.of(context).colorScheme;
    return ListView(
      padding: const EdgeInsets.fromLTRB(12, 4, 12, 12),
      children: _orders
          .map(
            (o) => Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: _CardShell(
                child: ListTile(
                  contentPadding: const EdgeInsets.symmetric(
                    horizontal: 14,
                    vertical: 2,
                  ),
                  title: Text(
                    o.code,
                    style: TextStyle(
                      fontWeight: FontWeight.w900,
                      color: cs.onSurface,
                    ),
                  ),
                  subtitle: Text(
                    o.status,
                    style: TextStyle(
                      color: cs.onSurfaceVariant,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  trailing: Text(
                    "${o.total.toStringAsFixed(3)} DT",
                    style: const TextStyle(
                      fontWeight: FontWeight.w900,
                      color: Color(0xFF4F46E5),
                    ),
                  ),
                ),
              ),
            ),
          )
          .toList(),
    );
  }
}

class ProfileTab extends StatefulWidget {
  final MobileUser user;
  final List<PreorderDto> orders;
  final Future<void> Function() onRefresh;
  final VoidCallback onLogout;

  const ProfileTab({
    super.key,
    required this.user,
    required this.orders,
    required this.onRefresh,
    required this.onLogout,
  });

  @override
  State<ProfileTab> createState() => _ProfileTabState();
}

class _ProfileTabState extends State<ProfileTab> {
  final _codeSearch = TextEditingController();
  String? _statusFilter;

  @override
  void dispose() {
    _codeSearch.dispose();
    super.dispose();
  }

  Set<String> get _statuses {
    final s = widget.orders.map((e) => e.status).toSet()..remove("");
    return s;
  }

  List<PreorderDto> get _filtered {
    final q = _codeSearch.text.trim().toLowerCase();
    return widget.orders.where((o) {
      if (_statusFilter != null && o.status != _statusFilter) return false;
      if (q.isEmpty) return true;
      return o.code.toLowerCase().contains(q);
    }).toList()
      ..sort((a, b) => b.code.compareTo(a.code));
  }

  Future<void> _pullRefresh() => widget.onRefresh();

  Future<void> _setTheme(ThemeMode mode) async {
    axiaThemeMode.value = mode;
    await _persistThemeMode(mode);
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return RefreshIndicator(
      onRefresh: _pullRefresh,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(12, 4, 12, 24),
        physics: const AlwaysScrollableScrollPhysics(),
        children: [
          _CardShell(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      CircleAvatar(
                        radius: 28,
                        backgroundColor: cs.primaryContainer,
                        child: Text(
                          widget.user.fullName.isNotEmpty
                              ? widget.user.fullName[0].toUpperCase()
                              : "?",
                          style: TextStyle(
                            fontSize: 22,
                            fontWeight: FontWeight.w900,
                            color: cs.onPrimaryContainer,
                          ),
                        ),
                      ),
                      const SizedBox(width: 14),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              widget.user.fullName,
                              style: TextStyle(
                                fontWeight: FontWeight.w900,
                                fontSize: 18,
                                color: cs.onSurface,
                              ),
                            ),
                            const SizedBox(height: 2),
                            Text(
                              widget.user.email,
                              style: TextStyle(
                                color: cs.onSurfaceVariant,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                            if (widget.user.phone != null &&
                                widget.user.phone!.isNotEmpty)
                              Text(
                                widget.user.phone!,
                                style: TextStyle(
                                  color: cs.onSurfaceVariant,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 12),
          Text(
            "Apparence",
            style: TextStyle(
              fontWeight: FontWeight.w900,
              fontSize: 13,
              color: cs.onSurfaceVariant,
            ),
          ),
          const SizedBox(height: 8),
          _CardShell(
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: ValueListenableBuilder<ThemeMode>(
                valueListenable: axiaThemeMode,
                builder: (context, mode, _) {
                  return SegmentedButton<ThemeMode>(
                    segments: const [
                      ButtonSegment<ThemeMode>(
                        value: ThemeMode.light,
                        label: Text("Clair"),
                        icon: Icon(Icons.light_mode_outlined, size: 18),
                      ),
                      ButtonSegment<ThemeMode>(
                        value: ThemeMode.dark,
                        label: Text("Sombre"),
                        icon: Icon(Icons.dark_mode_outlined, size: 18),
                      ),
                      ButtonSegment<ThemeMode>(
                        value: ThemeMode.system,
                        label: Text("Auto"),
                        icon: Icon(Icons.brightness_auto_outlined, size: 18),
                      ),
                    ],
                    selected: {mode},
                    onSelectionChanged: (s) {
                      if (s.isEmpty) return;
                      _setTheme(s.first);
                    },
                  );
                },
              ),
            ),
          ),
          const SizedBox(height: 16),
          Text(
            "Historique des précommandes",
            style: TextStyle(
              fontWeight: FontWeight.w900,
              fontSize: 13,
              color: cs.onSurfaceVariant,
            ),
          ),
          const SizedBox(height: 8),
          _CardShell(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  TextField(
                    controller: _codeSearch,
                    onChanged: (_) => setState(() {}),
                    decoration: const InputDecoration(
                      labelText: "Rechercher par code",
                      prefixIcon: Icon(Icons.search_rounded),
                      isDense: true,
                    ),
                  ),
                  const SizedBox(height: 10),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      FilterChip(
                        label: const Text("Tous les statuts"),
                        selected: _statusFilter == null,
                        onSelected: (_) => setState(() => _statusFilter = null),
                      ),
                      ..._statuses.map(
                        (st) => FilterChip(
                          label: Text(st),
                          selected: _statusFilter == st,
                          onSelected: (_) =>
                              setState(() => _statusFilter = st),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 8),
          if (_filtered.isEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 32),
              child: Center(
                child: Text(
                  "Aucune précommande ne correspond aux filtres.",
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    color: cs.onSurfaceVariant,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            )
          else
            ..._filtered.map(
              (o) => Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: _CardShell(
                  child: ListTile(
                    contentPadding: const EdgeInsets.symmetric(
                      horizontal: 14,
                      vertical: 2,
                    ),
                    title: Text(
                      o.code,
                      style: TextStyle(
                        fontWeight: FontWeight.w900,
                        color: cs.onSurface,
                      ),
                    ),
                    subtitle: Text(
                      o.status,
                      style: TextStyle(
                        color: cs.onSurfaceVariant,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    trailing: Text(
                      "${o.total.toStringAsFixed(3)} DT",
                      style: const TextStyle(
                        fontWeight: FontWeight.w900,
                        color: Color(0xFF4F46E5),
                      ),
                    ),
                  ),
                ),
              ),
            ),
          const SizedBox(height: 16),
          FilledButton.tonal(
            onPressed: widget.onLogout,
            style: FilledButton.styleFrom(
              padding: const EdgeInsets.symmetric(vertical: 14),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(14),
              ),
            ),
            child: const Text("Se déconnecter"),
          ),
        ],
      ),
    );
  }
}
