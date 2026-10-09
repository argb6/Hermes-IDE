// Shared with the desktop channel-stamp test. Mirrors
// scripts/bundles/release_artifacts.py stamp_matches for a receiver candidate:
// ordinary stable ownership returns the requested version, preview ownership throws.

export function verifyBundleStamp(stamp, options) {
  const request = options?.channelRequest
  const commit = options?.commit

  if (request?.receiverCandidate) {
    if (
      stamp?.channelBuild != null ||
      stamp?.source !== 'build' ||
      stamp?.receiverProtocol !== 1 ||
      stamp?.displayVersion !== request.version ||
      stamp?.commit !== commit ||
      stamp?.tag !== request.releaseTag ||
      stamp?.baseVersion !== request.sourceVersion
    ) {
      throw new Error('Receiver candidate must use ordinary stable update ownership')
    }

    return request.version
  }

  if (
    stamp?.source !== 'channel-build' ||
    stamp?.channelBuild !== request ||
    stamp?.commit !== request?.commit ||
    stamp?.tag
  ) {
    throw new Error('Built package provenance does not match the channel request')
  }

  return request.version
}
