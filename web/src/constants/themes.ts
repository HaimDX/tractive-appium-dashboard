type Color = string;

type ColorScale = [string, string, string, string, string, string, string];

export type ThemeConfig = {
  colors: Record<string, Record<string, Color> | Color | ColorScale>;
  fonts: Record<string, any>;
  borderRadius: Record<string, any>;
};

// Dark greyscale: [0]=primary text → [6]=main bg
const greyscale = [
  "#dde1ef", // [0] primary text (was #000000)
  "#dde1ef", // [1] primary text (was #333333)
  "#8892a8", // [2] secondary text (was #666666)
  "#4a5068", // [3] tertiary text / dim borders (was #999999)
  "#1a1d28", // [4] hover background (was #CCCCCC)
  "#13151d", // [5] surface / card bg (was #EEEEEE)
  "#0c0d12", // [6] main background (was #FFFFFF)
] as ColorScale;

const LightTheme: ThemeConfig = {
  colors: {
    primary: "#5b7fff",
    secondary: "#13151d",
    tertiary: "#1a1d28",
    border: "#1f2235",
    font: "#dde1ef",
    success: "#2dd975",
    error: "#f45858",
    warning: "#e8c14a",
    tab_active_header: "#5b7fff",
    greyscale: greyscale,
    controls: {
      background: "#1a1d28",
    },
    components: {
      session_card_running_status: "#5b7fff",
      session_card_active_bg: "#22263a",
      session_card_default_bg: "#13151d",
      log_entry_hover: "#1a1d28",

      profiling_chart_system_cpu_border: "rgb(194, 230, 153)",
      profiling_chart_system_cpu_background: "rgba(194, 230, 153, 0.3)",
      profiling_chart_app_cpu_border: "rgb(49, 163, 84)",
      profiling_chart_app_cpu_background: "rgba(49, 163, 84, 0.3)",
      profiling_chart_system_memory_border: "rgb(65, 182, 196)",
      profiling_chart_system_memory_background: "rgba(65, 182, 196, 0.3)",
      profiling_chart_app_memory_border: "rgb(34, 94, 168)",
      profiling_chart_app_memory_background: "rgba(34, 94, 168, 0.3)",

      /* http logs component */
      http_logs_table_bg: "#0c0d12",
      http_logs_table_border: "#1f2235",
      http_logs_table_color: "#dde1ef",
      http_logs_table_header_bg: "#0c0d12",
      http_logs_table_header_color: "#8892a8",
      http_logs_table_row_hover: "#1a1d28",
      http_logs_table_row_active: "#22263a",
      http_logs_table_even_row_bg: "#131620",

      http_logs_table_icon_api: "#2dd975",
      http_logs_table_icon_document: "#5b7fff",
      http_logs_table_icon_script: "#e8c14a",

      http_logs_details_header_active: "#1a1d28",
    },
  },
  fonts: {
    size: {
      M: "10px",
      L: "12px",
      XL: "14px",
      XXL: "16px",
    },
    weight: {
      M: "200",
      L: "400",
      XL: "500",
      XXL: "700",
    },
  },
  borderRadius: {
    M: "4px",
    L: "6px",
    XL: "12px",
    XXL: "24px",
  },
};

export default {
  light: LightTheme,
};

export const DEFAULT_THEME = "light";
