import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // scripts/ holds Python tooling, model checkpoints and git clones; no need to watch it.
    watch: { ignored: ['**/scripts/**'] },
  },
})
