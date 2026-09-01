import 'package:flutter/material.dart';

class ResponsiveDialogActions extends StatelessWidget {
  const ResponsiveDialogActions({super.key, required this.children});

  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.max,
      children: <Widget>[
        for (var index = 0; index < children.length; index++) ...<Widget>[
          if (index > 0) const SizedBox(width: 8),
          Expanded(child: children[index]),
        ],
      ],
    );
  }
}

ButtonStyle compactDialogButtonStyle() {
  return TextButton.styleFrom(
    minimumSize: const Size(0, 44),
    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 10),
    tapTargetSize: MaterialTapTargetSize.shrinkWrap,
    textStyle: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700),
  );
}
