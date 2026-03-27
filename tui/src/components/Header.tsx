import React from "react";
import { Box, Text, useStdout } from "ink";

interface Props {
  breadcrumb: string[];
  right?: string;
  rightColor?: string;
  border?: boolean;
}

export const Header = React.memo(function Header({ breadcrumb, right, rightColor, border }: Props) {
  const { stdout } = useStdout();
  const columns = stdout?.columns ?? 80;

  return (
    <Box flexDirection="column" flexShrink={0}>
      <Box paddingX={1}>
        <Box flexGrow={1}>
          {breadcrumb.map((part, index) => (
            <React.Fragment key={index}>
              {index > 0 ? <Text dimColor> {"›"} </Text> : null}
              <Text
                color={index === breadcrumb.length - 1 ? "white" : "gray"}
                bold={index === breadcrumb.length - 1}
              >
                {part}
              </Text>
            </React.Fragment>
          ))}
        </Box>
        {right ? (
          <Text color={rightColor} dimColor={!rightColor}>
            {right}
          </Text>
        ) : null}
      </Box>
      {border ? (
        <Text dimColor wrap="truncate">
          {"─".repeat(Math.max(20, columns - 2))}
        </Text>
      ) : null}
    </Box>
  );
});
