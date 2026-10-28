// Linux's basic_text backend uses a fixed password and is not secure persistence.
function securePersistence(safe, platform = process.platform) {
  try {
    return safe?.isEncryptionAvailable() === true &&
      (platform !== 'linux' || typeof safe.getSelectedStorageBackend === 'function' && ['gnome_libsecret','kwallet','kwallet5','kwallet6'].includes(safe.getSelectedStorageBackend()));
  } catch { return false; }
}
module.exports = { securePersistence };
