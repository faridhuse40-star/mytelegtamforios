import React from "react";
import Svg, { Path, Circle, Line, G } from "react-native-svg";
import { palette } from "../../constants/theme";

/**
 * Unified set of stroke-only vector icons used across the messenger UI.
 *
 * All icons share a 24×24 viewBox, are rendered with `fill="none"` and a
 * configurable `stroke` / `strokeWidth`. No color accents, no text glyphs,
 * no filled shapes — strictly monochrome geometry so they read on
 * Liquid_Glass surfaces.
 */
export type IconName =
  // Tab_Bar
  | "chat"
  | "call"
  | "profile"
  // Headers
  | "search"
  | "back"
  | "more"
  | "close"
  // Call_Screen audio controls
  | "mic"
  | "micOff"
  | "speaker"
  | "speakerOff"
  // Call_Screen video controls
  | "camera"
  | "cameraOff"
  | "cameraFlip"
  // Call controls
  | "phone"
  | "phoneHangup"
  | "video"
  // Composer / attachments
  | "attach"
  | "send"
  | "play"
  | "pause"
  | "stop"
  | "doc"
  | "image"
  | "gift"
  | "star";

export interface IconProps {
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
}

export function Icon({
  name,
  size = 24,
  color = palette.white,
  strokeWidth = 1.75,
}: IconProps): JSX.Element {
  // Common stroke props shared by every primitive.
  const stroke = color;
  const sw = strokeWidth;

  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={stroke}
      strokeWidth={sw}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {renderPath(name)}
    </Svg>
  );
}

function renderPath(name: IconName): React.ReactNode {
  switch (name) {
    case "chat":
      // Rounded speech bubble with tail.
      return (
        <Path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
      );

    case "call":
      // Phone handset (Feather-style "phone").
      return (
        <Path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
      );

    case "profile":
      // Head + shoulders silhouette (outlined).
      return (
        <G>
          <Circle cx="12" cy="8" r="4" />
          <Path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1" />
        </G>
      );

    case "search":
      // Magnifying glass.
      return (
        <G>
          <Circle cx="11" cy="11" r="7" />
          <Line x1="16.5" y1="16.5" x2="21" y2="21" />
        </G>
      );

    case "back":
      // Chevron left.
      return <Path d="M15 18l-6-6 6-6" />;

    case "more":
      // Three horizontal dots — tiny stroked circles read as solid dots
      // at strokeWidth ≥ 1.5 without needing fill.
      return (
        <G>
          <Circle cx="5" cy="12" r="1" />
          <Circle cx="12" cy="12" r="1" />
          <Circle cx="19" cy="12" r="1" />
        </G>
      );

    case "close":
      // Diagonal cross.
      return (
        <G>
          <Line x1="6" y1="6" x2="18" y2="18" />
          <Line x1="18" y1="6" x2="6" y2="18" />
        </G>
      );

    case "mic":
      // Microphone capsule + stand.
      return (
        <G>
          <Path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
          <Path d="M19 11v1a7 7 0 0 1-14 0v-1" />
          <Line x1="12" y1="19" x2="12" y2="22" />
          <Line x1="8" y1="22" x2="16" y2="22" />
        </G>
      );

    case "micOff":
      // Muted microphone (Feather-style "mic-off") with slash.
      return (
        <G>
          <Line x1="1" y1="1" x2="23" y2="23" />
          <Path d="M9 9v3a3 3 0 0 0 5.12 2.12" />
          <Path d="M15 9.34V5a3 3 0 0 0-5.94-.6" />
          <Path d="M17 16.95A7 7 0 0 1 5 12v-1" />
          <Path d="M19 11v1a7 7 0 0 1-.11 1.23" />
          <Line x1="12" y1="19" x2="12" y2="22" />
          <Line x1="8" y1="22" x2="16" y2="22" />
        </G>
      );

    case "speaker":
      // Volume / loudspeaker with two sound arcs.
      return (
        <G>
          <Path d="M11 5L6 9H3a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1h3l5 4V5z" />
          <Path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
          <Path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
        </G>
      );

    case "speakerOff":
      // Muted speaker — loudspeaker body + small ✕ in place of waves.
      return (
        <G>
          <Path d="M11 5L6 9H3a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1h3l5 4V5z" />
          <Line x1="23" y1="9" x2="17" y2="15" />
          <Line x1="17" y1="9" x2="23" y2="15" />
        </G>
      );

    case "camera":
      // Photo camera body + lens.
      return (
        <G>
          <Path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
          <Circle cx="12" cy="13" r="4" />
        </G>
      );

    case "cameraOff":
      // Camera with full diagonal slash (Feather-style "camera-off").
      return (
        <G>
          <Line x1="1" y1="1" x2="23" y2="23" />
          <Path d="M21 21H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3" />
          <Path d="M9 3h6l2 3h4a2 2 0 0 1 2 2v9.34" />
          <Path d="M14.83 14.83a4 4 0 1 1-5.66-5.66" />
        </G>
      );

    case "cameraFlip":
      // Camera body + circular refresh arrows inside the lens zone.
      return (
        <G>
          <Path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
          <Path d="M15 13a3 3 0 0 1-5.12 2.12" />
          <Path d="M9 13a3 3 0 0 1 5.12-2.12" />
          <Path d="M15.5 10.5V13H13" />
          <Path d="M8.5 15.5V13H11" />
        </G>
      );

    case "phone":
      // Same handset geometry as "call" (semantic alias for call-action
      // buttons in chat headers).
      return (
        <Path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
      );

    case "phoneHangup":
      // Handset rotated 135° — the conventional "hang up" glyph.
      return (
        <G rotation={135} origin="12,12">
          <Path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
        </G>
      );

    case "video":
      // Video camera (rounded body + viewfinder triangle).
      return (
        <G>
          <Path d="M3 7h12a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2z" />
          <Path d="M23 8l-6 4 6 4V8z" />
        </G>
      );

    case "attach":
      // Paperclip (Feather-style).
      return (
        <Path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
      );

    case "send":
      // Arrow up.
      return (
        <G>
          <Line x1="12" y1="19" x2="12" y2="5" />
          <Path d="M5 12l7-7 7 7" />
        </G>
      );

    case "play":
      // Outlined play triangle.
      return <Path d="M8 5.5v13l11-6.5-11-6.5z" />;

    case "pause":
      // Two vertical bars.
      return (
        <G>
          <Line x1="9" y1="5" x2="9" y2="19" />
          <Line x1="15" y1="5" x2="15" y2="19" />
        </G>
      );

    case "stop":
      // Outlined stop square.
      return <Path d="M7 7h10v10H7z" />;

    case "doc":
      // Document sheet with folded corner.
      return (
        <G>
          <Path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <Path d="M14 2v6h6" />
        </G>
      );

    case "image":
      // Photo frame + sun + mountain.
      return (
        <G>
          <Path d="M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" />
          <Circle cx="8.5" cy="8.5" r="1.5" />
          <Path d="M21 15l-5-5L5 21" />
        </G>
      );

    case "gift":
      // Present box with ribbon and bow (Feather-style).
      return (
        <G>
          <Path d="M20 12v10H4V12" />
          <Path d="M2 7h20v5H2z" />
          <Line x1="12" y1="22" x2="12" y2="7" />
          <Path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z" />
          <Path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" />
        </G>
      );

    case "star":
      // Five-point star outline.
      return (
        <Path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
      );
  }
}
