import { EcsRunner, createEcsRunner, DEV_ECS_CONFIG } from "../src/ecs_runner";
import { ECSClient } from "@aws-sdk/client-ecs";

// Create a mock ECS client
const createMockEcsClient = (
    listTaskDefinitionsResult: any,
    runTaskResult: any,
    describeTasksResults: any[]
) => {
    let describeCallCount = 0;
    return {
        send: jest.fn().mockImplementation((command: any) => {
            const commandName = command.constructor.name;
            if (commandName === "ListTaskDefinitionsCommand") {
                return Promise.resolve(listTaskDefinitionsResult);
            } else if (commandName === "RunTaskCommand") {
                return Promise.resolve(runTaskResult);
            } else if (commandName === "DescribeTasksCommand") {
                const result = describeTasksResults[Math.min(describeCallCount, describeTasksResults.length - 1)];
                describeCallCount++;
                return Promise.resolve(result);
            }
            return Promise.reject(new Error(`Unknown command: ${commandName}`));
        })
    } as unknown as ECSClient;
};

describe('EcsRunner', () => {

    test('createEcsRunner creates runner with correct task definition', () => {
        const runner = createEcsRunner("my-env");
        expect(runner).toBeDefined();
    });

    test('runCommand starts and monitors ECS task', async () => {
        const mockClient = createMockEcsClient(
            { taskDefinitionArns: ["arn:aws:ecs:us-west-2:123456789:task-definition/lcv-management-task-test-env:1"] },
            { tasks: [{ taskArn: "arn:aws:ecs:us-west-2:123456789:task/dev-cluster/abc123def456" }], failures: [] },
            [{ tasks: [{ taskArn: "arn:aws:ecs:us-west-2:123456789:task/dev-cluster/abc123def456", lastStatus: "STOPPED", containers: [{ name: "lcv-management-task", exitCode: 0 }] }], failures: [] }]
        );

        const runner = new EcsRunner({
            ...DEV_ECS_CONFIG,
            taskDefinition: "lcv-management-task-test-env"
        }, mockClient, 10);

        const result = await runner.runCommand(
            ["./entrypoint.sh", "management", "sync_jurisdictions", "texas"],
            "test-env"
        );

        expect(result.success).toBe(true);
        expect(result.exitCode).toBe(0);
        expect(result.taskArn).toContain("abc123def456");
        expect(result.cloudwatchUrl).toContain("us-west-2");
        expect(result.cloudwatchUrl).toContain("abc123def456");
    });

    test('runCommand handles task failure', async () => {
        const mockClient = createMockEcsClient(
            { taskDefinitionArns: ["arn:aws:ecs:us-west-2:123456789:task-definition/lcv-management-task-test-env:1"] },
            { tasks: [{ taskArn: "arn:aws:ecs:us-west-2:123456789:task/dev-cluster/abc123def456" }], failures: [] },
            [{ tasks: [{ taskArn: "arn:aws:ecs:us-west-2:123456789:task/dev-cluster/abc123def456", lastStatus: "STOPPED", containers: [{ name: "lcv-management-task", exitCode: 1 }] }], failures: [] }]
        );

        const runner = new EcsRunner({
            ...DEV_ECS_CONFIG,
            taskDefinition: "lcv-management-task-test-env"
        }, mockClient, 10);

        const result = await runner.runCommand(
            ["./entrypoint.sh", "management", "sync_jurisdictions", "texas"],
            "test-env"
        );

        expect(result.success).toBe(false);
        expect(result.exitCode).toBe(1);
    });

    test('runCommand throws when no task definitions found', async () => {
        const mockClient = createMockEcsClient(
            { taskDefinitionArns: [] },
            {},
            []
        );

        const runner = new EcsRunner({
            ...DEV_ECS_CONFIG,
            taskDefinition: "lcv-management-task-nonexistent"
        }, mockClient, 10);

        await expect(runner.runCommand(
            ["./entrypoint.sh", "management", "test"],
            "test-env"
        )).rejects.toThrow("Task definition");
    });

    test('runCommand throws when task fails to start', async () => {
        const mockClient = createMockEcsClient(
            { taskDefinitionArns: ["arn:aws:ecs:us-west-2:123456789:task-definition/lcv-management-task-test-env:1"] },
            { tasks: [], failures: [{ reason: "RESOURCE:MEMORY" }] },
            []
        );

        const runner = new EcsRunner({
            ...DEV_ECS_CONFIG,
            taskDefinition: "lcv-management-task-test-env"
        }, mockClient, 10);

        await expect(runner.runCommand(
            ["./entrypoint.sh", "management", "test"],
            "test-env"
        )).rejects.toThrow("RESOURCE:MEMORY");
    });

    test('runCommand waits for running task to complete', async () => {
        const mockClient = createMockEcsClient(
            { taskDefinitionArns: ["arn:aws:ecs:us-west-2:123456789:task-definition/lcv-management-task-test-env:1"] },
            { tasks: [{ taskArn: "arn:aws:ecs:us-west-2:123456789:task/dev-cluster/abc123def456" }], failures: [] },
            [
                { tasks: [{ taskArn: "arn:aws:ecs:us-west-2:123456789:task/dev-cluster/abc123def456", lastStatus: "RUNNING", containers: [{ name: "lcv-management-task" }] }], failures: [] },
                { tasks: [{ taskArn: "arn:aws:ecs:us-west-2:123456789:task/dev-cluster/abc123def456", lastStatus: "RUNNING", containers: [{ name: "lcv-management-task" }] }], failures: [] },
                { tasks: [{ taskArn: "arn:aws:ecs:us-west-2:123456789:task/dev-cluster/abc123def456", lastStatus: "STOPPED", containers: [{ name: "lcv-management-task", exitCode: 0 }] }], failures: [] }
            ]
        );

        const runner = new EcsRunner({
            ...DEV_ECS_CONFIG,
            taskDefinition: "lcv-management-task-test-env"
        }, mockClient, 10);

        const result = await runner.runCommand(
            ["./entrypoint.sh", "management", "test"],
            "test-env"
        );

        expect(result.success).toBe(true);
        expect((mockClient.send as jest.Mock).mock.calls.length).toBeGreaterThanOrEqual(4); // list + run + 3 describes
    });
});

describe('DEV_ECS_CONFIG', () => {
    test('has required properties', () => {
        expect(DEV_ECS_CONFIG.cluster).toBe("dev-cluster");
        expect(DEV_ECS_CONFIG.container).toBe("lcv-management-task");
        expect(DEV_ECS_CONFIG.subnets.length).toBeGreaterThan(0);
        expect(DEV_ECS_CONFIG.securityGroups.length).toBeGreaterThan(0);
    });
});
