module.exports = {
  content: [
    "./*.html",
    "./*.js"
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        "secondary": "#a6c8ff",
        "error": "#ffb4ab",
        "surface-variant": "#30353a",
        "surface-container-highest": "#30353a",
        "surface-container-high": "#252b2f",
        "surface-container": "#1b2024",
        "inverse-on-surface": "#2c3135",
        "secondary-container": "#2992ff",
        "tertiary": "#ffb876",
        "surface": "#0f1418",
        "outline-variant": "#3e4850",
        "primary": "#82cfff",
        "surface-dim": "#0f1418",
        "surface-container-lowest": "#090f13",
        "on-primary": "#00344b",
        "outline": "#87929b",
        "on-background": "#dee3e8",
        "background": "#0f1418",
        "surface-container-low": "#171c20",
        "on-surface": "#dee3e8",
        "on-surface-variant": "#bdc8d1"
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
