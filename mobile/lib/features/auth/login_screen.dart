import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:vacuum_traceability_mobile/core/api/api_exceptions.dart';
import 'package:vacuum_traceability_mobile/core/auth/auth_provider.dart';
import 'package:vacuum_traceability_mobile/core/settings/settings_provider.dart';

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final TextEditingController _username = TextEditingController();
  final TextEditingController _password = TextEditingController();
  final TextEditingController _baseUrl = TextEditingController();
  bool _busy = false;
  bool _obscure = true;
  bool _showServerField = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _baseUrl.text = ref.read(apiBaseUrlProvider);
  }

  @override
  void dispose() {
    _username.dispose();
    _password.dispose();
    _baseUrl.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final username = _username.text.trim();
    final password = _password.text;

    if (username.isEmpty || password.isEmpty) {
      setState(() => _error = 'Συμπληρώστε όνομα χρήστη και κωδικό.');
      return;
    }

    setState(() {
      _busy = true;
      _error = null;
    });

    try {
      final url = _baseUrl.text.trim();

      if (url.isNotEmpty && url != ref.read(apiBaseUrlProvider)) {
        await ref.read(appSettingsProvider.notifier).saveApiBaseUrl(url);
      }

      await ref
          .read(authControllerProvider.notifier)
          .signIn(username: username, password: password);
    } on ApiException catch (error) {
      setState(() => _error = _messageFor(error));
    } catch (error) {
      setState(() => _error = error.toString());
    } finally {
      if (mounted) {
        setState(() => _busy = false);
      }
    }
  }

  String _messageFor(ApiException error) {
    switch (error.statusCode) {
      case 401:
        return 'Λάθος όνομα χρήστη ή κωδικός.';
      case 429:
        return 'Πολλές προσπάθειες. Δοκιμάστε ξανά σε ένα λεπτό.';
      case null:
        return 'Δεν υπάρχει σύνδεση με τον διακομιστή. Ελέγξτε τη διεύθυνση και το δίκτυο.';
      default:
        return error.message;
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: <Widget>[
                  Icon(
                    Icons.inventory_2_outlined,
                    size: 56,
                    color: theme.colorScheme.primary,
                  ),
                  const SizedBox(height: 16),
                  Text(
                    'Vacuum Traceability',
                    textAlign: TextAlign.center,
                    style: theme.textTheme.headlineSmall?.copyWith(
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    'Συνδεθείτε για να συνεχίσετε',
                    textAlign: TextAlign.center,
                    style: theme.textTheme.bodyMedium?.copyWith(
                      color: theme.colorScheme.onSurfaceVariant,
                    ),
                  ),
                  const SizedBox(height: 28),
                  TextField(
                    controller: _username,
                    autocorrect: false,
                    enableSuggestions: false,
                    textInputAction: TextInputAction.next,
                    decoration: const InputDecoration(
                      labelText: 'Όνομα χρήστη',
                      prefixIcon: Icon(Icons.person_outline),
                      border: OutlineInputBorder(),
                    ),
                  ),
                  const SizedBox(height: 14),
                  TextField(
                    controller: _password,
                    obscureText: _obscure,
                    textInputAction: TextInputAction.done,
                    onSubmitted: (_) => _busy ? null : _submit(),
                    decoration: InputDecoration(
                      labelText: 'Κωδικός',
                      prefixIcon: const Icon(Icons.lock_outline),
                      border: const OutlineInputBorder(),
                      suffixIcon: IconButton(
                        icon: Icon(
                          _obscure
                              ? Icons.visibility_outlined
                              : Icons.visibility_off_outlined,
                        ),
                        tooltip: _obscure ? 'Εμφάνιση' : 'Απόκρυψη',
                        onPressed: () =>
                            setState(() => _obscure = !_obscure),
                      ),
                    ),
                  ),
                  if (_error != null) ...<Widget>[
                    const SizedBox(height: 14),
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: theme.colorScheme.errorContainer,
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Text(
                        _error!,
                        style: TextStyle(
                          color: theme.colorScheme.onErrorContainer,
                        ),
                      ),
                    ),
                  ],
                  const SizedBox(height: 22),
                  FilledButton(
                    onPressed: _busy ? null : _submit,
                    style: FilledButton.styleFrom(
                      padding: const EdgeInsets.symmetric(vertical: 16),
                    ),
                    child: _busy
                        ? const SizedBox(
                            height: 20,
                            width: 20,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Text('Σύνδεση'),
                  ),
                  const SizedBox(height: 10),
                  TextButton.icon(
                    onPressed: () => setState(
                      () => _showServerField = !_showServerField,
                    ),
                    icon: Icon(
                      _showServerField
                          ? Icons.expand_less
                          : Icons.settings_outlined,
                      size: 18,
                    ),
                    label: Text(
                      _showServerField
                          ? 'Απόκρυψη ρυθμίσεων'
                          : 'Ρυθμίσεις διακομιστή',
                    ),
                  ),
                  if (_showServerField) ...<Widget>[
                    const SizedBox(height: 6),
                    TextField(
                      controller: _baseUrl,
                      keyboardType: TextInputType.url,
                      autocorrect: false,
                      decoration: const InputDecoration(
                        labelText: 'Διεύθυνση backend',
                        prefixIcon: Icon(Icons.dns_outlined),
                        border: OutlineInputBorder(),
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
