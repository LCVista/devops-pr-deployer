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

/**
 * Configuration from terraform output "ecs_task_config"
 * This is the structure exported by aws-infrastructure/modules/lcv-dev-env
 */
export interface TerraformEcsTaskConfig {
    cluster_name: string;
    task_definition: string | null;
    container_name: string;
    subnets: string[];
    security_groups: string[];
    management_role_enabled: boolean;
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
        console.log(`Looking up task definition with family prefix: ${this.config.taskDefinition}`);
        const listDefinitionsCommand = new ListTaskDefinitionsCommand({
            familyPrefix: this.config.taskDefinition,
            sort: SortOrder.DESC,
            maxResults: 1
        });
        console.log(`Sending ListTaskDefinitionsCommand...`);
        const taskDefinitions = await this.ecsClient.send(listDefinitionsCommand);
        console.log(`ListTaskDefinitionsCommand response: ${JSON.stringify(taskDefinitions.taskDefinitionArns)}`);

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
                } catch (e: any) {
                    console.log(`Error checking task status: ${e?.message || e}`);
                    console.log(`Error stack: ${e?.stack || 'no stack'}`);
                    clearInterval(intervalId);
                    reject(e);
                }
            }, this.checkIntervalMs);
        });
    }
}

/**
 * Create an EcsRunner from terraform ecs_task_config output.
 * The terraform config uses snake_case, this converts to the internal config format.
 *
 * @throws Error if task_definition is null (management role not enabled)
 */
export function createEcsRunnerFromTerraform(terraformConfig: TerraformEcsTaskConfig, ecsClient?: ECSClient): EcsRunner {
    if (!terraformConfig.task_definition) {
        throw new Error("ECS task definition not available - management role may not be enabled");
    }

    return new EcsRunner({
        cluster: terraformConfig.cluster_name,
        taskDefinition: terraformConfig.task_definition,
        container: terraformConfig.container_name,
        subnets: terraformConfig.subnets,
        securityGroups: terraformConfig.security_groups,
    }, ecsClient);
}
