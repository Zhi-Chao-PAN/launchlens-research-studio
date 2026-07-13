export function isDeepWorkerAuthorized(
  supplied: string,
  expected: string = process.env.LAUNCHLENS_DEEP_WORKER_SECRET || "",
): boolean {
  if (expected.length < 24 || supplied.length !== expected.length) return false;
  let mismatch = 0;
  for (let index = 0; index < expected.length; index += 1) {
    mismatch |= supplied.charCodeAt(index) ^ expected.charCodeAt(index);
  }
  return mismatch === 0;
}
