declare module '*.webp' {
  const url: string;
  export default url;
}

declare module '*?inline' {
  const dataUrl: string;
  export default dataUrl;
}

declare module '*?worker&inline' {
  const InlineWorker: new (options?: { name?: string }) => Worker;
  export default InlineWorker;
}

/** Stylesheets are imported for their side effect alone: Vite bundles them into `styles.css`. */
declare module '*.css' {}
declare module '*.scss' {}

/** A language's texts, read when the function is first called (`vite/locale-translations.mts`). */
declare module '*?translation' {
  const load: () => import('./app/i18n/types').Translation;
  export default load;
}
