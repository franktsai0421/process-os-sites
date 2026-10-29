// Explicit local input selection only; this helper never opens a file.
// The selected package's existing byte/hash pins remain enforced by the caller.
/** @param {string[]} args */
export function readR1InspectPairPath(args) {
  if (args.length !== 2 || args[0] !== '--pair' || typeof args[1] !== 'string' ||
      !args[1] || args[1].startsWith('-') || args[1].includes('\0')) {
    throw Error('R1_INSPECT_PAIR_ARGUMENT_REQUIRED');
  }
  return args[1];
}
