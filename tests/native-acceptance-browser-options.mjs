// Opt-in for the installed-Chrome Windows CI job. Other test callers retain
// their existing launch options. No browser download or security-disabling flags.
export function nativeAcceptanceLaunchOptions(existing) {
  if (process.env.PROCESS_NATIVE_ACCEPTANCE !== '1') return existing;
  if (process.platform !== 'win32') throw Error('Native acceptance requires the Windows runner');
  return {channel: 'chrome', headless: false, chromiumSandbox: true};
}
