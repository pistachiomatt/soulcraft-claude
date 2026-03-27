import React from "react";
import { Box, Text, useStdout } from "ink";

export interface KeyHint {
  key: string;
  label: string;
  color?: string;
}

export const Footer = React.memo(function Footer({ hints }: { hints: KeyHint[] }) {
  const { stdout } = useStdout();
  const columns = stdout?.columns ?? 80;

  const items = hints.map((hint) => hint.label ? `${hint.key} ${hint.label}` : hint.key);
  const lines: string[][] = [[]];
  let lineLength = 1;

  for (const item of items) {
    const separator = lines[lines.length - 1]!.length > 0 ? "  " : "";
    if (lineLength + separator.length + item.length > columns - 2 && lines[lines.length - 1]!.length > 0) {
      lines.push([]);
      lineLength = 1;
    }
    lines[lines.length - 1]!.push(item);
    lineLength += (lines[lines.length - 1]!.length > 1 ? 2 : 0) + item.length;
  }

  return (
    <Box flexDirection="column">
      <Text dimColor>{"─".repeat(Math.max(20, columns - 2))}</Text>
      {lines.map((line, index) => (
        <Box key={index} paddingX={1}>
          {line.map((item, itemIndex) => {
            const hint = hints.find((entry) => (entry.label ? `${entry.key} ${entry.label}` : entry.key) === item)!;
            const keyColor = hint.color ?? "gray";
            return (
              <React.Fragment key={item}>
                {itemIndex > 0 ? <Text dimColor>{"  "}</Text> : null}
                <Text color={keyColor} dimColor>
                  {hint.key}
                </Text>
                {hint.label ? (
                  <Text color={hint.color} dimColor={!hint.color}>
                    {" "}{hint.label}
                  </Text>
                ) : null}
              </React.Fragment>
            );
          })}
        </Box>
      ))}
    </Box>
  );
});
