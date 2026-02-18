import {
    DescribeTasksCommand,
    ECSClient,
    LaunchType,
    ListTaskDefinitionsCommand,
    RunTaskCommand,
    RunTaskCommandInput,
    SortOrder,
} from "@aws-sdk/client-ecs";

type TaskArn = string;
type SubnetId = string;
type SecurityGroupId = string;

export interface EcsRunnerConfig {
    cluster: string;
    taskDefinition: string;
    subnets: SubnetId[];
    securityGroups: SecurityGroupId[];
    container: string;
}

export interface EcsRunResult {
    success: boolean;
    exitCode: number;
    taskArn: string;
    cloudwatchUrl: string;
}

export class EcsRunner {
    private readonly ecsClient: ECSClient;
    private readonly config: EcsRunnerConfig;
    private readonly checkIntervalMs: number;

    constructor(
        config: EcsRunnerConfig,
        ecsClient?: ECSClient,
        checkIntervalMs: number = 10000
    ) {
        this.config = config;
        this.checkIntervalMs = checkIntervalMs;
        this.ecsClient = ecsClient || new ECSClient({ region: "us-west-2" });
    }

    private async getLatestTaskDefinition(): Promise<string> {
        const listDefinitionsCommand = new ListTaskDefinitionsCommand({
            familyPrefix: this.config.taskDefinition,
            sort: SortOrder.DESC,
            maxResults: 1
        });
        const taskDefinitions = await this.ecsClient.send(listDefinitionsCommand);

        if (taskDefinitions.taskDefinitionArns === undefined || taskDefinitions.taskDefinitionArns.length === 0) {
            throw Error(`Task definition ${this.config.taskDefinition} not found. Make sure the deployment includes the management role (include_management_role=true).`);
        }
        return taskDefinitions.taskDefinitionArns[0];
    }

    private async startTask(taskDefinitionArn: string, command: string[]): Promise<TaskArn> {
        const runTaskInput: RunTaskCommandInput = {
            cluster: this.config.cluster,
            taskDefinition: taskDefinitionArn,
            count: 1,
            networkConfiguration: {
                awsvpcConfiguration: {
                    subnets: this.config.subnets,
                    securityGroups: this.config.securityGroups,
                    assignPublicIp: "ENABLED"
                }
            },
            launchType: LaunchType.FARGATE,
            overrides: {
                containerOverrides: [{
                    name: this.config.container,
                    command: command,
                }]
            }
        };

        const runTaskCommand = new RunTaskCommand(runTaskInput);
        const runTaskResult = await this.ecsClient.send(runTaskCommand);

        if (runTaskResult.failures && runTaskResult.failures.length > 0) {
            console.log("Failed to start task: ", runTaskResult.failures);
            throw new Error(runTaskResult.failures[0].reason || "Failed to start ECS task");
        } else if (runTaskResult.tasks === undefined || runTaskResult.tasks.length === 0) {
            throw new Error("No tasks started");
        } else {
            if (runTaskResult.tasks[0].taskArn) {
                return runTaskResult.tasks[0].taskArn as TaskArn;
            } else {
                throw new Error("Task does not have ARN");
            }
        }
    }

    private async hasTaskFinished(taskArn: TaskArn): Promise<{ hasFinished: boolean; exitCode: number }> {
        const describeTaskCommand = new DescribeTasksCommand({
            cluster: this.config.cluster,
            tasks: [taskArn]
        });
        console.log(`Checking status on task ${taskArn}`);
        const describeTaskResult = await this.ecsClient.send(describeTaskCommand);

        if (describeTaskResult.failures && describeTaskResult.failures.length > 0) {
            console.log("Describe Task had failures");
            console.log(describeTaskResult.failures);
            return { hasFinished: true, exitCode: -1 };
        } else if (describeTaskResult.tasks === undefined || describeTaskResult.tasks.length === 0) {
            console.log("Describe Task had no tasks in response");
            return { hasFinished: true, exitCode: -1 };
        }

        const taskOfInterest = describeTaskResult.tasks[0];
        if (taskOfInterest.lastStatus !== "STOPPED") {
            console.log(`Task ${taskArn} is still running. Last Status is ${taskOfInterest.lastStatus}`);
            return { hasFinished: false, exitCode: -1 };
        }

        console.log(`Task ${taskArn} has stopped running. Last Status is ${taskOfInterest.lastStatus}`);

        const containersOfInterest = taskOfInterest.containers?.filter(c => c.name === this.config.container);
        if (containersOfInterest && containersOfInterest.length > 0) {
            const containerStatus = containersOfInterest[0];
            const exitCode = containerStatus.exitCode;
            console.log(`Task ${taskArn} exit code of ${this.config.container} is ${exitCode}`);
            return {
                hasFinished: true,
                exitCode: exitCode !== undefined ? exitCode : -99
            };
        }

        return { hasFinished: true, exitCode: -1 };
    }

    private getCloudwatchUrl(taskArn: string, environmentName: string): string {
        const taskId = taskArn.split('/').reverse()[0];
        return `https://us-west-2.console.aws.amazon.com/cloudwatch/home?region=us-west-2#logsV2:log-groups/log-group/$252Fecs$252F${environmentName}$252Flcv-management/log-events/lcv-management-task$252Flcv-management-task$252F${taskId}`;
    }

    public async runCommand(command: string[], environmentName: string): Promise<EcsRunResult> {
        console.log(`Starting ECS task for command: ${command.join(' ')}`);
        
        const taskDefinitionArn = await this.getLatestTaskDefinition();
        console.log(`Using task definition: ${taskDefinitionArn}`);

        const taskArn = await this.startTask(taskDefinitionArn, command);
        console.log(`Started task: ${taskArn}`);

        const cloudwatchUrl = this.getCloudwatchUrl(taskArn, environmentName);

        return new Promise<EcsRunResult>((resolve, reject) => {
            const intervalId = setInterval(async () => {
                try {
                    const result = await this.hasTaskFinished(taskArn);
                    if (result.hasFinished) {
                        console.log(`Task exited with code ${result.exitCode}`);
                        clearInterval(intervalId);
                        resolve({
                            success: result.exitCode === 0,
                            exitCode: result.exitCode,
                            taskArn: taskArn,
                            cloudwatchUrl: cloudwatchUrl
                        });
                    }
                } catch (e) {
                    clearInterval(intervalId);
                    reject(e);
                }
            }, this.checkIntervalMs);
        });
    }
}

// Default configuration for dev environment
export const DEV_ECS_CONFIG = {
    cluster: "dev-cluster",
    container: "lcv-management-task",
    // These are the public subnets in dev-vpc
    subnets: [
        "subnet-02ac5fd6e6b5a6ee7",
        "subnet-0c0b36cd27d50b44b"
    ],
    // Security group for ECS tasks in dev environment
    securityGroups: [
        "sg-076f53c81e8d0bc9f"  // dev-cluster-ecs-tasks
    ]
};

export function createEcsRunner(environmentName: string, ecsClient?: ECSClient): EcsRunner {
    return new EcsRunner({
        ...DEV_ECS_CONFIG,
        taskDefinition: `lcv-management-task-${environmentName}`
    }, ecsClient);
}
