import 'dart:convert';

/// A signed-in user and the token used to authenticate their requests.
class AuthSession {
  const AuthSession({
    required this.accessToken,
    required this.username,
    required this.displayName,
    required this.role,
  });

  final String accessToken;
  final String username;
  final String? displayName;
  final String role;

  String get label =>
      displayName != null && displayName!.trim().isNotEmpty
      ? displayName!.trim()
      : username;

  Map<String, dynamic> toJson() => <String, dynamic>{
    'accessToken': accessToken,
    'username': username,
    'displayName': displayName,
    'role': role,
  };

  String encode() => jsonEncode(toJson());

  /// Returns null rather than throwing, so a corrupted stored value is treated
  /// as "not signed in" instead of preventing the app from starting.
  static AuthSession? decode(String? raw) {
    if (raw == null || raw.trim().isEmpty) {
      return null;
    }

    try {
      final decoded = jsonDecode(raw);

      if (decoded is! Map) {
        return null;
      }

      final token = decoded['accessToken'];
      final username = decoded['username'];

      if (token is! String || token.isEmpty || username is! String) {
        return null;
      }

      final displayName = decoded['displayName'];
      final role = decoded['role'];

      return AuthSession(
        accessToken: token,
        username: username,
        displayName: displayName is String ? displayName : null,
        role: role is String ? role : 'OPERATOR',
      );
    } catch (_) {
      return null;
    }
  }

  /// Builds a session from a successful `/auth/login` response.
  static AuthSession? fromLoginResponse(Map<String, dynamic> payload) {
    final token = payload['accessToken'];
    final user = payload['user'];

    if (token is! String || token.isEmpty || user is! Map) {
      return null;
    }

    final username = user['username'];

    if (username is! String || username.isEmpty) {
      return null;
    }

    final displayName = user['displayName'];
    final role = user['role'];

    return AuthSession(
      accessToken: token,
      username: username,
      displayName: displayName is String ? displayName : null,
      role: role is String ? role : 'OPERATOR',
    );
  }
}
