export function publicProofUrl(publicRef: string) {
  return `/proof/${publicRef.toLowerCase()}`;
}

export function proofStateLabel(state: string) {
  return state
    .split("_")
    .map((word) => word[0]?.toUpperCase() + word.slice(1))
    .join(" ");
}
