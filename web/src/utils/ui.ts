import { ThemeConfig } from "../constants/themes";

export const getHeaderStyle = (theme: ThemeConfig) => `
  background: rgba(12, 13, 18, 0.85);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  color: ${theme.colors.greyscale[0]};
  border-bottom: 1px solid ${theme.colors.border};
`;
