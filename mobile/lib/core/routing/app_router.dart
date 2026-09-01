import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:vacuum_traceability_mobile/features/charge/charge_screen.dart';
import 'package:vacuum_traceability_mobile/features/decharge/decharge_screen.dart';
import 'package:vacuum_traceability_mobile/features/faults/fault_declaration_screen.dart';
import 'package:vacuum_traceability_mobile/features/faults/fault_restoration_screen.dart';
import 'package:vacuum_traceability_mobile/features/health/backend_health_screen.dart';
import 'package:vacuum_traceability_mobile/features/home/home_screen.dart';
import 'package:vacuum_traceability_mobile/features/scanner/qr_scanner_screen.dart';
import 'package:vacuum_traceability_mobile/features/settings/settings_screen.dart';
import 'package:vacuum_traceability_mobile/features/status/status_screen.dart';

final appRouterProvider = Provider<GoRouter>((ref) {
  return GoRouter(
    routes: <RouteBase>[
      GoRoute(path: '/', builder: (context, state) => const HomeScreen()),
      GoRoute(
        path: '/health',
        builder: (context, state) => const BackendHealthScreen(),
      ),
      GoRoute(
        path: '/scanner',
        builder: (context, state) => const QrScannerScreen(),
      ),
      GoRoute(
        path: '/settings',
        builder: (context, state) => const SettingsScreen(),
      ),
      GoRoute(
        path: '/charge',
        builder: (context, state) => const ChargeScreen(),
      ),
      GoRoute(
        path: '/decharge',
        builder: (context, state) => DechargeScreen(
          initialVacuumQr: state.uri.queryParameters['vacuumQr'],
        ),
      ),
      GoRoute(
        path: '/fault-declaration',
        builder: (context, state) => FaultDeclarationScreen(
          initialVacuumQr: state.uri.queryParameters['vacuumQr'],
        ),
      ),
      GoRoute(
        path: '/fault-restoration',
        builder: (context, state) => const FaultRestorationScreen(),
      ),
      GoRoute(
        path: '/status',
        builder: (context, state) => const StatusScreen(),
      ),
    ],
  );
});
