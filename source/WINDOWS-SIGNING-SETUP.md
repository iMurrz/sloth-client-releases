# Sloth Client: trusted Windows signing

Status: production signing integration prepared; no trusted certificate has been issued or used yet. The local development installer is unsigned and must not be published as a trusted Windows release. The owner approved Microsoft Artifact Signing on October 1, 2026.

## Owner setup in Microsoft Azure

1. Sign in to https://portal.azure.com using your own Microsoft account. Create or select your Azure subscription and tenant. Basic Artifact Signing costs approximately $9.99 per account per month for 5,000 signatures; taxes, excess use and other Azure services may add costs.
2. For individual validation, Microsoft currently supports US and Canadian residents. Use an Individual billing account. Your legal name and sold-to address must exactly match your government ID. Submit ID only through Microsoft's verification flow. Certificate identity information is public: review the certificate subject before distributing software.
3. Register the `Microsoft.CodeSigning` resource provider in the subscription. Create an Artifact Signing account with Basic pricing in a supported region, such as East US. Retain its actual name and endpoint.
4. In the account's Identity validations page, select Individual and create a public identity validation. The submitting user needs the Artifact Signing Identity Verifier role. Complete Microsoft's identity checks and wait for approval.
5. Create a certificate profile of type **Public Trust**, associated with the approved identity. Public Trust Test and Private Trust profiles do not provide the intended public distribution trust.
6. Grant the build identity the Artifact Signing Certificate Profile Signer role scoped to this profile. Use separate administrative and build identities where practical. Authentication belongs in your external Azure credential setup, not in the app or this configuration. Electron-builder's provider uses Azure Identity credentials; a supported environment credential can use AZURE_TENANT_ID, AZURE_CLIENT_ID and AZURE_CLIENT_SECRET in the local build process. Never place the secret in project files, GitHub release assets, or chat. Prefer a managed identity or certificate credential when supported by the chosen build environment.

## Public configuration only

Copy `build/windows-signing.example.json` to `build/windows-signing.json` and enter:

- Actual signing account name.
- Actual certificate profile name.
- Region endpoint from Microsoft (East US: `https://eus.codesigning.azure.net`).
- Exact certificate publisher common name. This may be your verified legal name, rather than the Sloth Client brand.
- `profileType`: `PublicTrust`.

No passwords, keys, access tokens or identity documents belong in this file. The configuration loader rejects unknown fields and placeholder names. Resource configuration is excluded from the packaged app through the existing source allowlist; the public publisher name is deliberately included in the updater configuration so Windows can verify downloaded updates.

## Build and verification

Run `npm run signing:preflight` to check configuration. After Azure credentials and the approved profile are available, run `npm run dist:win`. The signing provider installs Microsoft's TrustedSigning PowerShell module for the current build user. Production builds require signing, use SHA-256 and Microsoft's RFC 3161 timestamp service, and sign the app, installer and native Windows binaries.

`npm run signing:verify` checks Windows trust and timestamps on every distributed EXE, DLL and native module. The app and installer must match the configured publisher. The release publisher also checks that the packaged updater expects that same identity, plus the separate Ed25519 signatures, file inventory and packaged-source checks. A mismatch blocks publication.

Successful signing establishes publisher identity and detects later modification; it does not certify that the application has no vulnerabilities, prevent all reverse engineering, confer Mojang approval or guarantee immediate SmartScreen reputation. Do not install a self-signed root to simulate public trust.

Existing public Sloth 0.13.x users will need one manual Sloth 0.0.1 install because the new number is lower. The old public release remains until the signed replacement and remaining application/rights/privacy reviews are complete.

## Official references

- Setup and identity validation: https://learn.microsoft.com/en-us/azure/artifact-signing/quickstart
- Pricing tiers: https://learn.microsoft.com/en-us/azure/artifact-signing/how-to-change-sku
- Roles: https://learn.microsoft.com/en-us/azure/artifact-signing/concept-resources-roles
- Certificate lifecycle and timestamping: https://learn.microsoft.com/en-us/azure/artifact-signing/concept-certificate-management
