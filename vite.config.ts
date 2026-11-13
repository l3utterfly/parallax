import react from '@vitejs/plugin-react'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin } from 'vite'

const ROOT = path.dirname(fileURLToPath(import.meta.url))

/**
 * Dev-only stand-in for the Layla mini-app folder, used with `?layla-mock`
 * (see src/dev/laylaDevBridge.ts). Layla serves that folder over localhost and
 * `layla.utils.saveFile` / `deleteFileOrDir` write into it; here the folder is
 * `.layla-dev/app-folder/`, written through `/__layla-dev/file` and served at
 * `/models/...` with real 404s, like Layla's static server.
 */
function laylaDevFolder(): Plugin {
  const dir = path.join(ROOT, '.layla-dev', 'app-folder')
  const inside = (p: string) => p.startsWith(dir + path.sep)

  return {
    name: 'layla-dev-folder',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url ?? '/', 'http://dev')
        try {
          if (url.pathname === '/__layla-dev/file') {
            const target = path.resolve(dir, url.searchParams.get('path') ?? '')
            if (!inside(target)) {
              res.statusCode = 400
              return res.end('Path escapes the app folder.')
            }
            if (req.method === 'PUT') {
              const chunks: Buffer[] = []
              for await (const chunk of req) chunks.push(chunk as Buffer)
              await mkdir(path.dirname(target), { recursive: true })
              await writeFile(target, Buffer.from(Buffer.concat(chunks).toString('utf8'), 'base64'))
              return res.end('ok')
            }
            if (req.method === 'DELETE') {
              await rm(target, { recursive: true, force: true })
              return res.end('ok')
            }
            res.statusCode = 405
            return res.end()
          }
          if (url.pathname.startsWith('/models/')) {
            const target = path.resolve(dir, '.' + decodeURIComponent(url.pathname))
            if (!inside(target)) return next()
            try {
              const data = await readFile(target)
              res.setHeader('Content-Type', 'application/octet-stream')
              res.setHeader('Cache-Control', 'no-store')
              return res.end(data)
            } catch {
              res.statusCode = 404
              return res.end()
            }
          }
        } catch (e) {
          res.statusCode = 500
          return res.end(String(e))
        }
        next()
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), laylaDevFolder()],
  // These are first imported lazily (worker, ?layla-mock, first model save). Listing them
  // stops Vite from discovering them mid-session and reloading the page during a download.
  optimizeDeps: { include: ['onnxruntime-web/webgpu', '@layla-network/sdk', 'fast-png'] },
  server: {
    // scripts/ holds Python tooling, model checkpoints and git clones; .layla-dev/ holds fake app-folder models.
    watch: { ignored: ['**/scripts/**', '**/.layla-dev/**'] },
  },
})
