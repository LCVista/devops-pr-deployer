import { handleSlashCommand } from "../src/slash_command";
import { TerraformCli } from "../src/tfc_cli";
import { GithubHelper, PullRequestInfo } from "../src/gh_helper";
import { TerraformS3Api } from "../src/s3_backend_api";
import { mockClient } from "aws-sdk-client-mock";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { ECSClient } from "@aws-sdk/client-ecs";
import { Readable } from 'stream';
import { sdkStreamMixin } from '@smithy/util-stream';

// Mock the ECS runner module
jest.mock("../src/ecs_runner", () => {
    const originalModule = jest.requireActual("../src/ecs_runner");
    return {
        ...originalModule,
        createEcsRunnerFromTerraform: jest.fn().mockImplementation((config) => ({
            runCommand: jest.fn().mockResolvedValue({
                success: true,
                exitCode: 0,
                taskArn: "arn:aws:ecs:us-west-2:123456789:task/dev-cluster/abc123def456",
                cloudwatchUrl: "https://us-west-2.console.aws.amazon.com/cloudwatch/..."
            })
        }))
    };
});

import { createEcsRunnerFromTerraform } from "../src/ecs_runner";

// Mock S3 client for TerraformS3Api
const s3Mock = mockClient(S3Client);
const existingVarsJson = JSON.stringify({
    "var1": {
        id: "id1",
        name: "var1",
        value: "val1"
    }
});

// ECS task config for successful deployment with management role
const validEcsTaskConfig = {
    cluster_name: "dev-cluster",
    task_definition: "lcv-management-task-j-testbranc",
    container_name: "lcv-management-task",
    subnets: ["subnet-02ac5fd6e6b5a6ee7", "subnet-0c0b36cd27d50b44b"],
    security_groups: ["sg-076f53c81e8d0bc9f"],
    management_role_enabled: true
};

// ECS task config for deployment WITHOUT management role
const noManagementRoleEcsTaskConfig = {
    cluster_name: "dev-cluster",
    task_definition: null,
    container_name: "",
    subnets: ["subnet-02ac5fd6e6b5a6ee7", "subnet-0c0b36cd27d50b44b"],
    security_groups: ["sg-076f53c81e8d0bc9f"],
    management_role_enabled: false
};

// Mock exec function for terraform commands
let mockExec = jest.fn((cmd: string): Buffer => {
    if (cmd.indexOf("init") >= 0) {
        return Buffer.from("init");
    } else if (cmd.indexOf("output") >= 0 && cmd.indexOf("environment_name") >= 0) {
        return Buffer.from("j-testbranc");
    } else if (cmd.indexOf("output") >= 0 && cmd.indexOf("db_name") >= 0) {
        return Buffer.from("weaver");
    } else if (cmd.indexOf("output") >= 0 && cmd.indexOf("ecs_task_config") >= 0) {
        return Buffer.from(JSON.stringify(validEcsTaskConfig));
    } else if (cmd.indexOf("output") >= 0) {
        return Buffer.from("output");
    } else {
        return Buffer.from("succeeded");
    }
});

// Mock exec that returns error for outputs (no deployment)
let mockExecNoDeployment = jest.fn((cmd: string): Buffer => {
    if (cmd.indexOf("init") >= 0) {
        return Buffer.from("init");
    } else if (cmd.indexOf("output") >= 0) {
        throw new Error("No outputs found. The configuration has no outputs or the state is empty.");
    } else {
        return Buffer.from("succeeded");
    }
});

// Mock exec that returns deployment WITHOUT management role
let mockExecNoManagementRole = jest.fn((cmd: string): Buffer => {
    if (cmd.indexOf("init") >= 0) {
        return Buffer.from("init");
    } else if (cmd.indexOf("output") >= 0 && cmd.indexOf("environment_name") >= 0) {
        return Buffer.from("j-testbranc");
    } else if (cmd.indexOf("output") >= 0 && cmd.indexOf("db_name") >= 0) {
        return Buffer.from("weaver");
    } else if (cmd.indexOf("output") >= 0 && cmd.indexOf("ecs_task_config") >= 0) {
        return Buffer.from(JSON.stringify(noManagementRoleEcsTaskConfig));
    } else if (cmd.indexOf("output") >= 0) {
        return Buffer.from("output");
    } else {
        return Buffer.from("succeeded");
    }
});

let mockOctokit = {
    rest: {
        reactions: {
            createForIssueComment: jest.fn(async (params: {
                owner: string,
                repo: string,
                comment_id: number,
                content: string
            }) => {
                return Promise.resolve({
                    data: {
                        "data": "",
                        "id": params.comment_id,
                        "node_id": "MDg6UmVhY3Rpb24x",
                        "content": params.content,
                        "created_at": "2016-05-20T20:09:31Z"
                    }
                });
            })
        },
        issues: {
            createComment: jest.fn((params: {
                owner: string,
                repo: string,
                issue_number: number,
                body: string,
            }) => {
                return Promise.resolve({
                    data: {
                        id: 99
                    }
                });
            })
        }
    }
};

let mockedGithubHelper: GithubHelper;

beforeEach(() => {
    jest.clearAllMocks();
    s3Mock.reset();

    mockOctokit.rest.reactions.createForIssueComment.mockClear();
    mockOctokit.rest.issues.createComment.mockClear();

    mockedGithubHelper = new GithubHelper(mockOctokit, "unit_test_owner", "unit_test_repo", 1);

    s3Mock.on(GetObjectCommand).callsFake((_input) => {
        const stream = new Readable();
        stream.push(existingVarsJson);
        stream.push(null);
        return { Body: sdkStreamMixin(stream) };
    });

    // Reset the mock for createEcsRunnerFromTerraform
    (createEcsRunnerFromTerraform as jest.Mock).mockImplementation((config) => ({
        runCommand: jest.fn().mockResolvedValue({
            success: true,
            exitCode: 0,
            taskArn: "arn:aws:ecs:us-west-2:123456789:task/dev-cluster/abc123def456",
            cloudwatchUrl: "https://us-west-2.console.aws.amazon.com/cloudwatch/..."
        })
    }));
});

describe('Sync Jurisdictions', () => {

    test('handle /sync-jurisdictions with valid deployment', async () => {
        const mockedTfS3Api = await TerraformS3Api.build(
            "test_workspace",
            "test-s3-bucket",
        );
        const mockedTerraformCli = new TerraformCli(mockedTfS3Api, mockExec);

        const prInfo: PullRequestInfo = {
            branch: "test-branch",
            sha1: "abc1234"
        };
        const command = "/sync-jurisdictions texas";
        const commentId = 534;

        await handleSlashCommand(
            mockedTfS3Api,
            mockedTerraformCli,
            mockedGithubHelper,
            prInfo,
            commentId,
            command
        );

        // Assert reactions
        expect(mockOctokit.rest.reactions.createForIssueComment.mock.calls.length).toBe(2);
        expect(mockOctokit.rest.reactions.createForIssueComment.mock.calls[0][0].content).toBe("eyes");
        expect(mockOctokit.rest.reactions.createForIssueComment.mock.calls[1][0].content).toBe("rocket");

        // Assert terraform commands
        expect(mockExec.mock.calls[0][0]).toContain("terraform init");
        expect(mockExec.mock.calls[1][0]).toContain("terraform output");
        expect(mockExec.mock.calls[1][0]).toContain("environment_name");
        expect(mockExec.mock.calls[2][0]).toContain("terraform output");
        expect(mockExec.mock.calls[2][0]).toContain("db_name");
        expect(mockExec.mock.calls[3][0]).toContain("terraform output");
        expect(mockExec.mock.calls[3][0]).toContain("ecs_task_config");

        // Assert ECS runner was called with correct config from terraform
        expect(createEcsRunnerFromTerraform).toHaveBeenCalledWith(validEcsTaskConfig);
        const mockRunner = (createEcsRunnerFromTerraform as jest.Mock).mock.results[0].value;
        expect(mockRunner.runCommand).toHaveBeenCalledWith(
            ["./entrypoint.sh", "execute-command", "sync_jurisdictions", "weaver", "texas"],
            "j-testbranc"
        );

        // Assert comments
        expect(mockOctokit.rest.issues.createComment.mock.calls.length).toBe(2);
        expect(mockOctokit.rest.issues.createComment.mock.calls[0][0].body).toContain("Starting jurisdiction sync");
        expect(mockOctokit.rest.issues.createComment.mock.calls[0][0].body).toContain("texas");
        expect(mockOctokit.rest.issues.createComment.mock.calls[1][0].body).toContain("Successfully synced");
    });

    test('handle /sync-jurisdictions without deployment shows error', async () => {
        const mockedTfS3Api = await TerraformS3Api.build(
            "test_workspace",
            "test-s3-bucket",
        );
        const mockedTerraformCli = new TerraformCli(mockedTfS3Api, mockExecNoDeployment);

        const prInfo: PullRequestInfo = {
            branch: "test-branch",
            sha1: "abc1234"
        };
        const command = "/sync-jurisdictions texas";
        const commentId = 534;

        await expect(handleSlashCommand(
            mockedTfS3Api,
            mockedTerraformCli,
            mockedGithubHelper,
            prInfo,
            commentId,
            command
        )).rejects.toThrow("No deployment found");

        // Assert ECS runner was NOT called
        expect(createEcsRunnerFromTerraform).not.toHaveBeenCalled();
    });

    test('handle /sync-jurisdictions without jurisdiction directory throws error', async () => {
        const mockedTfS3Api = await TerraformS3Api.build(
            "test_workspace",
            "test-s3-bucket",
        );
        const mockedTerraformCli = new TerraformCli(mockedTfS3Api, mockExec);

        const prInfo: PullRequestInfo = {
            branch: "test-branch",
            sha1: "abc1234"
        };
        const command = "/sync-jurisdictions";
        const commentId = 534;

        await expect(handleSlashCommand(
            mockedTfS3Api,
            mockedTerraformCli,
            mockedGithubHelper,
            prInfo,
            commentId,
            command
        )).rejects.toThrow("Missing required jurisdiction directory");

        // Assert ECS runner was NOT called
        expect(createEcsRunnerFromTerraform).not.toHaveBeenCalled();
    });

    test('handle /sync-jurisdictions with ECS task failure', async () => {
        // Mock ECS runner to fail
        (createEcsRunnerFromTerraform as jest.Mock).mockImplementation((config) => ({
            runCommand: jest.fn().mockResolvedValue({
                success: false,
                exitCode: 1,
                taskArn: "arn:aws:ecs:us-west-2:123456789:task/dev-cluster/abc123def456",
                cloudwatchUrl: "https://us-west-2.console.aws.amazon.com/cloudwatch/..."
            })
        }));

        const mockedTfS3Api = await TerraformS3Api.build(
            "test_workspace",
            "test-s3-bucket",
        );
        const mockedTerraformCli = new TerraformCli(mockedTfS3Api, mockExec);

        const prInfo: PullRequestInfo = {
            branch: "test-branch",
            sha1: "abc1234"
        };
        const command = "/sync-jurisdictions texas";
        const commentId = 534;

        await expect(handleSlashCommand(
            mockedTfS3Api,
            mockedTerraformCli,
            mockedGithubHelper,
            prInfo,
            commentId,
            command
        )).rejects.toThrow("Jurisdiction sync failed with exit code 1");
    });

    test('handle /sync-jurisdictions without management role shows error', async () => {
        const mockedTfS3Api = await TerraformS3Api.build(
            "test_workspace",
            "test-s3-bucket",
        );
        const mockedTerraformCli = new TerraformCli(mockedTfS3Api, mockExecNoManagementRole);

        const prInfo: PullRequestInfo = {
            branch: "test-branch",
            sha1: "abc1234"
        };
        const command = "/sync-jurisdictions texas";
        const commentId = 534;

        await expect(handleSlashCommand(
            mockedTfS3Api,
            mockedTerraformCli,
            mockedGithubHelper,
            prInfo,
            commentId,
            command
        )).rejects.toThrow("include_management_role=true");

        // Assert ECS runner was NOT called
        expect(createEcsRunnerFromTerraform).not.toHaveBeenCalled();
    });
});
