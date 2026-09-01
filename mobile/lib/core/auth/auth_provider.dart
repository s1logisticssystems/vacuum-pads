import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:vacuum_traceability_mobile/core/api/api_client.dart';
import 'package:vacuum_traceability_mobile/core/auth/auth_session.dart';
import 'package:vacuum_traceability_mobile/core/settings/settings_provider.dart';

const String _sessionKey = 'auth.session';

final authControllerProvider =
    AsyncNotifierProvider<AuthController, AuthSession?>(AuthController.new);

/// The signed-in session, or null while signed out.
final authSessionProvider = Provider<AuthSession?>((ref) {
  return ref.watch(authControllerProvider).whenOrNull(
    data: (AuthSession? session) => session,
  );
});

class AuthController extends AsyncNotifier<AuthSession?> {
  @override
  Future<AuthSession?> build() async {
    final preferences = await SharedPreferences.getInstance();

    return AuthSession.decode(preferences.getString(_sessionKey));
  }

  Future<void> signIn({
    required String username,
    required String password,
  }) async {
    // Built directly rather than read from the provider: that client carries
    // the previous token, and signing in must not depend on one.
    final client = ApiClient(baseUrl: ref.read(apiBaseUrlProvider));
    final payload = await client.login(
      username: username.trim(),
      password: password,
    );
    final session = AuthSession.fromLoginResponse(payload);

    if (session == null) {
      throw StateError('Ο διακομιστής δεν επέστρεψε έγκυρα διαπιστευτήρια.');
    }

    final preferences = await SharedPreferences.getInstance();
    await preferences.setString(_sessionKey, session.encode());

    state = AsyncData<AuthSession?>(session);
  }

  Future<void> signOut() async {
    final preferences = await SharedPreferences.getInstance();
    await preferences.remove(_sessionKey);

    state = const AsyncData<AuthSession?>(null);
  }
}
