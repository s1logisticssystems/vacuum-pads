import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:vacuum_traceability_mobile/core/api/api_exceptions.dart';
import 'package:vacuum_traceability_mobile/core/settings/settings_provider.dart';
import 'package:vacuum_traceability_mobile/core/widgets/app_screen_scaffold.dart';
import 'package:vacuum_traceability_mobile/features/health/health_providers.dart';

class BackendHealthScreen extends ConsumerWidget {
  const BackendHealthScreen({super.key});

  Future<void> _refresh(WidgetRef ref) async {
    ref.invalidate(apiHealthProvider);
    ref.invalidate(databaseHealthProvider);

    try {
      await Future.wait<void>(<Future<void>>[
        ref.read(apiHealthProvider.future).then((_) {}),
        ref.read(databaseHealthProvider.future).then((_) {}),
      ]);
    } catch (_) {
      // The providers will surface readable error states in the UI.
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final health = ref.watch(apiHealthProvider);
    final databaseHealth = ref.watch(databaseHealthProvider);
    final apiBaseUrl = ref.watch(apiBaseUrlProvider);

    return AppScreenScaffold(
      title: 'Backend Health',
      actions: <Widget>[
        IconButton(
          onPressed: () => _refresh(ref),
          icon: const Icon(Icons.refresh),
          tooltip: 'Refresh',
        ),
      ],
      body: RefreshIndicator(
        onRefresh: () => _refresh(ref),
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.all(16),
          children: <Widget>[
            Card(
              child: ListTile(
                leading: const Icon(Icons.dns_outlined),
                title: const Text('API base URL'),
                subtitle: SelectableText(apiBaseUrl),
              ),
            ),
            const SizedBox(height: 16),
            _HealthResponseCard(title: 'GET /health', asyncValue: health),
            const SizedBox(height: 16),
            _HealthResponseCard(
              title: 'GET /health/database',
              asyncValue: databaseHealth,
            ),
          ],
        ),
      ),
    );
  }
}

class _HealthResponseCard extends StatelessWidget {
  const _HealthResponseCard({required this.title, required this.asyncValue});

  final String title;
  final AsyncValue<Map<String, dynamic>> asyncValue;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: asyncValue.when(
          data: (Map<String, dynamic> payload) =>
              _HealthPayloadView(title: title, payload: payload),
          loading: () => Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Text(title, style: Theme.of(context).textTheme.titleMedium),
              const SizedBox(height: 16),
              const Row(
                children: <Widget>[
                  SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  ),
                  SizedBox(width: 12),
                  Text('Loading...'),
                ],
              ),
            ],
          ),
          error: (Object error, StackTrace stackTrace) => Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Text(title, style: Theme.of(context).textTheme.titleMedium),
              const SizedBox(height: 12),
              Text(
                mapApiError(error),
                style: TextStyle(color: Theme.of(context).colorScheme.error),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _HealthPayloadView extends StatelessWidget {
  const _HealthPayloadView({required this.title, required this.payload});

  final String title;
  final Map<String, dynamic> payload;

  @override
  Widget build(BuildContext context) {
    final json = const JsonEncoder.withIndent('  ').convert(payload);
    final status = payload['status']?.toString() ?? 'unknown';
    final isOk = status == 'ok';

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        Text(title, style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: 12),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: <Widget>[
            Chip(
              avatar: Icon(
                isOk ? Icons.check_circle_outline : Icons.error_outline,
                size: 18,
              ),
              label: Text(status.toUpperCase()),
            ),
            if (payload['service'] != null)
              Chip(label: Text(payload['service'].toString())),
          ],
        ),
        const SizedBox(height: 12),
        SelectableText(json),
      ],
    );
  }
}
