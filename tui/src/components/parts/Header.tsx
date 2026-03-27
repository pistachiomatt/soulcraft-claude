import React from "react";
import { Box, Text, useStdout } from "ink";

interface Crumb {
  label: string;
  dim?: boolean;
  color?: string;
}

interface HeaderProps {
  crumbs: Crumb[];
  meta?: string;
  subtitle?: string;
}

export const Header: React.FC<HeaderProps> = ({ crumbs, meta, subtitle }) => {
  const { stdout } = useStdout();
  const width = stdout?.columns ?? 80;

  return (
    <Box flexDirection="column" width={width}>
      <Box justifyContent="space-between" paddingX={1}>
        <Box>
          {crumbs.map((c, i) => (
            <React.Fragment key={i}>
              {i > 0 && <Text color="gray"> {">"} </Text>}
              <Text bold={!c.dim} color={c.color || (c.dim ? "gray" : "white")}>
                {c.label}
              </Text>
            </React.Fragment>
          ))}
        </Box>
        {meta && <Text color="gray">{meta}</Text>}
      </Box>
      {subtitle && (
        <Box paddingX={1}>
          <Text color="gray">{subtitle}</Text>
        </Box>
      )}
      <Box paddingX={1}>
        <Text color="gray">{"\u2500".repeat(Math.max(0, width - 2))}</Text>
      </Box>
    </Box>
  );
};
