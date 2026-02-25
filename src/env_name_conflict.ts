/**
 * Detects PR environment name collisions caused by branch name truncation.
 *
 * PR environments derive a short environment name by truncating the git branch
 * name (e.g. `lower(substr(branch, 0, 11))`). When two branches share the
 * same truncated prefix they target the same AWS resources.
 */

/**
 * Replicate the Terraform environment-name computation:
 *   `trim(lower(substr(var.git_branch, 0, length)), " -")`
 */
export function computeEnvPrefix(branch: string, length: number): string {
    const truncated = branch.substring(0, length);
    const lowered = truncated.toLowerCase();
    return lowered.replace(/^[\s-]+|[\s-]+$/g, '');
}

/**
 * Find branches in `otherBranches` that collide with `currentBranch` at the
 * given `prefixLength`.
 */
export function findConflictingBranches(
    currentBranch: string,
    otherBranches: string[],
    prefixLength: number,
): string[] {
    const currentPrefix = computeEnvPrefix(currentBranch, prefixLength);
    if (!currentPrefix) return [];

    return otherBranches.filter(
        (other) =>
            other !== currentBranch &&
            computeEnvPrefix(other, prefixLength) === currentPrefix,
    );
}