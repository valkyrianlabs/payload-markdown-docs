export {
  buildCanonicalSigningString,
  getCanonicalPathFromRequestUrl,
} from './canonical.js'
export type { CanonicalSigningStringInput } from './canonical.js'
export {
  buildOpenSshEd25519PublicKey,
  DocsSyncKeyError,
  getEd25519PrivateKeyInput,
  getEd25519PublicKeyInput,
} from './ed25519Keys.js'
export { verifyGitHubOidcToken } from './githubOidc.js'
export type {
  GitHubOidcClaims,
  GitHubOidcErrorCode,
  GitHubOidcTrustedSource,
  GitHubOidcVerifyConfig,
  VerifiedGitHubOidcToken,
  VerifyGitHubOidcTokenResult,
} from './githubOidc.js'
export { extractSyncRequestHeaders, syncHeaderNames } from './headers.js'
export type {
  ExtractSyncHeadersResult,
  SyncRequestHeaders,
} from './headers.js'
export type { FetchJson } from './jwks.js'
export {
  decodeJwt,
  toBase64Url,
} from './jwt.js'
export type { DecodedJwt } from './jwt.js'
export {
  assertNonceNotReplayed,
  storeAcceptedNonce,
} from './nonce.js'
export type { NoncePayloadOperations } from './nonce.js'
export { signDocsSyncRequest } from './sign.js'
export type {
  SignDocsSyncRequestOptions,
  SignedDocsSyncRequest,
} from './sign.js'
export {
  validateTimestampSkew,
  verifyBodySha256,
  verifyEd25519Signature,
} from './verify.js'
export type {
  ValidateTimestampResult,
  VerifyBodyHashResult,
} from './verify.js'
