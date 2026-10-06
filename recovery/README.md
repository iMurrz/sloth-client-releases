# Recovered launcher repair

The ZIP contains launcher JavaScript recovered from the published 0.0.45 installer, with the undefined `javaVersion` option fixed in `src/lib/mod-manager.js`. The checker now accepts the supplied Java version and defaults to the bundled runtime major version, 21.

Validation passed: JavaScript syntax, empty-instance inspection, and a synthetic Fabric mod requiring Java 21 with default Java, explicit Java 21, and incompatible Java 17. The existing AppleSkin/JEI warning fix is preserved.

This archive is recovered packaged code, not the complete original development project or an installable update. It does not include original native client source, installer build configuration, or private signing keys. The published installer and updater feed remain version 0.0.45.
