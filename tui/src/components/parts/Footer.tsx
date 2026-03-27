import React from "react";
import { Box, Text, useStdout } from "ink";

interface KeyHint {
  key: string;
  label: string;
}

interface FooterProps {
  hints: KeyHint[];
  scrollInfo?: string;
}

export const Footer: React.FC<FooterProps> = ({ hints, scrollInfo }) => {
  const { stdout } = useStdout();
  const width = stdout?.columns ?? 80;

  return (
    <Box flexDirection="column" width={width}>
      <Box paddingX={1}>
        <Text color="gray">{"\u2500".repeat(Math.max(0, width - 2))}</Text>
      </Box>
      <Box justifyContent="space-between" paddingX={1}>
        <Box gap={2}>
          {hints.map((h, i) => (
            <Box key={i}>
              <Text color="cyan" bold>{h.key}</Text>
              <Text color="gray"> {h.label}</Text>
            </Box>
          ))}
        </Box>
        {scrollInfo && <Text color="gray">{scrollInfo}</Text>}
      </Box>
    </Box>
  );
};
