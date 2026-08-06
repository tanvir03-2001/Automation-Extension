/**
 * File organization helpers for download naming conventions.
 * Chrome extensions cannot freely write arbitrary local folders;
 * this module standardizes project-relative download paths.
 */
export interface ProjectPaths {
  projectName: string
  rootFolder: string
}

export class FileManager {
  buildProjectPath(paths: ProjectPaths, ...segments: string[]): string {
    const sanitized = [paths.rootFolder, paths.projectName, ...segments]
      .map((part) => part.replace(/[<>:"|?*]/g, '_').replace(/\\/g, '/'))
      .filter(Boolean)
    return sanitized.join('/')
  }

  buildAssetName(prefix: string, extension: string, index?: number): string {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const suffix = typeof index === 'number' ? `_${String(index).padStart(3, '0')}` : ''
    const ext = extension.startsWith('.') ? extension : `.${extension}`
    return `${prefix}_${stamp}${suffix}${ext}`
  }
}

export const fileManager = new FileManager()
