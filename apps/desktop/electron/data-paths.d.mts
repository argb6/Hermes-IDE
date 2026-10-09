export function platformDefaultHermesHome(
  home: string,
  env?: NodeJS.ProcessEnv,
  platform?: NodeJS.Platform,
): string

export function resolveDesktopUserData(defaultPath: string, env?: NodeJS.ProcessEnv): string

export interface HermesHomeOptions {
  home: string
  env?: NodeJS.ProcessEnv
  platform?: NodeJS.Platform
  directoryExists?: (directory: string) => boolean
  readWindowsHome?: () => string | null
  /** Packaged app install directory; when set, default home is `<installRoot>/hermes`. */
  installRoot?: null | string
}

export function resolveDesktopHermesHome(options: HermesHomeOptions): string
