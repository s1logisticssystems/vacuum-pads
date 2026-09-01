import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';

const String exitDialogTitle =
    '\u03A4\u03B5\u03C1\u03BC\u03B1\u03C4\u03B9\u03C3\u03BC\u03CC\u03C2 '
    '\u03B5\u03C6\u03B1\u03C1\u03BC\u03BF\u03B3\u03AE\u03C2';
const String exitDialogMessage =
    '\u0398\u03AD\u03BB\u03B5\u03C4\u03B5 \u03BD\u03B1 '
    '\u03BA\u03BB\u03B5\u03AF\u03C3\u03B5\u03C4\u03B5 \u03C4\u03B7\u03BD '
    '\u03B5\u03C6\u03B1\u03C1\u03BC\u03BF\u03B3\u03AE;';
const String exitDialogCancel = '\u038C\u03C7\u03B9';
const String exitDialogConfirm = '\u039D\u03B1\u03B9';
const String homeNavigationLabel = '\u0391\u03C1\u03C7\u03B9\u03BA\u03AE';
const String backNavigationLabel = '\u03A0\u03AF\u03C3\u03C9';

Future<bool> showExitConfirmationDialog(BuildContext context) async {
  final result = await showDialog<bool>(
    context: context,
    builder: (BuildContext dialogContext) {
      return AlertDialog(
        title: const Text(exitDialogTitle),
        content: const Text(exitDialogMessage),
        actions: <Widget>[
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: const Text(exitDialogCancel),
          ),
          FilledButton(
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: const Text(exitDialogConfirm),
          ),
        ],
      );
    },
  );

  return result ?? false;
}

Future<void> handleSystemBackOrExit(BuildContext context) async {
  if (_popIfPossible(context)) {
    return;
  }

  final shouldExit = await showExitConfirmationDialog(context);
  if (shouldExit && context.mounted) {
    await SystemNavigator.pop();
  }
}

void navigateHome(BuildContext context) {
  final router = GoRouter.maybeOf(context);
  if (router != null) {
    router.go('/');
    return;
  }

  Navigator.maybeOf(context)?.popUntil((Route<dynamic> route) => route.isFirst);
}

void navigateBackOrHome(BuildContext context) {
  if (_popIfPossible(context)) {
    return;
  }

  navigateHome(context);
}

bool _popIfPossible(BuildContext context) {
  final router = GoRouter.maybeOf(context);
  if (router != null && router.canPop()) {
    router.pop();
    return true;
  }

  final navigator = Navigator.maybeOf(context);
  if (navigator != null && navigator.canPop()) {
    navigator.pop();
    return true;
  }

  return false;
}
