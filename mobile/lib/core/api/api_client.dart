import 'package:dio/dio.dart';
import 'package:vacuum_traceability_mobile/core/api/api_exceptions.dart';

class ApiClient {
  ApiClient({required String baseUrl, String? accessToken, Dio? dio})
    : _dio =
          dio ??
          Dio(
            BaseOptions(
              baseUrl: baseUrl,
              connectTimeout: const Duration(seconds: 8),
              sendTimeout: const Duration(seconds: 15),
              receiveTimeout: const Duration(seconds: 15),
              headers: <String, String>{
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                // Every endpoint except the health probes requires a token.
                if (accessToken != null && accessToken.isNotEmpty)
                  'Authorization': 'Bearer $accessToken',
              },
            ),
          );

  final Dio _dio;

  /// Exchanges credentials for an access token. The only call that works
  /// without one, alongside the health probes.
  Future<Map<String, dynamic>> login({
    required String username,
    required String password,
  }) => _post(
    '/auth/login',
    body: <String, dynamic>{'username': username, 'password': password},
  );

  /// Confirms a stored token is still accepted by the server.
  Future<Map<String, dynamic>> getCurrentUser() => _get('/auth/me');

  Future<Map<String, dynamic>> getHealth() => _get('/health');

  Future<Map<String, dynamic>> getDatabaseHealth() => _get(
    '/health/database',
    validateStatus: (int? status) =>
        status != null && (status >= 200 && status < 300 || status == 503),
  );

  Future<Map<String, dynamic>> getHealthDatabase() => getDatabaseHealth();

  Future<Map<String, dynamic>> scanQr(Map<String, dynamic> body) =>
      _post('/qr/scan', body: body);

  Future<Map<String, dynamic>> postQrScan(Map<String, dynamic> body) =>
      scanQr(body);

  Future<Map<String, dynamic>> chargePreview(Map<String, dynamic> body) =>
      _post('/charge/preview', body: body);

  Future<Map<String, dynamic>> postChargePreview(Map<String, dynamic> body) =>
      chargePreview(body);

  Future<Map<String, dynamic>> charge(Map<String, dynamic> body) =>
      _post('/charge', body: body);

  Future<Map<String, dynamic>> postCharge(Map<String, dynamic> body) =>
      charge(body);

  Future<Map<String, dynamic>> dechargePreview(Map<String, dynamic> body) =>
      _post('/decharge/preview', body: body);

  Future<Map<String, dynamic>> postDechargePreview(Map<String, dynamic> body) =>
      dechargePreview(body);

  Future<Map<String, dynamic>> decharge(Map<String, dynamic> body) =>
      _post('/decharge', body: body);

  Future<Map<String, dynamic>> postDecharge(Map<String, dynamic> body) =>
      decharge(body);

  Future<Map<String, dynamic>> faultDeclarationPreview(
    Map<String, dynamic> body,
  ) => _post('/faults/declaration/preview', body: body);

  Future<Map<String, dynamic>> postFaultDeclarationPreview(
    Map<String, dynamic> body,
  ) => faultDeclarationPreview(body);

  Future<Map<String, dynamic>> faultDeclaration(Map<String, dynamic> body) =>
      _post('/faults/declaration', body: body);

  Future<Map<String, dynamic>> postFaultDeclaration(
    Map<String, dynamic> body,
  ) => faultDeclaration(body);

  Future<Map<String, dynamic>> uploadRepairPhoto({
    required String repairId,
    required String filePath,
    required String fileName,
    required String contentType,
    required String deviceId,
    String stage = 'FAULT_DECLARATION',
    String? operatorName,
    String? caption,
  }) async {
    final formData = FormData.fromMap(<String, dynamic>{
      'file': await MultipartFile.fromFile(
        filePath,
        filename: fileName,
        contentType: DioMediaType.parse(contentType),
      ),
      'deviceId': deviceId,
      'stage': stage,
      if (operatorName != null && operatorName.trim().isNotEmpty)
        'operatorName': operatorName.trim(),
      if (caption != null && caption.trim().isNotEmpty)
        'caption': caption.trim(),
    });

    try {
      final response = await _dio.post<dynamic>(
        '/faults/$repairId/photos',
        data: formData,
        options: Options(contentType: 'multipart/form-data'),
      );
      return _normalizeResponse(response.data);
    } on DioException catch (error) {
      throw ApiException.fromDio(error);
    }
  }

  Future<Map<String, dynamic>> faultRestorationPreview(
    Map<String, dynamic> body,
  ) => _post('/faults/restoration/preview', body: body);

  Future<Map<String, dynamic>> postFaultRestorationPreview(
    Map<String, dynamic> body,
  ) => faultRestorationPreview(body);

  Future<Map<String, dynamic>> faultRestoration(Map<String, dynamic> body) =>
      _post('/faults/restoration', body: body);

  Future<Map<String, dynamic>> postFaultRestoration(
    Map<String, dynamic> body,
  ) => faultRestoration(body);

  Future<Map<String, dynamic>> getFaultsCatalog() => _get('/faults/catalog');

  Future<Map<String, dynamic>> getFaultCatalog() => getFaultsCatalog();

  Future<Map<String, dynamic>> getStatusActiveVacuums() =>
      _get('/status/active-vacuums');

  Future<Map<String, dynamic>> getStatusInactiveVacuums() =>
      _get('/status/inactive-vacuums');

  Future<Map<String, dynamic>> getStatusRepairVacuums() =>
      _get('/status/repair-vacuums');

  Future<Map<String, dynamic>> getStatusSummary() => _get('/status/summary');

  Future<List<dynamic>> getActiveVacuums() =>
      _getItems('/status/active-vacuums');

  Future<List<dynamic>> getInactiveVacuums() =>
      _getItems('/status/inactive-vacuums');

  Future<List<dynamic>> getRepairVacuums() =>
      _getItems('/status/repair-vacuums');

  Future<Map<String, dynamic>> getVacuumPads() =>
      _get('/master-data/vacuum-pads');

  Future<Map<String, dynamic>> getVacuumPadDetail(String id) =>
      _get('/master-data/vacuum-pads/$id');

  Future<Map<String, dynamic>> getMachines({
    bool activeOnly = true,
    bool availableOnly = false,
  }) => _get(
    '/master-data/machines',
    queryParameters: <String, dynamic>{
      'activeOnly': activeOnly,
      'availableOnly': availableOnly,
    },
  );

  Future<Map<String, dynamic>> getRackLocations({
    bool activeOnly = true,
    String? type,
    bool availableOnly = false,
  }) => _get(
    '/master-data/rack-locations',
    queryParameters: <String, dynamic>{
      'activeOnly': activeOnly,
      if (type != null && type.isNotEmpty) 'type': type,
      'availableOnly': availableOnly,
    },
  );

  Future<Map<String, dynamic>> getMasterFaultCatalog() =>
      _get('/master-data/fault-catalog');

  Future<Map<String, dynamic>> _get(
    String path, {
    Map<String, dynamic>? queryParameters,
    bool Function(int?)? validateStatus,
  }) async {
    try {
      final response = await _dio.get<dynamic>(
        path,
        queryParameters: queryParameters,
        options: validateStatus == null
            ? null
            : Options(validateStatus: validateStatus),
      );
      return _normalizeResponse(response.data);
    } on DioException catch (error) {
      throw ApiException.fromDio(error);
    }
  }

  Future<List<dynamic>> _getItems(String path) async {
    final payload = await _get(path);
    final items = payload['items'];

    if (items is List<dynamic>) {
      return items;
    }

    return <dynamic>[];
  }

  Future<Map<String, dynamic>> _post(
    String path, {
    required Map<String, dynamic> body,
  }) async {
    try {
      final response = await _dio.post<dynamic>(path, data: body);
      return _normalizeResponse(response.data);
    } on DioException catch (error) {
      throw ApiException.fromDio(error);
    }
  }

  Map<String, dynamic> _normalizeResponse(dynamic data) {
    if (data is Map) {
      return Map<String, dynamic>.from(data);
    }

    if (data is List) {
      return <String, dynamic>{
        'items': List<dynamic>.from(data),
        'total': data.length,
      };
    }

    return <String, dynamic>{'value': data};
  }
}
