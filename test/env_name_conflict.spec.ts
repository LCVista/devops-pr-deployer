import {
    computeEnvPrefix,
    findConflictingBranches,
} from '../src/env_name_conflict';

describe('env_name_conflict', () => {
    describe('computeEnvPrefix', () => {
        it('should truncate and lowercase the branch name', () => {
            expect(computeEnvPrefix('JUR-1998-new-hampshire-cle', 11)).toBe('jur-1998-ne');
        });

        it('should produce the same prefix for colliding branches', () => {
            const a = computeEnvPrefix('JUR-1998-new-hampshire-cle', 11);
            const b = computeEnvPrefix('JUR-1998-new-jurisdiction', 11);
            expect(a).toBe(b);
            expect(a).toBe('jur-1998-ne');
        });

        it('should trim trailing hyphens and spaces', () => {
            expect(computeEnvPrefix('abc-def-ghi', 4)).toBe('abc');
            expect(computeEnvPrefix('abc- ', 5)).toBe('abc');
        });

        it('should trim leading hyphens and spaces', () => {
            expect(computeEnvPrefix('--abc', 5)).toBe('abc');
            expect(computeEnvPrefix(' -abc', 5)).toBe('abc');
        });

        it('should handle branches shorter than the truncation length', () => {
            expect(computeEnvPrefix('short', 11)).toBe('short');
        });

        it('should handle empty branch name', () => {
            expect(computeEnvPrefix('', 11)).toBe('');
        });

        it('should replicate lcv pr-env.tf formula (substr 10)', () => {
            const a = computeEnvPrefix('Chessling-patch-1', 10);
            const b = computeEnvPrefix('Chessling-patch-2', 10);
            expect(a).toBe(b);
            expect(a).toBe('chessling');
        });

        it('should replicate lcv-jurisdictions pr-env.tf formula (substr 11)', () => {
            const a = computeEnvPrefix('7046-mi-req-limit', 11);
            const b = computeEnvPrefix('7046-mi-requirement-sub-limit', 11);
            expect(a).toBe(b);
            expect(a).toBe('7046-mi-req');
        });
    });

    describe('findConflictingBranches', () => {
        it('should detect conflicts between JUR-1998 branches at length 11', () => {
            const conflicts = findConflictingBranches(
                'JUR-1998-new-hampshire-cle',
                ['JUR-1998-new-jurisdiction', 'JUR-2003-new-jurisdiction', 'some-other-branch'],
                11,
            );
            expect(conflicts).toEqual(['JUR-1998-new-jurisdiction']);
        });

        it('should detect conflicts between Chessling-patch branches at length 10', () => {
            const conflicts = findConflictingBranches(
                'Chessling-patch-1',
                ['Chessling-patch-2', 'Chessling-patch-3', 'different-branch'],
                10,
            );
            expect(conflicts).toContain('Chessling-patch-2');
            expect(conflicts).toContain('Chessling-patch-3');
            expect(conflicts).not.toContain('different-branch');
        });

        it('should detect conflicts between CP-187-rsm branches at length 10', () => {
            const conflicts = findConflictingBranches(
                'CP-187-rsm-sandbox',
                ['CP-187-rsm', 'CP-187-danielle'],
                10,
            );
            expect(conflicts).toEqual(['CP-187-rsm']);
        });

        it('should return empty when no conflicts exist', () => {
            const conflicts = findConflictingBranches(
                'unique-branch-name',
                ['different-branch', 'another-one'],
                10,
            );
            expect(conflicts).toEqual([]);
        });

        it('should not conflict with itself', () => {
            const conflicts = findConflictingBranches(
                'my-branch',
                ['my-branch', 'other-branch'],
                10,
            );
            expect(conflicts).toEqual([]);
        });
    });
});
