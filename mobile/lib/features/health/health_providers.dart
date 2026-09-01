import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:vacuum_traceability_mobile/core/api/api_client_provider.dart';

final apiHealthProvider = FutureProvider.autoDispose<Map<String, dynamic>>((
  ref,
) {
  return ref.watch(apiClientProvider).getHealth();
});

final databaseHealthProvider = FutureProvider.autoDispose<Map<String, dynamic>>(
  (ref) {
    return ref.watch(apiClientProvider).getDatabaseHealth();
  },
);
