import React from "react";
import { Box, Text } from "ink";
import type { StyledLine } from "../renderers/types.js";

interface Props {
  lines: StyledLine[];
  offset: number;
  height: number;
  showScrollbar?: boolean;
}

export const TextScroller = React.memo(function TextScroller({
  lines,
  offset,
  height,
  showScrollbar = true,
}: Props) {
  const visible = lines.slice(offset, offset + height);
  const canScroll = lines.length > height;
  const maxScroll = Math.max(1, lines.length - height);
  const thumbSize = canScroll
    ? Math.max(1, Math.round((height / lines.length) * height))
    : height;
  const thumbPos = canScroll
    ? Math.round((offset / maxScroll) * (height - thumbSize))
    : 0;

  return (
    <Box flexDirection="row">
      <Box flexDirection="column" flexGrow={1} height={height}>
        {visible.map((line, index) => (
          <Text
            key={offset + index}
            color={line.color}
            bold={line.bold}
            dimColor={line.dim}
            wrap="truncate"
          >
            {line.text || " "}
          </Text>
        ))}
        {visible.length < height
          ? Array.from({ length: height - visible.length }).map((_, index) => (
              <Text key={`pad-${index}`}> </Text>
            ))
          : null}
      </Box>
      {showScrollbar && canScroll ? (
        <Box flexDirection="column" marginLeft={1}>
          {Array.from({ length: height }).map((_, index) => {
            const isThumb = index >= thumbPos && index < thumbPos + thumbSize;
            return (
              <Text key={index} dimColor={!isThumb} color={isThumb ? "cyan" : undefined}>
                {isThumb ? "┃" : "╎"}
              </Text>
            );
          })}
        </Box>
      ) : null}
    </Box>
  );
});
