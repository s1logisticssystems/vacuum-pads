import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:vacuum_traceability_mobile/core/api/api_client_provider.dart';
import 'package:vacuum_traceability_mobile/core/api/api_exceptions.dart';
import 'package:vacuum_traceability_mobile/core/settings/settings_provider.dart';
import 'package:vacuum_traceability_mobile/core/widgets/exit_confirmation_scope.dart';
import 'package:vacuum_traceability_mobile/features/scanner/qr_scanner_screen.dart';
import 'package:vacuum_traceability_mobile/features/status/status_providers.dart';

class HomeScreen extends ConsumerStatefulWidget {
  const HomeScreen({super.key});

  static const String chargeLabel = '\u03A7\u03C1\u03AD\u03C9\u03C3\u03B7';
  static const String dechargeLabel =
      '\u0391\u03C0\u03BF\u03C7\u03C1\u03AD\u03C9\u03C3\u03B7';
  static const String faultDeclarationLabel =
      '\u0394\u03AE\u03BB\u03C9\u03C3\u03B7 \u0392\u03BB\u03AC\u03B2\u03B7\u03C2';
  static const String faultRestorationLabel =
      '\u0391\u03C0\u03BF\u03BA\u03B1\u03C4\u03AC\u03C3\u03C4\u03B1\u03C3\u03B7 '
      '\u0392\u03BB\u03AC\u03B2\u03B7\u03C2';
  static const String statusLabel =
      '\u039A\u03B1\u03C4\u03AC\u03C3\u03C4\u03B1\u03C3\u03B7';
  static const String backendHealthLabel =
      '\u0388\u03BB\u03B5\u03B3\u03C7\u03BF\u03C2 Backend';

  @override
  ConsumerState<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends ConsumerState<HomeScreen> {
  bool _scannerLookupLoading = false;

  Future<void> _refreshHomeData() async {
    ref.invalidate(statusSummaryProvider);
    ref.invalidate(activeVacuumsProvider);
    ref.invalidate(inactiveVacuumsProvider);
    ref.invalidate(repairVacuumsProvider);

    try {
      await Future.wait<dynamic>(<Future<dynamic>>[
        ref.read(statusSummaryProvider.future),
        ref.read(activeVacuumsProvider.future),
        ref.read(inactiveVacuumsProvider.future),
        ref.read(repairVacuumsProvider.future),
      ]);
    } catch (_) {
      // Provider error states stay visible in the dashboard.
    }
  }

  Future<void> _scanVacuumLookup() async {
    final scannedValue = await QrScannerScreen.scanForRaw(
      context,
      title: 'Scanner',
      description:
          '\u03A3\u03BA\u03B1\u03BD\u03AC\u03C1\u03B5\u03C4\u03B5 Vacuum '
          '\u03B3\u03B9\u03B1 \u03B1\u03BD\u03B1\u03B6\u03AE\u03C4\u03B7\u03C3\u03B7 '
          '\u03C3\u03C4\u03BF\u03B9\u03C7\u03B5\u03AF\u03C9\u03BD.',
    );

    if (!mounted || scannedValue == null || scannedValue.trim().isEmpty) {
      return;
    }

    setState(() {
      _scannerLookupLoading = true;
    });

    try {
      final detail = await _loadVacuumDetailForScan(scannedValue.trim());

      if (!mounted) {
        return;
      }

      await _showVacuumDetailDialog(
        context,
        item: detail,
        title: 'Scanner Vacuum',
      );
      ref.invalidate(statusSummaryProvider);
    } on ApiException catch (error) {
      if (!mounted) {
        return;
      }

      await _showMessageDialog(
        context,
        title: '\u03A3\u03C6\u03AC\u03BB\u03BC\u03B1 Scanner',
        message: mapApiError(error),
      );
    } catch (error) {
      if (!mounted) {
        return;
      }

      await _showMessageDialog(
        context,
        title:
            '\u0394\u03B5\u03BD \u03B2\u03C1\u03AD\u03B8\u03B7\u03BA\u03B5 Vacuum',
        message: error.toString(),
      );
    } finally {
      if (mounted) {
        setState(() {
          _scannerLookupLoading = false;
        });
      }
    }
  }

  Future<Map<String, dynamic>> _loadVacuumDetailForScan(String raw) async {
    final api = ref.read(apiClientProvider);
    final deviceId = ref.read(deviceIdProvider);
    String? vacuumId;

    try {
      final scanResponse = await api.postQrScan(<String, dynamic>{
        'raw': raw,
        'context': 'STATUS',
        'deviceId': deviceId,
      });

      final entity = _mapOrNull(scanResponse['entity']);
      if (scanResponse['ok'] == true &&
          scanResponse['entityType'] == 'VACUUM' &&
          entity != null) {
        vacuumId = _nonEmpty(entity['id']);
      }
    } on ApiException {
      // Fall back to master-data lookup below for manually typed serial/code.
    }

    vacuumId ??= await _findVacuumIdFromMasterData(raw);

    if (vacuumId == null) {
      throw Exception(
        '\u0394\u03B5\u03BD \u03B2\u03C1\u03AD\u03B8\u03B7\u03BA\u03B5 Vacuum '
        '\u03B3\u03B9\u03B1: $raw',
      );
    }

    final detailPayload = await api.getVacuumPadDetail(vacuumId);
    final item = _mapOrNull(detailPayload['item']);

    if (item == null) {
      throw Exception(
        '\u0394\u03B5\u03BD \u03B2\u03C1\u03AD\u03B8\u03B7\u03BA\u03B1\u03BD '
        '\u03B1\u03BD\u03B1\u03BB\u03C5\u03C4\u03B9\u03BA\u03AC '
        '\u03C3\u03C4\u03BF\u03B9\u03C7\u03B5\u03AF\u03B1 Vacuum.',
      );
    }

    return item;
  }

  Future<String?> _findVacuumIdFromMasterData(String raw) async {
    final payload = await ref.read(apiClientProvider).getVacuumPads();
    final items = _mapList(payload['items']);
    final scanCandidates = _scanCandidates(raw);

    for (final item in items) {
      final values = <String?>[
        _nonEmpty(item['serialNumber']),
        _nonEmpty(item['code']),
        _nonEmpty(item['qrCode']),
      ];
      final normalizedValues = values
          .whereType<String>()
          .expand(_scanCandidates)
          .toSet();

      if (scanCandidates.any(normalizedValues.contains)) {
        return _nonEmpty(item['id']);
      }
    }

    return null;
  }

  Future<void> _openStatusList(StatusCategory category) {
    return showDialog<void>(
      context: context,
      builder: (BuildContext dialogContext) {
        return _HomeStatusListDialog(category: category);
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final summary = ref.watch(statusSummaryProvider);

    return ExitConfirmationScope(
      child: Scaffold(
        appBar: AppBar(
          centerTitle: true,
          leading: IconButton(
            key: const ValueKey<String>('home-scanner'),
            tooltip: 'Scanner',
            onPressed: _scannerLookupLoading ? null : _scanVacuumLookup,
            icon: const Icon(Icons.qr_code_scanner_rounded),
          ),
          title: const Text('Vacuum Traceability'),
          actions: <Widget>[
            IconButton(
              key: const ValueKey<String>('home-settings'),
              tooltip: 'Settings',
              onPressed: () => context.go('/settings'),
              icon: const Icon(Icons.settings_outlined),
            ),
          ],
        ),
        body: Container(
          decoration: const BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: <Color>[Color(0xFFF6F7F2), Color(0xFFE7F3EF)],
            ),
          ),
          child: SafeArea(
            child: RefreshIndicator(
              onRefresh: _refreshHomeData,
              child: ListView(
                padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
                children: <Widget>[
                  if (_scannerLookupLoading) ...<Widget>[
                    const LinearProgressIndicator(),
                    const SizedBox(height: 12),
                  ],
                  summary.when(
                    data: (Map<String, dynamic> payload) =>
                        _HomeStatusDashboard(
                          activeCount: payload['active'] as int? ?? 0,
                          inactiveCount: payload['inactive'] as int? ?? 0,
                          repairCount: payload['repair'] as int? ?? 0,
                          onActiveTap: () =>
                              _openStatusList(StatusCategory.active),
                          onInactiveTap: () =>
                              _openStatusList(StatusCategory.inactive),
                          onRepairTap: () =>
                              _openStatusList(StatusCategory.repair),
                        ),
                    loading: () => const _DashboardLoadingCard(),
                    error: (Object error, StackTrace stackTrace) =>
                        _SectionErrorCard(message: mapApiError(error)),
                  ),
                  const SizedBox(height: 20),
                  _HomeActionButton(
                    buttonKey: const ValueKey<String>('home-charge'),
                    title: HomeScreen.chargeLabel,
                    subtitle: 'Charge workflow entry point',
                    icon: Icons.precision_manufacturing_outlined,
                    onTap: () => context.go('/charge'),
                  ),
                  _HomeActionButton(
                    buttonKey: const ValueKey<String>('home-decharge'),
                    title: HomeScreen.dechargeLabel,
                    subtitle: 'Return an active vacuum to rack',
                    icon: Icons.inventory_2_outlined,
                    onTap: () => context.go('/decharge'),
                  ),
                  _HomeActionButton(
                    buttonKey: const ValueKey<String>('home-fault-declaration'),
                    title: HomeScreen.faultDeclarationLabel,
                    subtitle: 'Start repair intake and fault capture',
                    icon: Icons.report_problem_outlined,
                    onTap: () => context.go('/fault-declaration'),
                  ),
                  _HomeActionButton(
                    buttonKey: const ValueKey<String>('home-fault-restoration'),
                    title: HomeScreen.faultRestorationLabel,
                    subtitle: 'Restore repaired vacuums back to AVL racks',
                    icon: Icons.build_circle_outlined,
                    onTap: () => context.go('/fault-restoration'),
                  ),
                  const SizedBox(height: 8),
                  Align(
                    alignment: Alignment.centerLeft,
                    child: TextButton.icon(
                      key: const ValueKey<String>('home-health'),
                      onPressed: () => context.go('/health'),
                      icon: const Icon(Icons.health_and_safety_outlined),
                      label: const Text(HomeScreen.backendHealthLabel),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _HomeStatusDashboard extends StatelessWidget {
  const _HomeStatusDashboard({
    required this.activeCount,
    required this.inactiveCount,
    required this.repairCount,
    required this.onActiveTap,
    required this.onInactiveTap,
    required this.onRepairTap,
  });

  final int activeCount;
  final int inactiveCount;
  final int repairCount;
  final VoidCallback onActiveTap;
  final VoidCallback onInactiveTap;
  final VoidCallback onRepairTap;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(8),
        child: Row(
          key: const ValueKey<String>('home-summary-row'),
          children: <Widget>[
            Expanded(
              child: _StatusSummaryBox(
                boxKey: const ValueKey<String>('home-summary-active'),
                title: _activeShortLabel,
                count: activeCount,
                color: const Color(0xFFDDF6E8),
                icon: Icons.play_arrow_rounded,
                onTap: onActiveTap,
              ),
            ),
            const SizedBox(width: 4),
            Expanded(
              child: _StatusSummaryBox(
                boxKey: const ValueKey<String>('home-summary-inactive'),
                title: _inactiveShortLabel,
                count: inactiveCount,
                color: const Color(0xFFE0F2FE),
                icon: Icons.pause_rounded,
                onTap: onInactiveTap,
              ),
            ),
            const SizedBox(width: 4),
            Expanded(
              child: _StatusSummaryBox(
                boxKey: const ValueKey<String>('home-summary-repair'),
                title: _repairShortLabel,
                count: repairCount,
                color: const Color(0xFFFFE7C2),
                icon: Icons.build_rounded,
                onTap: onRepairTap,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _StatusSummaryBox extends StatelessWidget {
  const _StatusSummaryBox({
    required this.boxKey,
    required this.title,
    required this.count,
    required this.color,
    required this.icon,
    required this.onTap,
  });

  final Key boxKey;
  final String title;
  final int count;
  final Color color;
  final IconData icon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Material(
      color: color,
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        key: boxKey,
        borderRadius: BorderRadius.circular(16),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 8),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Row(
                children: <Widget>[
                  Icon(icon, size: 14, color: const Color(0xFF0F172A)),
                  const SizedBox(width: 3),
                  Expanded(
                    child: FittedBox(
                      fit: BoxFit.scaleDown,
                      alignment: Alignment.centerLeft,
                      child: Text(
                        title,
                        maxLines: 1,
                        style: theme.textTheme.labelSmall?.copyWith(
                          fontWeight: FontWeight.w800,
                          fontSize: 11,
                        ),
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 4),
              Center(
                child: FittedBox(
                  fit: BoxFit.scaleDown,
                  child: Text(
                    '$count',
                    textAlign: TextAlign.center,
                    style: theme.textTheme.titleLarge?.copyWith(
                      color: const Color(0xFF0F172A),
                      fontWeight: FontWeight.w800,
                      fontSize: 20,
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _HomeStatusListDialog extends ConsumerStatefulWidget {
  const _HomeStatusListDialog({required this.category});

  final StatusCategory category;

  @override
  ConsumerState<_HomeStatusListDialog> createState() =>
      _HomeStatusListDialogState();
}

class _HomeStatusListDialogState extends ConsumerState<_HomeStatusListDialog> {
  final TextEditingController _vacuumController = TextEditingController();
  final TextEditingController _machineController = TextEditingController();
  final TextEditingController _rackController = TextEditingController();
  DateTimeRange? _dateRange;

  @override
  void dispose() {
    _vacuumController.dispose();
    _machineController.dispose();
    _rackController.dispose();
    super.dispose();
  }

  AsyncValue<List<dynamic>> _itemsForCategory() {
    return switch (widget.category) {
      StatusCategory.active => ref.watch(activeVacuumsProvider),
      StatusCategory.inactive => ref.watch(inactiveVacuumsProvider),
      StatusCategory.repair => ref.watch(repairVacuumsProvider),
    };
  }

  Future<void> _pickDateRange() async {
    final now = DateTime.now();
    final selected = await showDateRangePicker(
      context: context,
      firstDate: DateTime(now.year - 5),
      lastDate: DateTime(now.year + 1, 12, 31),
      initialDateRange: _dateRange,
    );

    if (selected != null) {
      setState(() {
        _dateRange = selected;
      });
    }
  }

  void _clearFilters() {
    setState(() {
      _vacuumController.clear();
      _machineController.clear();
      _rackController.clear();
      _dateRange = null;
    });
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final items = _itemsForCategory();

    return AlertDialog(
      titlePadding: const EdgeInsets.fromLTRB(24, 18, 12, 0),
      title: Row(
        children: <Widget>[
          Expanded(child: Text(_dialogTitleForCategory(widget.category))),
          IconButton(
            tooltip: '\u039A\u03BB\u03B5\u03AF\u03C3\u03B9\u03BC\u03BF',
            onPressed: () => Navigator.of(context).pop(),
            icon: const Icon(Icons.close),
          ),
        ],
      ),
      content: SizedBox(
        width: 720,
        child: ConstrainedBox(
          constraints: BoxConstraints(
            maxHeight: MediaQuery.sizeOf(context).height * 0.72,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: <Widget>[
              _StatusDialogFilters(
                category: widget.category,
                vacuumController: _vacuumController,
                machineController: _machineController,
                rackController: _rackController,
                dateRange: _dateRange,
                onChanged: () => setState(() {}),
                onPickDateRange: _pickDateRange,
                onClear: _clearFilters,
              ),
              const SizedBox(height: 12),
              Expanded(
                child: items.when(
                  data: (List<dynamic> rawItems) {
                    final filteredItems = _mapList(
                      rawItems,
                    ).where(_matchesFilters).toList();

                    if (filteredItems.isEmpty) {
                      return Center(
                        child: Text(
                          '\u0394\u03B5\u03BD \u03B2\u03C1\u03AD\u03B8\u03B7\u03BA\u03B1\u03BD '
                          '\u03B5\u03B3\u03B3\u03C1\u03B1\u03C6\u03AD\u03C2.',
                          style: theme.textTheme.bodyMedium,
                        ),
                      );
                    }

                    return ListView.separated(
                      itemCount: filteredItems.length,
                      separatorBuilder: (_, _) => const Divider(height: 1),
                      itemBuilder: (BuildContext context, int index) {
                        final item = filteredItems[index];
                        return _StatusDialogListTile(
                          category: widget.category,
                          item: item,
                          onTap: () =>
                              _showVacuumDetailForListItem(context, ref, item),
                        );
                      },
                    );
                  },
                  loading: () =>
                      const Center(child: CircularProgressIndicator()),
                  error: (Object error, StackTrace stackTrace) => Center(
                    child: Text(
                      mapApiError(error),
                      style: TextStyle(color: theme.colorScheme.error),
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  bool _matchesFilters(Map<String, dynamic> item) {
    return _matchesText(_vacuumController.text, <dynamic>[
          item['serialNumber'],
          item['code'],
          item['description'],
        ]) &&
        _matchesCategorySpecificFilters(item) &&
        _matchesDateRange(item);
  }

  bool _matchesCategorySpecificFilters(Map<String, dynamic> item) {
    return switch (widget.category) {
      StatusCategory.active => _matchesText(_machineController.text, <dynamic>[
        _mapOrNull(item['machine'])?['name'],
        _mapOrNull(item['machine'])?['code'],
        _mapOrNull(item['currentMachine'])?['name'],
        _mapOrNull(item['currentMachine'])?['code'],
      ]),
      StatusCategory.inactive ||
      StatusCategory.repair => _matchesText(_rackController.text, <dynamic>[
        _mapOrNull(item['rack'])?['label'],
        _mapOrNull(item['rack'])?['code'],
        _mapOrNull(item['currentRackLocation'])?['label'],
        _mapOrNull(item['currentRackLocation'])?['code'],
      ]),
    };
  }

  bool _matchesDateRange(Map<String, dynamic> item) {
    final dateRange = _dateRange;
    if (dateRange == null) {
      return true;
    }

    final timestamp = _statusTimestampForCategory(item, widget.category);
    if (timestamp == null) {
      return false;
    }

    final start = DateTime(
      dateRange.start.year,
      dateRange.start.month,
      dateRange.start.day,
    );
    final end = DateTime(
      dateRange.end.year,
      dateRange.end.month,
      dateRange.end.day,
      23,
      59,
      59,
      999,
    );

    return !timestamp.isBefore(start) && !timestamp.isAfter(end);
  }
}

class _StatusDialogFilters extends StatelessWidget {
  const _StatusDialogFilters({
    required this.category,
    required this.vacuumController,
    required this.machineController,
    required this.rackController,
    required this.dateRange,
    required this.onChanged,
    required this.onPickDateRange,
    required this.onClear,
  });

  final StatusCategory category;
  final TextEditingController vacuumController;
  final TextEditingController machineController;
  final TextEditingController rackController;
  final DateTimeRange? dateRange;
  final VoidCallback onChanged;
  final VoidCallback onPickDateRange;
  final VoidCallback onClear;

  @override
  Widget build(BuildContext context) {
    final showMachine = category == StatusCategory.active;
    final showRack =
        category == StatusCategory.inactive ||
        category == StatusCategory.repair;

    return Wrap(
      spacing: 10,
      runSpacing: 10,
      crossAxisAlignment: WrapCrossAlignment.center,
      children: <Widget>[
        _FilterField(
          width: 150,
          controller: vacuumController,
          label: 'Vacuum',
          onChanged: onChanged,
        ),
        if (showMachine)
          _FilterField(
            width: 150,
            controller: machineController,
            label: _machineLabelGreek,
            onChanged: onChanged,
          ),
        if (showRack)
          _FilterField(
            width: 150,
            controller: rackController,
            label: _rackLabelGreek,
            onChanged: onChanged,
          ),
        OutlinedButton.icon(
          key: const ValueKey<String>('home-status-date-filter'),
          onPressed: onPickDateRange,
          icon: const Icon(Icons.date_range_outlined),
          label: Text(_dateRangeLabel(dateRange)),
        ),
        TextButton(
          onPressed: onClear,
          child: const Text(
            '\u039A\u03B1\u03B8\u03B1\u03C1\u03B9\u03C3\u03BC\u03CC\u03C2',
          ),
        ),
      ],
    );
  }
}

class _FilterField extends StatelessWidget {
  const _FilterField({
    required this.width,
    required this.controller,
    required this.label,
    required this.onChanged,
  });

  final double width;
  final TextEditingController controller;
  final String label;
  final VoidCallback onChanged;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: width,
      child: TextField(
        controller: controller,
        onChanged: (_) => onChanged(),
        decoration: InputDecoration(
          labelText: label,
          border: const OutlineInputBorder(),
          isDense: true,
        ),
      ),
    );
  }
}

class _StatusDialogListTile extends StatelessWidget {
  const _StatusDialogListTile({
    required this.category,
    required this.item,
    required this.onTap,
  });

  final StatusCategory category;
  final Map<String, dynamic> item;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return ListTile(
      onTap: onTap,
      leading: CircleAvatar(child: Icon(_iconForCategory(category))),
      title: Text('Vacuum: ${_primaryVacuumLabel(item)}'),
      subtitle: Text(_secondaryLineForCategory(item, category)),
      trailing: const Icon(Icons.chevron_right_rounded),
    );
  }
}

class _HomeActionButton extends StatelessWidget {
  const _HomeActionButton({
    required this.buttonKey,
    required this.title,
    required this.subtitle,
    required this.icon,
    required this.onTap,
  });

  final Key buttonKey;
  final String title;
  final String subtitle;
  final IconData icon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Card(
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          key: buttonKey,
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 20),
            child: Row(
              children: <Widget>[
                Container(
                  width: 52,
                  height: 52,
                  decoration: BoxDecoration(
                    color: const Color(0xFFD7EFEA),
                    borderRadius: BorderRadius.circular(18),
                  ),
                  child: Icon(icon, color: const Color(0xFF0F766E)),
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: <Widget>[
                      Text(
                        title,
                        style: theme.textTheme.titleMedium?.copyWith(
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        subtitle,
                        style: theme.textTheme.bodySmall?.copyWith(
                          color: const Color(0xFF475569),
                        ),
                      ),
                    ],
                  ),
                ),
                const Icon(Icons.chevron_right_rounded),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _DashboardLoadingCard extends StatelessWidget {
  const _DashboardLoadingCard();

  @override
  Widget build(BuildContext context) {
    return const Card(
      child: Padding(
        padding: EdgeInsets.all(20),
        child: Row(
          children: <Widget>[
            SizedBox(
              width: 20,
              height: 20,
              child: CircularProgressIndicator(strokeWidth: 2),
            ),
            SizedBox(width: 12),
            Expanded(child: Text('Loading Vacuum summary...')),
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
        padding: const EdgeInsets.all(20),
        child: Text(
          message,
          style: TextStyle(color: Theme.of(context).colorScheme.error),
        ),
      ),
    );
  }
}

class _VacuumDetailContent extends StatelessWidget {
  const _VacuumDetailContent({required this.item});

  final Map<String, dynamic> item;

  @override
  Widget build(BuildContext context) {
    final machine = _mapOrNull(item['currentMachine']);
    final rack = _mapOrNull(item['currentRackLocation']);
    final openCharge = _mapOrNull(item['openChargeSession']);
    final openRepair = _mapOrNull(item['openRepair']);

    return SingleChildScrollView(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          _DetailSection(
            title: 'Vacuum',
            rows: <MapEntry<String, String>>[
              MapEntry('Serial', _displayValue(item['serialNumber'])),
              MapEntry('Code', _displayValue(item['code'])),
              MapEntry('Description', _displayValue(item['description'])),
              MapEntry('Display status', _displayValue(item['displayStatus'])),
              MapEntry(
                'Operational status',
                _displayValue(item['operationalStatus']),
              ),
              MapEntry(
                'Location status',
                _displayValue(item['locationStatus']),
              ),
            ],
          ),
          _DetailSection(
            title:
                '\u03A4\u03C1\u03AD\u03C7\u03BF\u03C5\u03C3\u03B1 \u03B8\u03AD\u03C3\u03B7',
            rows: <MapEntry<String, String>>[
              MapEntry('Machine', _machineDisplay(machine)),
              MapEntry('Rack', _rackDisplay(rack)),
              MapEntry(
                'Charged at',
                _formatTimestamp(openCharge?['chargedAt']) ?? '-',
              ),
              MapEntry('Repair status', _displayValue(openRepair?['status'])),
              MapEntry('Fault', _faultDisplay(openRepair)),
              MapEntry(
                'Reported at',
                _formatTimestamp(openRepair?['reportedAt']) ?? '-',
              ),
            ],
          ),
          _DetailSection(
            title:
                '\u03A4\u03B5\u03C7\u03BD\u03B9\u03BA\u03AC / \u0395\u03BC\u03C0\u03BF\u03C1\u03B9\u03BA\u03AC',
            rows: <MapEntry<String, String>>[
              MapEntry('Net weight kg', _displayValue(item['netWeightKg'])),
              MapEntry('Dimensions L/W/H', _dimensionsText(item)),
              MapEntry(
                'Lifting capacity kg',
                _displayValue(item['liftingCapacityKg']),
              ),
              MapEntry('Cost euro', _displayValue(item['costEuro'])),
              MapEntry(
                'Received at',
                _formatTimestamp(item['receivedAt']) ?? '-',
              ),
            ],
          ),
          _DetailSection(
            title: 'History',
            rows: <MapEntry<String, String>>[
              MapEntry(
                'Updated at',
                _formatTimestamp(item['updatedAt']) ?? '-',
              ),
              MapEntry(
                'Recent movements',
                _recentMovementsText(item['recentMovements']),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _DetailSection extends StatelessWidget {
  const _DetailSection({required this.title, required this.rows});

  final String title;
  final List<MapEntry<String, String>> rows;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 18),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Text(title, style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 8),
          ...rows.map(
            (MapEntry<String, String> row) => Padding(
              padding: const EdgeInsets.only(bottom: 6),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  SizedBox(
                    width: 148,
                    child: Text(
                      row.key,
                      style: Theme.of(context).textTheme.labelLarge,
                    ),
                  ),
                  Expanded(child: Text(row.value)),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

Future<void> _showVacuumDetailForListItem(
  BuildContext context,
  WidgetRef ref,
  Map<String, dynamic> item,
) {
  final id = _nonEmpty(item['id']);
  if (id == null) {
    return _showMessageDialog(
      context,
      title:
          '\u0394\u03B5\u03BD \u03B2\u03C1\u03AD\u03B8\u03B7\u03BA\u03B5 Vacuum',
      message: 'Missing Vacuum id.',
    );
  }

  return showDialog<void>(
    context: context,
    builder: (BuildContext dialogContext) {
      return AlertDialog(
        title: Text(_primaryVacuumLabel(item)),
        content: SizedBox(
          width: 680,
          child: FutureBuilder<Map<String, dynamic>>(
            future: ref.read(apiClientProvider).getVacuumPadDetail(id),
            builder: (BuildContext context, snapshot) {
              if (snapshot.connectionState != ConnectionState.done) {
                return const SizedBox(
                  height: 140,
                  child: Center(child: CircularProgressIndicator()),
                );
              }

              if (snapshot.hasError) {
                return Text(mapApiError(snapshot.error!));
              }

              final detail = _mapOrNull(snapshot.data?['item']);
              if (detail == null) {
                return const Text('Vacuum details are unavailable.');
              }

              return _VacuumDetailContent(item: detail);
            },
          ),
        ),
        actions: <Widget>[
          FilledButton(
            onPressed: () => Navigator.of(dialogContext).pop(),
            child: const Text('OK'),
          ),
        ],
      );
    },
  );
}

Future<void> _showVacuumDetailDialog(
  BuildContext context, {
  required Map<String, dynamic> item,
  required String title,
}) {
  return showDialog<void>(
    context: context,
    builder: (BuildContext dialogContext) {
      return AlertDialog(
        title: Text(title),
        content: SizedBox(width: 680, child: _VacuumDetailContent(item: item)),
        actions: <Widget>[
          FilledButton(
            onPressed: () => Navigator.of(dialogContext).pop(),
            child: const Text('OK'),
          ),
        ],
      );
    },
  );
}

Future<void> _showMessageDialog(
  BuildContext context, {
  required String title,
  required String message,
}) {
  return showDialog<void>(
    context: context,
    builder: (BuildContext dialogContext) {
      return AlertDialog(
        title: Text(title),
        content: Text(message),
        actions: <Widget>[
          FilledButton(
            onPressed: () => Navigator.of(dialogContext).pop(),
            child: const Text('OK'),
          ),
        ],
      );
    },
  );
}

const String _activeShortLabel = '\u0395\u03BD\u03B5\u03C1\u03B3\u03AC';
const String _inactiveShortLabel =
    '\u039C\u03B7 \u03B5\u03BD\u03B5\u03C1\u03B3\u03AC';
const String _repairShortLabel =
    '\u03A0\u03C1\u03BF\u03C2 \u03B5\u03C0\u03B9\u03C3\u03BA\u03B5\u03C5\u03AE';
const String _machineLabelGreek =
    '\u039C\u03B7\u03C7\u03AC\u03BD\u03B7\u03BC\u03B1';
const String _rackLabelGreek = '\u0398\u03AD\u03C3\u03B7';

String _dialogTitleForCategory(StatusCategory category) {
  return switch (category) {
    StatusCategory.active => _activeShortLabel,
    StatusCategory.inactive => _inactiveShortLabel,
    StatusCategory.repair => _repairShortLabel,
  };
}

IconData _iconForCategory(StatusCategory category) {
  return switch (category) {
    StatusCategory.active => Icons.play_arrow_rounded,
    StatusCategory.inactive => Icons.pause_rounded,
    StatusCategory.repair => Icons.build_rounded,
  };
}

String _secondaryLineForCategory(
  Map<String, dynamic> item,
  StatusCategory category,
) {
  return switch (category) {
    StatusCategory.active =>
      '$_machineLabelGreek: ${_machineDisplay(_mapOrNull(item['machine']))}',
    StatusCategory.inactive =>
      '$_rackLabelGreek: ${_rackDisplay(_mapOrNull(item['rack']))}',
    StatusCategory.repair =>
      '$_rackLabelGreek: ${_rackDisplay(_mapOrNull(item['rack']))}',
  };
}

String _dateRangeLabel(DateTimeRange? range) {
  if (range == null) {
    return '\u0395\u03CD\u03C1\u03BF\u03C2 \u03B7\u03BC/\u03BD\u03AF\u03B1\u03C2';
  }

  return '${_dateOnly(range.start)} - ${_dateOnly(range.end)}';
}

String _dateOnly(DateTime value) {
  return '${value.year.toString().padLeft(4, '0')}-'
      '${value.month.toString().padLeft(2, '0')}-'
      '${value.day.toString().padLeft(2, '0')}';
}

bool _matchesText(String filter, Iterable<dynamic> values) {
  final normalizedFilter = filter.trim().toLowerCase();
  if (normalizedFilter.isEmpty) {
    return true;
  }

  return values
      .map(_nonEmpty)
      .whereType<String>()
      .any((String value) => value.toLowerCase().contains(normalizedFilter));
}

DateTime? _statusTimestampForCategory(
  Map<String, dynamic> item,
  StatusCategory category,
) {
  final raw = switch (category) {
    StatusCategory.active => item['chargedAt'],
    StatusCategory.inactive => item['updatedAt'],
    StatusCategory.repair => _mapOrNull(item['openRepair'])?['reportedAt'],
  };

  final parsed = DateTime.tryParse(_displayValue(raw));
  return parsed?.toLocal();
}

String _primaryVacuumLabel(Map<String, dynamic> item) {
  return _nonEmpty(item['serialNumber']) ??
      _nonEmpty(item['code']) ??
      'Unknown vacuum';
}

String _machineDisplay(Map<String, dynamic>? machine) {
  if (machine == null) {
    return '-';
  }

  final code = _displayValue(machine['code']);
  final name = _displayValue(machine['name']);

  if (code == '-' && name == '-') {
    return '-';
  }

  if (code == '-') {
    return name;
  }

  if (name == '-') {
    return code;
  }

  return '$name ($code)';
}

String _rackDisplay(Map<String, dynamic>? rack) {
  if (rack == null) {
    return '-';
  }

  return _nonEmpty(rack['code']) ?? _nonEmpty(rack['label']) ?? '-';
}

String _faultDisplay(Map<String, dynamic>? openRepair) {
  if (openRepair == null) {
    return '-';
  }

  final catalog = _mapOrNull(openRepair['faultCatalog']);
  final catalogText =
      _nonEmpty(catalog?['label']) ?? _nonEmpty(catalog?['code']);
  return catalogText ??
      _nonEmpty(openRepair['faultOtherText']) ??
      _nonEmpty(openRepair['problemDescription']) ??
      '-';
}

String _dimensionsText(Map<String, dynamic> item) {
  final length = _displayValue(item['dimensionLengthMm']);
  final width = _displayValue(item['dimensionWidthMm']);
  final height = _displayValue(item['dimensionHeightMm']);

  if (length == '-' && width == '-' && height == '-') {
    return _displayValue(item['dimensions']);
  }

  return '$length / $width / $height mm';
}

String _recentMovementsText(dynamic value) {
  final movements = _mapList(value);
  if (movements.isEmpty) {
    return '-';
  }

  return movements
      .take(3)
      .map((Map<String, dynamic> movement) {
        final type = _displayValue(movement['movementType']);
        final createdAt = _formatTimestamp(movement['createdAt']) ?? '-';
        return '$type @ $createdAt';
      })
      .join('\n');
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

Map<String, dynamic>? _mapOrNull(dynamic value) {
  if (value is Map<dynamic, dynamic>) {
    return Map<String, dynamic>.from(value);
  }

  return null;
}

List<Map<String, dynamic>> _mapList(dynamic value) {
  if (value is! List<dynamic>) {
    return <Map<String, dynamic>>[];
  }

  final items = <Map<String, dynamic>>[];
  for (final item in value) {
    if (item is Map<dynamic, dynamic>) {
      items.add(Map<String, dynamic>.from(item));
    }
  }

  return items;
}

String _displayValue(dynamic value) {
  return _nonEmpty(value) ?? '-';
}

String? _nonEmpty(dynamic value) {
  final text = value?.toString().trim();
  if (text == null || text.isEmpty || text == 'null') {
    return null;
  }

  return text;
}

Set<String> _scanCandidates(String value) {
  final normalized = _normalizeScanText(value);
  final candidates = <String>{normalized};

  if (normalized.contains(':')) {
    candidates.add(normalized.split(':').last.trim());
  }

  if (normalized.contains('/')) {
    candidates.add(normalized.split('/').last.trim());
  }

  return candidates.where((String value) => value.isNotEmpty).toSet();
}

String _normalizeScanText(String value) {
  return value.trim().toUpperCase();
}
