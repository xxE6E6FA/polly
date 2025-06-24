export function withDisabledAnimations(fn: () => void) {
  const style = document.createElement("style");
  style.textContent = `
    * {
      animation-duration: 0s !important;
      animation-delay: 0s !important;
      transition-duration: 0s !important;
      transition-delay: 0s !important;
    }
  `;
  document.head.appendChild(style);

  try {
    fn();
  } finally {
    // Remove the style after a short delay to ensure the operation completes
    setTimeout(() => {
      document.head.removeChild(style);
    }, 100);
  }
}
