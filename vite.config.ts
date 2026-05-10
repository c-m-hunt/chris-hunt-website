import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
//
// `base` controls the public path prefix Vite stamps into the built HTML.
// - Local dev / preview / custom domain (`chris-hunt.net`) / a `<user>.github.io` repo: leave unset → `/`.
// - Project pages (`<user>.github.io/<repo>/`): set `BASE_PATH=/<repo>/` at build time.
// The deploy workflow sets this to `/chris-hunt-website/` by default; the
// `CUSTOM_DOMAIN` repo variable flips it back to `/`. See README.
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  plugins: [react()],
})
