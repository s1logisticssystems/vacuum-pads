import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:vacuum_traceability_mobile/core/api/api_client.dart';
import 'package:vacuum_traceability_mobile/core/auth/auth_provider.dart';
import 'package:vacuum_traceability_mobile/core/settings/settings_provider.dart';

final apiClientProvider = Provider<ApiClient>((ref) {
  final token = ref.watch(authSessionProvider)?.accessToken;
  final baseUrl = ref.watch(apiBaseUrlProvider);

  final dio = Dio(
    BaseOptions(
      baseUrl: baseUrl,
      connectTimeout: const Duration(seconds: 8),
      sendTimeout: const Duration(seconds: 15),
      receiveTimeout: const Duration(seconds: 15),
      headers: <String, String>{
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        if (token != null && token.isNotEmpty) 'Authorization': 'Bearer $token',
      },
    ),
  );

  // An expired or revoked token would otherwise surface as an unexplained
  // failure on every screen. Signing out returns the user to the login screen,
  // which is the only thing that can resolve it.
  dio.interceptors.add(
    InterceptorsWrapper(
      onError: (DioException error, ErrorInterceptorHandler handler) {
        if (error.response?.statusCode == 401 && token != null) {
          unawaited(ref.read(authControllerProvider.notifier).signOut());
        }

        handler.next(error);
      },
    ),
  );

  // Rebuilt whenever the session changes, so a fresh sign-in or a sign-out
  // immediately affects every request the app makes.
  return ApiClient(baseUrl: baseUrl, accessToken: token, dio: dio);
});
