/**
 * Parses Terraform output and extracts a human-readable error summary.
 * Filters out verbose state reading/creation logs and execution plans.
 */

export interface ParsedTerraformError {
    /** The main error message extracted from Terraform output */
    summary: string;
    /** The resource that caused the error (if identifiable) */
    resource?: string;
    /** Additional context about the error */
    details?: string;
}

/**
 * Extracts a human-readable error message from verbose Terraform output.
 * 
 * @param rawOutput - The full stderr/stdout from a failed Terraform command
 * @returns A simplified, human-readable error message
 */
export function parseTerraformError(rawOutput: string): string {
    const parsed = extractTerraformError(rawOutput);
    return formatTerraformError(parsed);
}

/**
 * Extracts structured error information from Terraform output.
 */
export function extractTerraformError(rawOutput: string): ParsedTerraformError {
    const lines = rawOutput.split('\n');
    
    // Look for the main error line (starts with "Error:")
    let errorLineIndex = -1;
    let errorMessage = '';
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.startsWith('Error:')) {
            errorLineIndex = i;
            errorMessage = line.substring(6).trim();
            break;
        }
    }
    
    if (errorLineIndex === -1) {
        // No standard error format found, try to find any meaningful error
        return {
            summary: findFallbackError(rawOutput)
        };
    }
    
    // Extract resource information (usually in "with <resource>" line)
    let resource: string | undefined;
    let details: string | undefined;
    const contextLines: string[] = [];
    
    for (let i = errorLineIndex + 1; i < Math.min(errorLineIndex + 10, lines.length); i++) {
        const line = lines[i].trim();
        
        if (line.startsWith('with ')) {
            resource = line.substring(5).replace(/,$/, '').trim();
        } else if (line.startsWith('on ') && line.includes(' line ')) {
            // Skip file location lines - not useful for end users
            continue;
        } else if (line.match(/^\d+:/)) {
            // Skip source code reference lines
            continue;
        } else if (line.startsWith('Error:')) {
            // Skip duplicate error lines
            continue;
        } else if (line.length > 0 && !line.startsWith('module.') && !line.match(/^[\s]*$/) && !line.includes('I received an error')) {
            contextLines.push(line);
        }
        
        // Stop if we hit another error or empty section
        if (line === '' && contextLines.length > 0) {
            break;
        }
    }
    
    // Filter out details that are just duplicates of the summary
    const filteredContextLines = contextLines.filter(line => 
        !errorMessage.includes(line) && !line.includes(errorMessage.substring(0, 50))
    );
    
    if (filteredContextLines.length > 0) {
        details = filteredContextLines.slice(0, 3).join(' ');
    }
    
    return {
        summary: errorMessage,
        resource,
        details
    };
}

/**
 * Formats a parsed error into a human-readable message.
 */
export function formatTerraformError(parsed: ParsedTerraformError): string {
    let message = `**Error:** ${parsed.summary}`;
    
    if (parsed.resource) {
        // Simplify resource name for readability
        const simplifiedResource = simplifyResourceName(parsed.resource);
        message += `\n\n**Resource:** \`${simplifiedResource}\``;
    }
    
    if (parsed.details) {
        message += `\n\n**Details:** ${parsed.details}`;
    }
    
    // Add helpful tips based on common error patterns
    const tips = getErrorTips(parsed.summary);
    if (tips) {
        message += `\n\n**💡 Tip:** ${tips}`;
    }
    
    return message;
}

/**
 * Simplifies Terraform resource names for readability.
 * e.g., "module.pr.module.lcv.aws_ecs_service.lcv_web_service" -> "lcv_web_service (ECS Service)"
 */
function simplifyResourceName(resource: string): string {
    const parts = resource.split('.');
    const resourceType = parts.length >= 2 ? parts[parts.length - 2] : '';
    const resourceName = parts[parts.length - 1];
    
    // Map AWS resource types to friendly names
    const typeMap: { [key: string]: string } = {
        'aws_ecs_service': 'ECS Service',
        'aws_ecs_task_definition': 'ECS Task',
        'aws_lb': 'Load Balancer',
        'aws_lb_target_group': 'Target Group',
        'aws_rds_cluster': 'RDS Cluster',
        'aws_db_instance': 'Database',
        'aws_s3_bucket': 'S3 Bucket',
        'aws_security_group': 'Security Group',
        'aws_route53_record': 'DNS Record',
        'aws_acm_certificate': 'SSL Certificate',
    };
    
    const friendlyType = typeMap[resourceType] || resourceType.replace(/^aws_/, '').replace(/_/g, ' ');
    
    if (friendlyType) {
        return `${resourceName} (${friendlyType})`;
    }
    return resourceName;
}

/**
 * Provides helpful tips based on common error patterns.
 */
function getErrorTips(errorMessage: string): string | null {
    const lowerMessage = errorMessage.toLowerCase();
    
    if (lowerMessage.includes('timeout') && (lowerMessage.includes('ecs') || lowerMessage.includes('service'))) {
        return 'ECS service failed to stabilize. This often happens when the container fails health checks. Check the ECS task logs in CloudWatch for more details.';
    }
    
    if (lowerMessage.includes('timeout') && (lowerMessage.includes('rds') || lowerMessage.includes('database'))) {
        return 'Database creation/modification timed out. This can happen with large databases. Try running `/deploy` again.';
    }
    
    if (lowerMessage.includes('alreadyexists') || lowerMessage.includes('already exists') || lowerMessage.includes('already exist')) {
        return 'The resource already exists. Try running `/destroy` first, then `/deploy` again.';
    }
    
    if (lowerMessage.includes('access denied') || lowerMessage.includes('accessdenied') || lowerMessage.includes('not authorized')) {
        return 'Permission denied. Check that the deployment role has the required permissions.';
    }
    
    if (lowerMessage.includes('quota') || lowerMessage.includes('limit exceeded') || lowerMessage.includes('limitexceeded')) {
        return 'AWS service quota exceeded. Contact the platform team to request a quota increase.';
    }
    
    if (lowerMessage.includes('dependencyviolation') || lowerMessage.includes('dependency violation') || lowerMessage.includes('has a dependent object')) {
        return 'Resource has dependencies that must be deleted first. Try running `/destroy` again - AWS may need time to clean up dependent resources. If the issue persists, check the AWS console for lingering resources.';
    }
    
    return null;
}

/**
 * Attempts to find a meaningful error message when standard parsing fails.
 */
function findFallbackError(rawOutput: string): string {
    // Look for common error patterns
    const patterns = [
        /failed to [\w\s]+: (.+)/i,
        /cannot [\w\s]+: (.+)/i,
        /unable to [\w\s]+: (.+)/i,
        /error [\w\s]+: (.+)/i,
    ];
    
    for (const pattern of patterns) {
        const match = rawOutput.match(pattern);
        if (match) {
            return match[0];
        }
    }
    
    // Last resort: return a generic message with truncated output
    const truncatedLength = 500;
    if (rawOutput.length > truncatedLength) {
        return `Terraform command failed. Output truncated:\n...${rawOutput.slice(-truncatedLength)}`;
    }
    
    return rawOutput || 'Terraform command failed with no output';
}
