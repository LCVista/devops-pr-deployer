import fs from 'fs';
import path from 'path';
import { parseTerraformError, extractTerraformError, formatTerraformError } from '../src/terraform_error_parser';

const FIXTURES_DIR = path.join(__dirname, 'fixtures', 'terraform-errors');

/**
 * Helper function to load a fixture file
 */
function loadFixture(filename: string): string {
    return fs.readFileSync(path.join(FIXTURES_DIR, filename), 'utf-8');
}

describe('terraform_error_parser', () => {
    describe('parseTerraformError with fixture files', () => {
        it('should parse ECS service timeout error', () => {
            const rawOutput = loadFixture('ecs-service-timeout.txt');
            const result = parseTerraformError(rawOutput);
            
            expect(result).toContain('**Error:**');
            expect(result).toContain('timeout');
            expect(result).toContain('ECS Service');
            expect(result).toContain('lcv_web_service');
            expect(result).toContain('💡 Tip:');
            expect(result).toContain('health checks');
            // Should NOT contain the verbose reading lines
            expect(result).not.toContain('Reading...');
            expect(result).not.toContain('Read complete');
        });

        it('should parse S3 bucket already exists error', () => {
            const rawOutput = loadFixture('s3-bucket-already-exists.txt');
            const result = parseTerraformError(rawOutput);
            
            expect(result).toContain('**Error:**');
            expect(result).toContain('BucketAlreadyExists');
            expect(result).toContain('💡 Tip:');
            expect(result).toContain('/destroy');
        });

        it('should parse IAM access denied error', () => {
            const rawOutput = loadFixture('iam-access-denied.txt');
            const result = parseTerraformError(rawOutput);
            
            expect(result).toContain('**Error:**');
            expect(result).toContain('AccessDenied');
            expect(result).toContain('💡 Tip:');
            expect(result).toContain('Permission denied');
        });

        it('should parse RDS timeout error', () => {
            const rawOutput = loadFixture('rds-timeout.txt');
            const result = parseTerraformError(rawOutput);
            
            expect(result).toContain('**Error:**');
            expect(result).toContain('timeout');
            expect(result).toContain('💡 Tip:');
            expect(result).toContain('Database');
            // Should NOT contain verbose "Still creating" lines
            expect(result).not.toContain('Still creating');
        });

        it('should parse quota exceeded error', () => {
            const rawOutput = loadFixture('quota-exceeded.txt');
            const result = parseTerraformError(rawOutput);
            
            expect(result).toContain('**Error:**');
            expect(result).toContain('VcpuLimitExceeded');
            expect(result).toContain('💡 Tip:');
            expect(result).toContain('quota');
        });

        it('should parse security group dependency error', () => {
            const rawOutput = loadFixture('security-group-dependency.txt');
            const result = parseTerraformError(rawOutput);
            
            expect(result).toContain('**Error:**');
            expect(result).toContain('DependencyViolation');
            expect(result).toContain('Security Group');
        });

        it('should parse security group dependency error during destroy', () => {
            const rawOutput = loadFixture('destroy-run-21596936337.txt');
            const result = parseTerraformError(rawOutput);
            
            expect(result).toContain('**Error:**');
            expect(result).toContain('DependencyViolation');
            expect(result).toContain('💡 Tip:');
            expect(result).toContain('/destroy');
            // Should NOT contain verbose "Still destroying" lines
            expect(result).not.toContain('Still destroying');
            // Should NOT contain internal debug messages
            expect(result).not.toContain('I received an error');
        });

        it('should parse secrets manager not found error', () => {
            const rawOutput = loadFixture('apply-run-21594663273.txt');
            const result = parseTerraformError(rawOutput);
            
            expect(result).toContain('**Error:**');
            expect(result).toContain('Secrets Manager');
            expect(result).toContain('ResourceNotFoundException');
            // Should NOT contain verbose state reading lines
            expect(result).not.toContain('Reading...');
            expect(result).not.toContain('Read complete');
        });

        it('should parse provider not configured error', () => {
            const rawOutput = loadFixture('provider-not-configured.txt');
            const result = parseTerraformError(rawOutput);
            
            expect(result).toContain('**Error:**');
            expect(result).toContain('Provider configuration not found');
        });

        it('should parse invalid reference error', () => {
            const rawOutput = loadFixture('invalid-reference.txt');
            const result = parseTerraformError(rawOutput);
            
            expect(result).toContain('**Error:**');
            expect(result).toContain('undeclared resource');
        });
    });

    describe('parseTerraformError edge cases', () => {
        it('should handle output with no standard error format', () => {
            const rawOutput = `Something went wrong but no standard error format`;
            const result = parseTerraformError(rawOutput);
            
            expect(result).toContain('Something went wrong');
        });

        it('should truncate very long output when no error pattern found', () => {
            const longOutput = 'x'.repeat(1000);
            const result = parseTerraformError(longOutput);
            
            expect(result.length).toBeLessThan(700);
            expect(result).toContain('truncated');
        });

        it('should handle empty output', () => {
            const result = parseTerraformError('');
            
            expect(result).toContain('failed');
        });
    });

    describe('extractTerraformError', () => {
        it('should extract resource name from error', () => {
            const rawOutput = `
Error: timeout creating resource

  with module.pr.module.lcv.aws_ecs_service.lcv_web_service,
  on file.tf line 1
`;
            const result = extractTerraformError(rawOutput);
            
            expect(result.errors).toHaveLength(1);
            expect(result.errors[0].summary).toBe('timeout creating resource');
            expect(result.errors[0].resource).toBe('module.pr.module.lcv.aws_ecs_service.lcv_web_service');
        });

        it('should handle error without resource info', () => {
            const rawOutput = loadFixture('provider-not-configured.txt');
            const result = extractTerraformError(rawOutput);
            
            expect(result.errors).toHaveLength(1);
            expect(result.errors[0].summary).toBe('Provider configuration not found');
            expect(result.errors[0].resource).toBeUndefined();
        });

        it('should extract multiple errors from output', () => {
            const rawOutput = `
Error: first error message

  with module.pr.aws_s3_bucket.bucket1,
  on file.tf line 1

Error: second error message

  with module.pr.aws_ecs_service.service1,
  on file.tf line 10

Error: third error message

  on file.tf line 20
`;
            const result = extractTerraformError(rawOutput);
            
            expect(result.errors).toHaveLength(3);
            expect(result.errors[0].summary).toBe('first error message');
            expect(result.errors[0].resource).toBe('module.pr.aws_s3_bucket.bucket1');
            expect(result.errors[1].summary).toBe('second error message');
            expect(result.errors[1].resource).toBe('module.pr.aws_ecs_service.service1');
            expect(result.errors[2].summary).toBe('third error message');
            expect(result.errors[2].resource).toBeUndefined();
        });
    });

    describe('formatTerraformError', () => {
        it('should simplify AWS resource names', () => {
            const parsed = {
                summary: 'timeout error',
                resource: 'module.pr.module.lcv.aws_ecs_service.lcv_web_service'
            };
            const result = formatTerraformError(parsed);
            
            expect(result).toContain('lcv_web_service (ECS Service)');
        });

        it('should format error with details', () => {
            const parsed = {
                summary: 'creation failed',
                resource: 'aws_s3_bucket.my_bucket',
                details: 'bucket name already taken'
            };
            const result = formatTerraformError(parsed);
            
            expect(result).toContain('**Error:** creation failed');
            expect(result).toContain('**Resource:**');
            expect(result).toContain('**Details:** bucket name already taken');
        });
    });
});
