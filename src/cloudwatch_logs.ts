import {
    CloudWatchLogsClient,
    GetLogEventsCommand,
} from "@aws-sdk/client-cloudwatch-logs";


/**
 * Fetch CloudWatch logs for a failed ECS task and return a single-line error
 * summary suitable for embedding in a GitHub PR comment.
 *
 * Waits a few seconds for log delivery, pulls the last 100 log events, then
 * extracts the final Python traceback exception line.  If no traceback is
 * found it falls back to the last ERROR/FATAL line, or the very last log line.
 *
 * Errors are caught internally so callers never need to handle failures here.
 */
export async function fetchLastLogError(
    taskArn: string,
    environmentName: string,
): Promise<string> {
    try {
        // Small delay so CloudWatch has time to ingest the final events
        await new Promise(resolve => setTimeout(resolve, 5000));

        const lines = await fetchCloudwatchLogs(taskArn, environmentName);
        return getLastLogError(lines);
    } catch (e: any) {
        console.log(`Failed to retrieve CloudWatch logs: ${e?.message || e}`);
        return "(Could not retrieve logs automatically)";
    }
}


/**
 * Fetch the last N log events from a CloudWatch log stream for an ECS task.
 */
export async function fetchCloudwatchLogs(
    taskArn: string,
    environmentName: string,
    limit: number = 100,
): Promise<string[]> {
    const taskId = taskArn.split("/").pop() ?? "";
    const logGroup = `/ecs/${environmentName}/lcv-management`;
    const logStream = `lcv-management-task/lcv-management-task/${taskId}`;

    const client = new CloudWatchLogsClient({ region: "us-west-2" });
    const response = await client.send(
        new GetLogEventsCommand({
            logGroupName: logGroup,
            logStreamName: logStream,
            startFromHead: false,
            limit,
        }),
    );

    return (response.events ?? []).map(e => e.message?.trimEnd() ?? "");
}


/**
 * Given an array of log lines, return the most useful single-line error
 * summary: the last Python traceback exception, or the last ERROR/FATAL line,
 * or the last line of output.
 */
export function getLastLogError(lines: string[]): string {
    if (lines.length === 0) return "(no log output captured)";

    // Look for the last Python traceback and return its final line
    let lastTracebackIdx = -1;
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes("Traceback (most recent call last)")) {
            lastTracebackIdx = i;
        }
    }
    if (lastTracebackIdx >= 0) {
        // Walk forward past indented "  File …" / "    code" lines to the
        // exception line (the first non-indented line after the traceback header).
        for (let i = lastTracebackIdx + 1; i < lines.length; i++) {
            if (lines[i].length > 0 && !lines[i].startsWith(" ")) {
                return lines[i];
            }
        }
    }

    // Fall back to last ERROR or FATAL line
    for (let i = lines.length - 1; i >= 0; i--) {
        if (/\b(ERROR|FATAL)\b/.test(lines[i])) {
            return lines[i];
        }
    }

    // Last resort: return the last non-empty line
    return lines[lines.length - 1] || "(no log output captured)";
}
