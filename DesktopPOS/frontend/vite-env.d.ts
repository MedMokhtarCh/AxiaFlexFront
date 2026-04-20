/// <reference types="vite/client" />

// Allow CSS module side-effect imports (e.g. third-party library stylesheets)
declare module "*.css" {
  const content: Record<string, string>;
  export default content;
}
