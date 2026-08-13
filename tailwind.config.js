module.exports = {
  content: [
    "./*.html",
    "./*.js"
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Using CSS variables so light/dark mode works correctly
        "primary":                      "rgb(var(--color-primary) / <alpha-value>)",
        "on-primary":                   "rgb(var(--color-on-primary) / <alpha-value>)",
        "secondary":                    "rgb(var(--color-secondary) / <alpha-value>)",
        "secondary-container":          "rgb(var(--color-secondary-container) / <alpha-value>)",
        "tertiary":                     "rgb(var(--color-tertiary) / <alpha-value>)",
        "error":                        "rgb(var(--color-error) / <alpha-value>)",
        "background":                   "rgb(var(--color-background) / <alpha-value>)",
        "on-background":                "rgb(var(--color-on-background) / <alpha-value>)",
        "surface":                      "rgb(var(--color-surface) / <alpha-value>)",
        "on-surface":                   "rgb(var(--color-on-surface) / <alpha-value>)",
        "surface-variant":              "rgb(var(--color-surface-variant) / <alpha-value>)",
        "on-surface-variant":           "rgb(var(--color-on-surface-variant) / <alpha-value>)",
        "outline":                      "rgb(var(--color-outline) / <alpha-value>)",
        "outline-variant":              "rgb(var(--color-outline-variant) / <alpha-value>)",
        "surface-container-lowest":     "rgb(var(--color-surface-container-lowest) / <alpha-value>)",
        "surface-container-low":        "rgb(var(--color-surface-container-low) / <alpha-value>)",
        "surface-container":            "rgb(var(--color-surface-container) / <alpha-value>)",
        "surface-container-high":       "rgb(var(--color-surface-container-high) / <alpha-value>)",
        "surface-container-highest":    "rgb(var(--color-surface-container-highest) / <alpha-value>)",
        "surface-dim":                  "rgb(var(--color-surface-dim) / <alpha-value>)",
        "inverse-on-surface":           "rgb(var(--color-inverse-on-surface) / <alpha-value>)",
      },
      borderRadius: {
        "DEFAULT": "0.25rem",
        "lg": "0.5rem",
        "xl": "0.75rem",
        "full": "9999px"
      },
      spacing: {
        "gutter": "24px",
        "unit": "8px",
        "container-max": "1440px",
        "margin-mobile": "20px",
        "margin-desktop": "64px"
      },
      fontFamily: {
        "body-md": ["Cairo", "sans-serif"],
        "mono-data": ["Geist", "monospace"],
        "label-caps": ["Geist", "sans-serif"],
        "display-lg-mobile": ["Sora", "sans-serif"],
        "headline-md": ["Sora", "sans-serif"],
        "display-lg": ["Sora", "sans-serif"],
        "body-lg": ["Cairo", "sans-serif"]
      }
    }
  },
  plugins: [
    require('@tailwindcss/forms'),
    require('@tailwindcss/container-queries')
  ]
}
