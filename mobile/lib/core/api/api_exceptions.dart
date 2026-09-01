import 'package:dio/dio.dart';

class ApiException implements Exception {
  ApiException({required this.message, this.statusCode, this.payload});

  factory ApiException.fromDio(DioException error) {
    final responseData = error.response?.data;
    Map<String, dynamic>? payload;
    String message = 'Request failed';

    if (responseData is Map) {
      payload = Map<String, dynamic>.from(responseData);
      message =
          payload['message'] as String? ??
          payload['error']?['message'] as String? ??
          payload['errorCode'] as String? ??
          message;
    } else if (responseData is String && responseData.trim().isNotEmpty) {
      message = responseData.trim();
    } else if (error.message != null && error.message!.trim().isNotEmpty) {
      message = error.message!.trim();
    }

    return ApiException(
      message: message,
      statusCode: error.response?.statusCode,
      payload: payload,
    );
  }

  final String message;
  final int? statusCode;
  final Map<String, dynamic>? payload;

  Map<String, dynamic> toDisplayMap() {
    return <String, dynamic>{
      'message': message,
      if (statusCode != null) 'statusCode': statusCode,
      if (payload != null) 'payload': payload,
    };
  }

  @override
  String toString() => message;
}

String mapApiError(Object error) {
  if (error is ApiException) {
    return error.message;
  }

  if (error is DioException) {
    return ApiException.fromDio(error).message;
  }

  return 'Unexpected error. Please check backend connectivity and try again.';
}
