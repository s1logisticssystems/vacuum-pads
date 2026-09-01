import 'dart:async';

import 'package:flutter/material.dart';
import 'package:vacuum_traceability_mobile/core/navigation/navigation_helpers.dart';

class ExitConfirmationScope extends StatelessWidget {
  const ExitConfirmationScope({super.key, required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return PopScope<Object?>(
      canPop: false,
      onPopInvokedWithResult: (bool didPop, Object? result) {
        if (didPop) {
          return;
        }

        unawaited(handleSystemBackOrExit(context));
      },
      child: child,
    );
  }
}
