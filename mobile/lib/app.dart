import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:vacuum_traceability_mobile/core/auth/auth_provider.dart';
import 'package:vacuum_traceability_mobile/core/auth/auth_session.dart';
import 'package:vacuum_traceability_mobile/core/routing/app_router.dart';
import 'package:vacuum_traceability_mobile/core/settings/settings_provider.dart';
import 'package:vacuum_traceability_mobile/features/auth/login_screen.dart';

class VacuumTraceabilityApp extends ConsumerWidget {
  const VacuumTraceabilityApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final settings = ref.watch(appSettingsProvider);
    final auth = ref.watch(authControllerProvider);
    final router = ref.watch(appRouterProvider);

    return settings.when(
      data: (_) => auth.when(
        // Every API call needs a token, so the app opens on the sign-in screen
        // until one is stored.
        data: (AuthSession? session) => session == null
            ? const _AuthenticationApp()
            : _ConfiguredApp(router: router),
        loading: () => const _SettingsLoadingApp(),
        error: (Object error, StackTrace stackTrace) => _SettingsErrorApp(
          error: error,
          onRetry: () => ref.invalidate(authControllerProvider),
        ),
      ),
      loading: () => const _SettingsLoadingApp(),
      error: (Object error, StackTrace stackTrace) => _SettingsErrorApp(
        error: error,
        onRetry: () => ref.invalidate(appSettingsProvider),
      ),
    );
  }
}

class _AuthenticationApp extends StatelessWidget {
  const _AuthenticationApp();

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Vacuum Traceability',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        useMaterial3: true,
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(0xFF0F766E),
          brightness: Brightness.light,
        ),
        scaffoldBackgroundColor: const Color(0xFFF6F7F2),
      ),
      home: const LoginScreen(),
    );
  }
}

class _ConfiguredApp extends StatelessWidget {
  const _ConfiguredApp({required this.router});

  final RouterConfig<Object> router;

  @override
  Widget build(BuildContext context) {
    return MaterialApp.router(
      title: 'Vacuum Traceability',
      debugShowCheckedModeBanner: false,
      routerConfig: router,
      theme: ThemeData(
        useMaterial3: true,
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(0xFF0F766E),
          brightness: Brightness.light,
        ),
        scaffoldBackgroundColor: const Color(0xFFF6F7F2),
        appBarTheme: const AppBarTheme(
          centerTitle: false,
          backgroundColor: Colors.transparent,
          foregroundColor: Color(0xFF0F172A),
          elevation: 0,
        ),
        cardTheme: CardThemeData(
          elevation: 0,
          color: Colors.white,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(24),
          ),
        ),
      ),
    );
  }
}

class _SettingsLoadingApp extends StatelessWidget {
  const _SettingsLoadingApp();

  @override
  Widget build(BuildContext context) {
    return const MaterialApp(
      debugShowCheckedModeBanner: false,
      home: Scaffold(
        body: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: <Widget>[
              CircularProgressIndicator(),
              SizedBox(height: 16),
              Text('Loading app settings...'),
            ],
          ),
        ),
      ),
    );
  }
}

class _SettingsErrorApp extends StatelessWidget {
  const _SettingsErrorApp({required this.error, required this.onRetry});

  final Object error;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      home: Scaffold(
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: <Widget>[
                const Icon(Icons.error_outline, size: 40),
                const SizedBox(height: 16),
                const Text('Could not load app settings.'),
                const SizedBox(height: 8),
                Text(error.toString(), textAlign: TextAlign.center),
                const SizedBox(height: 16),
                FilledButton.icon(
                  onPressed: onRetry,
                  icon: const Icon(Icons.refresh),
                  label: const Text('Retry'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
