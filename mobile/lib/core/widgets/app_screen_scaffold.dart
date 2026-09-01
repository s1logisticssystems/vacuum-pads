import 'package:flutter/material.dart';
import 'package:vacuum_traceability_mobile/core/navigation/navigation_helpers.dart';
import 'package:vacuum_traceability_mobile/core/widgets/exit_confirmation_scope.dart';

class AppScreenScaffold extends StatelessWidget {
  const AppScreenScaffold({
    super.key,
    required this.title,
    required this.body,
    this.actions = const <Widget>[],
    this.showBackButton = true,
    this.showHomeButton = true,
    this.wrapExitConfirmation = true,
  });

  final String title;
  final Widget body;
  final List<Widget> actions;
  final bool showBackButton;
  final bool showHomeButton;
  final bool wrapExitConfirmation;

  @override
  Widget build(BuildContext context) {
    final scaffold = Scaffold(
      appBar: AppBar(
        automaticallyImplyLeading: false,
        leading: showBackButton
            ? IconButton(
                key: const ValueKey<String>('app-back-button'),
                tooltip: backNavigationLabel,
                onPressed: () => navigateBackOrHome(context),
                icon: const Icon(Icons.arrow_back_rounded),
              )
            : null,
        title: Text(title),
        actions: <Widget>[
          if (showHomeButton)
            IconButton(
              key: const ValueKey<String>('app-home-button'),
              tooltip: homeNavigationLabel,
              onPressed: () => navigateHome(context),
              icon: const Icon(Icons.home_outlined),
            ),
          ...actions,
        ],
      ),
      body: SafeArea(top: false, child: body),
    );

    if (!wrapExitConfirmation) {
      return scaffold;
    }

    return ExitConfirmationScope(child: scaffold);
  }
}
