import { copyFile, readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { Plugin } from 'vite'

/** Fixed filename so programmatic inject keeps working after rebuild without Chrome reload. */
export const STABLE_CONTENT_LOADER = 'assets/content-loader.js'

/**
 * CRXJS emits hashed content loaders (`index.ts-loader-XXXX.js`). After `vite build`,
 * copy the latest loader to a stable path and point the packaged manifest at it.
 */
export function stableContentLoader(): Plugin {
  return {
    name: 'ae-stable-content-loader',
    apply: 'build',
    enforce: 'post',
    async closeBundle() {
      const outDir = path.resolve(process.cwd(), 'dist')
      const assetsDir = path.join(outDir, 'assets')

      let files: string[]
      try {
        files = await readdir(assetsDir)
      } catch {
        return
      }

      const loader = files.find(
        (name) => name.startsWith('index.ts-loader-') && name.endsWith('.js'),
      )
      if (!loader) return

      await copyFile(path.join(assetsDir, loader), path.join(outDir, STABLE_CONTENT_LOADER))

      const manifestPath = path.join(outDir, 'manifest.json')
      const raw = await readFile(manifestPath, 'utf8')
      const manifest = JSON.parse(raw) as {
        content_scripts?: Array<{ js?: string[] }>
      }

      for (const entry of manifest.content_scripts ?? []) {
        entry.js = (entry.js ?? []).map((file) =>
          file.includes('index.ts-loader-') ? STABLE_CONTENT_LOADER : file,
        )
      }

      await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
    },
  }
}
