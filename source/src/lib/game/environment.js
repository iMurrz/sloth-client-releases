// Pass OS/session essentials instead of inherited launcher credentials and JVM injection options.
const ESSENTIALS = new Set([
  'PATH', 'PATHEXT', 'SYSTEMROOT', 'WINDIR', 'COMSPEC', 'TEMP', 'TMP', 'TMPDIR',
  'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'PROGRAMDATA', 'PROGRAMFILES', 'PROGRAMFILES(X86)',
  'COMMONPROGRAMFILES', 'COMMONPROGRAMFILES(X86)', 'USERNAME', 'USERDOMAIN', 'OS',
  'NUMBER_OF_PROCESSORS', 'PROCESSOR_ARCHITECTURE', 'PROCESSOR_IDENTIFIER',
  'HOME', 'USER', 'LOGNAME', 'LANG', 'LANGUAGE', 'TZ', 'DISPLAY', 'WAYLAND_DISPLAY',
  'XAUTHORITY', 'XDG_RUNTIME_DIR', 'XDG_SESSION_TYPE', 'DBUS_SESSION_BUS_ADDRESS',
  '__NV_PRIME_RENDER_OFFLOAD', '__GLX_VENDOR_LIBRARY_NAME', '__VK_LAYER_NV_OPTIMUS'
]);
function gameEnvironment(source = process.env) {
  return Object.fromEntries(Object.entries(source).filter(([key, value]) => typeof value === 'string' &&
    (ESSENTIALS.has(key.toUpperCase()) || /^LC_[A-Z_]+$/.test(key))));
}
module.exports = { gameEnvironment };
