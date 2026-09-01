import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:vacuum_traceability_mobile/core/api/api_exceptions.dart';
import 'package:vacuum_traceability_mobile/core/widgets/app_screen_scaffold.dart';
import 'package:vacuum_traceability_mobile/features/home/home_screen.dart';
import 'package:vacuum_traceability_mobile/features/status/status_providers.dart';

class StatusScreen extends ConsumerWidget {
  const StatusScreen({super.key});

  static const String activeLabel =
      '\u0395\u03BD\u03B5\u03C1\u03B3\u03AC Vacuum';
  static const String inactiveLabel =
      '\u039C\u03B7 \u03B5\u03BD\u03B5\u03C1\u03B3\u03AC Vacuum';
  static const String repairLabel =
      'Vacuum \u03C0\u03C1\u03BF\u03C2 \u03B5\u03C0\u03B9\u03C3\u03BA\u03B5\u03C5\u03AE';
  static const String categoriesLabel =
      '\u039A\u03B1\u03C4\u03B7\u03B3\u03BF\u03C1\u03AF\u03B5\u03C2';

  Future<void> _refresh(WidgetRef ref, StatusCategory category) async {
    ref.invalidate(statusSummaryProvider);

    final Future<List<dynamic>> selectedListFuture = switch (category) {
      StatusCategory.active => () {
        ref.invalidate(activeVacuumsProvider);
        return ref.read(activeVacuumsProvider.future);
      }(),
      StatusCategory.inactive => () {
        ref.invalidate(inactiveVacuumsProvider);
        return ref.read(inactiveVacuumsProvider.future);
      }(),
      StatusCategory.repair => () {
        ref.invalidate(repairVacuumsProvider);
        return ref.read(repairVacuumsProvider.future);
      }(),
    };

    try {
      await Future.wait<dynamic>(<Future<dynamic>>[
        ref.read(statusSummaryProvider.future),
        selectedListFuture,
      ]);
    } catch (_) {
      // The providers surface readable error states in the UI.
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final selectedCategory = ref.watch(selectedStatusCategoryProvider);
    final summary = ref.watch(statusSummaryProvider);
    final items = ref.watch(statusItemsProvider);

    return AppScreenScaffold(
      title: HomeScreen.statusLabel,
      actions: <Widget>[
        IconButton(
          onPressed: () => _refresh(ref, selectedCategory),
          icon: const Icon(Icons.refresh),
          tooltip: 'Refresh',
        ),
      ],
      body: RefreshIndicator(
        onRefresh: () => _refresh(ref, selectedCategory),
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.all(16),
          children: <Widget>[
            summary.when(
              data: (Map<String, dynamic> payload) => _SummarySection(
                activeCount: payload['active'] as int? ?? 0,
                inactiveCount: payload['inactive'] as int? ?? 0,
                repairCount: payload['repair'] as int? ?? 0,
              ),
              loading: () => const _SummaryLoadingCard(),
              error: (Object error, StackTrace stackTrace) =>
                  _SectionErrorCard(message: mapApiError(error)),
            ),
            const SizedBox(height: 16),
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    Text(
                      categoriesLabel,
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                    const SizedBox(height: 12),
                    Wrap(
                      spacing: 12,
                      runSpacing: 12,
                      children: <Widget>[
                        _CategoryChip(
                          label: activeLabel,
                          selected: selectedCategory == StatusCategory.active,
                          onSelected: () {
                            ref
                                .read(selectedStatusCategoryProvider.notifier)
                                .select(StatusCategory.active);
                          },
                        ),
                        _CategoryChip(
                          label: inactiveLabel,
                          selected: selectedCategory == StatusCategory.inactive,
                          onSelected: () {
                            ref
                                .read(selectedStatusCategoryProvider.notifier)
                                .select(StatusCategory.inactive);
                          },
                        ),
                        _CategoryChip(
                          label: repairLabel,
                          selected: selectedCategory == StatusCategory.repair,
                          onSelected: () {
                            ref
                                .read(selectedStatusCategoryProvider.notifier)
                                .select(StatusCategory.repair);
                          },
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 16),
            items.when(
              data: (List<dynamic> listItems) => _StatusListSection(
                category: selectedCategory,
                items: listItems,
              ),
              loading: () => const _ListLoadingCard(),
              error: (Object error, StackTrace stackTrace) =>
                  _SectionErrorCard(message: mapApiError(error)),
            ),
          ],
        ),
      ),
    );
  }
}

class _SummarySection extends StatelessWidget {
  const _SummarySection({
    required this.activeCount,
    required this.inactiveCount,
    required this.repairCount,
  });

  final int activeCount;
  final int inactiveCount;
  final int repairCount;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Text(
              HomeScreen.statusLabel,
              style: Theme.of(context).textTheme.titleMedium,
            ),
            const SizedBox(height: 12),
            Wrap(
              spacing: 12,
              runSpacing: 12,
              children: <Widget>[
                _SummaryCard(
                  label: '\u0395\u03BD\u03B5\u03C1\u03B3\u03AC',
                  value: activeCount,
                ),
                _SummaryCard(
                  label: '\u039C\u03B7 \u03B5\u03BD\u03B5\u03C1\u03B3\u03AC',
                  value: inactiveCount,
                ),
                _SummaryCard(
                  label:
                      '\u03A0\u03C1\u03BF\u03C2 \u03B5\u03C0\u03B9\u03C3\u03BA\u03B5\u03C5\u03AE',
                  value: repairCount,
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _SummaryCard extends StatelessWidget {
  const _SummaryCard({required this.label, required this.value});

  final String label;
  final int value;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 140,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: const Color(0xFFF8FAFC),
        borderRadius: BorderRadius.circular(18),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Text(label, style: Theme.of(context).textTheme.labelMedium),
          const SizedBox(height: 8),
          Text('$value', style: Theme.of(context).textTheme.headlineSmall),
        ],
      ),
    );
  }
}

class _CategoryChip extends StatelessWidget {
  const _CategoryChip({
    required this.label,
    required this.selected,
    required this.onSelected,
  });

  final String label;
  final bool selected;
  final VoidCallback onSelected;

  @override
  Widget build(BuildContext context) {
    return ChoiceChip(
      label: Text(label),
      selected: selected,
      onSelected: (_) => onSelected(),
    );
  }
}

class _StatusListSection extends StatelessWidget {
  const _StatusListSection({required this.category, required this.items});

  final StatusCategory category;
  final List<dynamic> items;

  @override
  Widget build(BuildContext context) {
    if (items.isEmpty) {
      return Card(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Text(
            _emptyMessageForCategory(category),
            style: Theme.of(context).textTheme.bodyMedium,
          ),
        ),
      );
    }

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(8),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: items.whereType<Map<dynamic, dynamic>>().map((
            Map<dynamic, dynamic> item,
          ) {
            final value = Map<String, dynamic>.from(item);

            switch (category) {
              case StatusCategory.active:
                return _ActiveVacuumTile(item: value);
              case StatusCategory.inactive:
                return _InactiveVacuumTile(item: value);
              case StatusCategory.repair:
                return _RepairVacuumTile(item: value);
            }
          }).toList(),
        ),
      ),
    );
  }

  String _emptyMessageForCategory(StatusCategory category) {
    switch (category) {
      case StatusCategory.active:
        return 'No active vacuums are currently assigned to machines.';
      case StatusCategory.inactive:
        return 'No inactive vacuums are currently available in rack storage.';
      case StatusCategory.repair:
        return 'No vacuums are currently in repair.';
    }
  }
}

class _ActiveVacuumTile extends StatelessWidget {
  const _ActiveVacuumTile({required this.item});

  final Map<String, dynamic> item;

  @override
  Widget build(BuildContext context) {
    final machine = _mapOrNull(item['machine']);
    final description = _nonEmpty(item['description']);
    final descriptionLines = description == null
        ? const <String>[]
        : <String>[description];
    final machineText = machine == null
        ? 'Machine: unavailable'
        : 'Machine: ${machine['name'] ?? machine['code'] ?? '-'}'
              '${machine['code'] != null ? ' (${machine['code']})' : ''}';
    final chargedAt = _formatTimestamp(item['chargedAt']);

    final subtitleLines = <String>[
      ...descriptionLines,
      machineText,
      if (chargedAt != null) 'Charged at: $chargedAt',
    ];

    return ListTile(
      leading: const CircleAvatar(child: Icon(Icons.play_arrow_rounded)),
      title: Text(_primaryVacuumLabel(item)),
      subtitle: Text(subtitleLines.join('\n')),
      isThreeLine: subtitleLines.length > 2,
    );
  }
}

class _InactiveVacuumTile extends StatelessWidget {
  const _InactiveVacuumTile({required this.item});

  final Map<String, dynamic> item;

  @override
  Widget build(BuildContext context) {
    final rack = _mapOrNull(item['rack']);
    final description = _nonEmpty(item['description']);
    final descriptionLines = description == null
        ? const <String>[]
        : <String>[description];
    final rackText = rack == null
        ? 'Rack: unavailable'
        : 'Rack: ${rack['label'] ?? rack['code'] ?? '-'}'
              '${rack['code'] != null ? ' (${rack['code']})' : ''}';

    final subtitleLines = <String>[
      ...descriptionLines,
      rackText,
      'Operational: ${item['operationalStatus'] ?? '-'}',
    ];

    return ListTile(
      leading: const CircleAvatar(child: Icon(Icons.pause_rounded)),
      title: Text(_primaryVacuumLabel(item)),
      subtitle: Text(subtitleLines.join('\n')),
      isThreeLine: true,
    );
  }
}

class _RepairVacuumTile extends StatelessWidget {
  const _RepairVacuumTile({required this.item});

  final Map<String, dynamic> item;

  @override
  Widget build(BuildContext context) {
    final rack = _mapOrNull(item['rack']);
    final openRepair = _mapOrNull(item['openRepair']);
    final description = _nonEmpty(item['description']);
    final descriptionLines = description == null
        ? const <String>[]
        : <String>[description];
    final rackText = rack == null
        ? null
        : 'Rack: ${rack['label'] ?? rack['code'] ?? '-'}'
              '${rack['code'] != null ? ' (${rack['code']})' : ''}';
    final reportedAt = _formatTimestamp(openRepair?['reportedAt']);
    final rackLines = rackText == null ? const <String>[] : <String>[rackText];
    final repairStatusLines = openRepair == null
        ? const <String>[]
        : <String>['Repair: ${openRepair['status'] ?? '-'}'];
    final reportedAtLines = reportedAt == null
        ? const <String>[]
        : <String>['Reported at: $reportedAt'];
    final photoCount = openRepair?['photoCount'];
    final photoLines = photoCount == null
        ? const <String>[]
        : <String>['Photos: $photoCount'];

    final subtitleLines = <String>[
      ...descriptionLines,
      ...rackLines,
      ...repairStatusLines,
      ...reportedAtLines,
      ...photoLines,
    ];

    return ListTile(
      leading: const CircleAvatar(child: Icon(Icons.build_rounded)),
      title: Text(_primaryVacuumLabel(item)),
      subtitle: Text(subtitleLines.join('\n')),
      isThreeLine: subtitleLines.length > 2,
    );
  }
}

class _SummaryLoadingCard extends StatelessWidget {
  const _SummaryLoadingCard();

  @override
  Widget build(BuildContext context) {
    return const Card(
      child: Padding(
        padding: EdgeInsets.all(24),
        child: Row(
          children: <Widget>[
            SizedBox(
              width: 20,
              height: 20,
              child: CircularProgressIndicator(strokeWidth: 2),
            ),
            SizedBox(width: 12),
            Text('Loading summary...'),
          ],
        ),
      ),
    );
  }
}

class _ListLoadingCard extends StatelessWidget {
  const _ListLoadingCard();

  @override
  Widget build(BuildContext context) {
    return const Card(
      child: Padding(
        padding: EdgeInsets.all(24),
        child: Row(
          children: <Widget>[
            SizedBox(
              width: 20,
              height: 20,
              child: CircularProgressIndicator(strokeWidth: 2),
            ),
            SizedBox(width: 12),
            Text('Loading list...'),
          ],
        ),
      ),
    );
  }
}

class _SectionErrorCard extends StatelessWidget {
  const _SectionErrorCard({required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Text(
          message,
          style: TextStyle(color: Theme.of(context).colorScheme.error),
        ),
      ),
    );
  }
}

Map<String, dynamic>? _mapOrNull(dynamic value) {
  if (value is Map<dynamic, dynamic>) {
    return Map<String, dynamic>.from(value);
  }

  return null;
}

String _primaryVacuumLabel(Map<String, dynamic> item) {
  return _nonEmpty(item['serialNumber']) ??
      _nonEmpty(item['code']) ??
      'Unknown vacuum';
}

String? _nonEmpty(dynamic value) {
  final text = value?.toString().trim();
  if (text == null || text.isEmpty || text == 'null') {
    return null;
  }

  return text;
}

String? _formatTimestamp(dynamic value) {
  final raw = _nonEmpty(value);
  if (raw == null) {
    return null;
  }

  final parsed = DateTime.tryParse(raw);
  if (parsed == null) {
    return raw;
  }

  final local = parsed.toLocal();
  final year = local.year.toString().padLeft(4, '0');
  final month = local.month.toString().padLeft(2, '0');
  final day = local.day.toString().padLeft(2, '0');
  final hour = local.hour.toString().padLeft(2, '0');
  final minute = local.minute.toString().padLeft(2, '0');

  return '$year-$month-$day $hour:$minute';
}
