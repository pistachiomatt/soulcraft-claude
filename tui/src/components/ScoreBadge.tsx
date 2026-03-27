import React from "react";
import { Text } from "ink";
import { scoreColorName } from "../theme.js";

export function ScoreBadge({
  score,
  max = 10,
  bold: isBold = false,
}: {
  score: number;
  max?: number;
  bold?: boolean;
}) {
  return (
    <Text color={scoreColorName(score)} bold={isBold}>
      {score}/{max}
    </Text>
  );
}
