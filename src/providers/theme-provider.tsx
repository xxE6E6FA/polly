import * as React from "react";

type ThemeProviderProps = {
  children: React.ReactNode;
  serverTheme?: "light" | "dark";
};

const ServerThemeContext = React.createContext<"light" | "dark">("light");

export function useServerTheme() {
  return React.useContext(ServerThemeContext);
}

export const ThemeProvider = ({
  children,
  serverTheme = "light",
}: ThemeProviderProps) => {
  return (
    <ServerThemeContext.Provider value={serverTheme}>
      {children}
    </ServerThemeContext.Provider>
  );
};
