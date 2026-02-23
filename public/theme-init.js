// Apply theme immediately to prevent flash of wrong theme.
// This file MUST be loaded as a blocking <script> (not type="module")
// before any stylesheet, so the correct class is on <html> before first paint.
(() => {
  document.documentElement.classList.add("disable-animations");

  const themeKey = "polly:theme/v1";
  const storedTheme = localStorage.getItem(themeKey);
  let resolvedTheme = "system";

  if (storedTheme) {
    try {
      const parsed = JSON.parse(storedTheme);
      if (
        parsed &&
        typeof parsed === "object" &&
        "version" in parsed &&
        "data" in parsed
      ) {
        resolvedTheme = parsed.data;
      }
    } catch (e) {
      resolvedTheme = "system";
    }
  }

  let actualTheme;
  if (resolvedTheme === "light" || resolvedTheme === "dark") {
    actualTheme = resolvedTheme;
  } else {
    const prefersDark = window.matchMedia(
      "(prefers-color-scheme: dark)"
    ).matches;
    actualTheme = prefersDark ? "dark" : "light";
  }

  document.documentElement.classList.add(actualTheme);

  // Apply color scheme before first paint
  var validSchemes = ["polly", "catppuccin", "dracula", "nord", "classic"];
  var schemeKey = "polly:color-scheme/v1";
  var colorScheme = "polly";
  var storedScheme = localStorage.getItem(schemeKey);
  if (storedScheme) {
    try {
      var parsed2 = JSON.parse(storedScheme);
      if (
        parsed2 &&
        typeof parsed2 === "object" &&
        "version" in parsed2 &&
        "data" in parsed2 &&
        validSchemes.indexOf(parsed2.data) !== -1
      ) {
        colorScheme = parsed2.data;
      }
    } catch (e) {
      colorScheme = "polly";
    }
  }
  document.documentElement.setAttribute("data-color-scheme", colorScheme);

  setTimeout(() => {
    document.documentElement.classList.remove("disable-animations");
  }, 100);
})();
