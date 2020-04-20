export const ORIGIN =
  process.env.NODE_ENV === "development"
    ? "https://localhost.dev:3000"
    : "https://editor.vova.codes";
export const PREVIEW_ORIGIN =
  process.env.NODE_ENV === "development"
    ? "https://localhost2.dev:3000"
    : "https://editor-preview.vova.codes";
