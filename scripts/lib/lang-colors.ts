// A small subset of GitHub linguist language colors, enough to cover the
// repos we expect. Anything missing falls back to a neutral grey so the UI
// can still render. Source: github/linguist languages.yml.

const COLORS: Record<string, string> = {
  TypeScript: '#3178c6',
  JavaScript: '#f1e05a',
  Python: '#3572A5',
  Go: '#00ADD8',
  Rust: '#dea584',
  Java: '#b07219',
  Kotlin: '#A97BFF',
  Swift: '#F05138',
  'Objective-C': '#438eff',
  Ruby: '#701516',
  PHP: '#4F5D95',
  C: '#555555',
  'C++': '#f34b7d',
  'C#': '#178600',
  HTML: '#e34c26',
  CSS: '#563d7c',
  SCSS: '#c6538c',
  Sass: '#a53b70',
  Less: '#1d365d',
  Shell: '#89e051',
  Vue: '#41b883',
  Svelte: '#ff3e00',
  Dart: '#00B4AB',
  Lua: '#000080',
  Haskell: '#5e5086',
  Elixir: '#6e4a7e',
  Erlang: '#B83998',
  Scala: '#c22d40',
  Clojure: '#db5855',
  R: '#198CE7',
  'Jupyter Notebook': '#DA5B0B',
  Dockerfile: '#384d54',
  Makefile: '#427819',
  PowerShell: '#012456',
  Perl: '#0298c3',
  TeX: '#3D6117',
  Markdown: '#083fa1',
  Vim: '#199f4b',
  Zig: '#ec915c',
  Nix: '#7e7eff',
  HCL: '#844FBA',
  YAML: '#cb171e',
  JSON: '#292929',
}

export function colorFor(language: string): string {
  return COLORS[language] ?? '#8b8b8b'
}
