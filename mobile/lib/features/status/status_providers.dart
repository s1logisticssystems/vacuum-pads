import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:vacuum_traceability_mobile/core/api/api_client_provider.dart';

enum StatusCategory { active, inactive, repair }

class SelectedStatusCategoryNotifier extends Notifier<StatusCategory> {
  @override
  StatusCategory build() => StatusCategory.inactive;

  void select(StatusCategory category) {
    state = category;
  }
}

final selectedStatusCategoryProvider =
    NotifierProvider<SelectedStatusCategoryNotifier, StatusCategory>(
      SelectedStatusCategoryNotifier.new,
    );

final statusSummaryProvider = FutureProvider.autoDispose<Map<String, dynamic>>(
  (ref) => ref.watch(apiClientProvider).getStatusSummary(),
);

final activeVacuumsProvider = FutureProvider.autoDispose<List<dynamic>>(
  (ref) => ref.watch(apiClientProvider).getActiveVacuums(),
);

final inactiveVacuumsProvider = FutureProvider.autoDispose<List<dynamic>>(
  (ref) => ref.watch(apiClientProvider).getInactiveVacuums(),
);

final repairVacuumsProvider = FutureProvider.autoDispose<List<dynamic>>(
  (ref) => ref.watch(apiClientProvider).getRepairVacuums(),
);

final statusItemsProvider = Provider.autoDispose<AsyncValue<List<dynamic>>>(
  (ref) => switch (ref.watch(selectedStatusCategoryProvider)) {
    StatusCategory.active => ref.watch(activeVacuumsProvider),
    StatusCategory.inactive => ref.watch(inactiveVacuumsProvider),
    StatusCategory.repair => ref.watch(repairVacuumsProvider),
  },
);
