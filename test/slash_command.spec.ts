import {handleSlashCommand} from "../src/slash_command";
import {TerraformCloudApi} from "../src/tfc_api";
import {TerraformCli} from "../src/tfc_cli";
import {getOctokit} from "@actions/github";
import {GithubHelper, PullRequestInfo} from "../src/gh_helper";
import {HELP_TEXT} from "../src/command_help";
import exp from "constants";
import { TerraformS3Api } from "../src/s3_backend_api";
import { mockClient } from "aws-sdk-client-mock";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { Readable } from 'stream';
import { sdkStreamMixin } from '@smithy/util-stream';


const existingVarsJson = JSON.stringify({
    "var1":  {
        id: "id1",
        name: "var1",
        value: "val1"
    }
});
const s3Mock = mockClient(S3Client);

let mockFetch = jest.fn( (url, opts): Promise<any> => {
    return Promise.resolve({
        ok: true,
        json: () => {
            return Promise.resolve({
                data: {
                    id: "id-33"
                }
            })
        }
    });
});

let mockGetExistingVars = () => {
    return Promise.resolve({
        "var1":  {
            id: "id1",
            name: "var1",
            value: "val1"
        }
    });
}

let mockExec = jest.fn( (cmd: string): Buffer => {
    if (cmd.indexOf("init") >= 0) {
        return new Buffer("init");
    } else if (cmd.indexOf("plan") >= 0){
        return new Buffer("plan applied");
    } else if (cmd.indexOf("output") >= 0) {
        return new Buffer(":::environment created:::");
    }
    else {
        return new Buffer("succeeded");
    }
});

let mockOctokit = {
    rest: {
        reactions: {
            createForIssueComment: jest.fn( async (params: {
                owner: string,
                repo: string,
                comment_id: number,
                content:  string
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
            }
            )
        },
        issues: {
            createComment: jest.fn( (params: {
                              owner: string,
                              repo: string,
                              issue_number: number,
                              body: string,
                          }) => {
                return Promise.resolve({
                        data: {
                            id: 99
                        }
                    }
                );
            }
            )
        }
    }
};
let mockedGithubHelper = new GithubHelper(mockOctokit, "unit_test_owner", "unit_test_repo", 1);

beforeEach(() => {
    s3Mock.reset();

    s3Mock.on(GetObjectCommand).callsFake((_input) => {
        const stream = new Readable();
        stream.push(existingVarsJson);
        stream.push(null); // end of stream
        return { Body: sdkStreamMixin(stream) };
    });
});

describe('[Terraform Cloud]', () => {
    let mockedTfcApi = new TerraformCloudApi("unit_test", "test_org", "test_workspace", undefined, mockFetch);
    jest.spyOn(mockedTfcApi, "getExistingVars").mockImplementation(mockGetExistingVars);

    let mockedTfcCli = new TerraformCli(mockedTfcApi, mockExec);

    test('handle /help', async () => {
        // Arrange
        const prInfo: PullRequestInfo = {
            branch: "",
            sha1: ""
        }
        const command = "/help"
        const commentId = 534

        // Act
        await handleSlashCommand(
            mockedTfcApi,
            mockedTfcCli,
            mockedGithubHelper,
            prInfo,
            commentId,
            command
        );

        // Assert
        expect(mockOctokit.rest.reactions.createForIssueComment.mock.calls.length).toBe(2);
        expect(mockOctokit.rest.reactions.createForIssueComment.mock.calls[0][0].content).toBe("eyes");
        expect(mockOctokit.rest.reactions.createForIssueComment.mock.calls[0][0].comment_id).toBe(commentId);
        expect(mockOctokit.rest.reactions.createForIssueComment.mock.calls[1][0].content).toBe("rocket");
        expect(mockOctokit.rest.reactions.createForIssueComment.mock.calls[1][0].comment_id).toBe(commentId);
        expect(mockOctokit.rest.issues.createComment.mock.calls.length).toBe(1);
        expect(mockOctokit.rest.issues.createComment.mock.calls[0][0].body).toContain(HELP_TEXT);
        expect(mockExec.mock.calls[0][0]).toContain("terraform init")
    });

    test('handle /deploy', async () => {
        // Arrange
        const prInfo: PullRequestInfo = {
            branch: "test-branch",
            sha1: "abc1234"
        }
        const command = "/deploy"
        const commentId = 534

        // Act
        await handleSlashCommand(
            mockedTfcApi,
            mockedTfcCli,
            mockedGithubHelper,
            prInfo,
            commentId,
            command
        );

        // Assert
        expect(mockOctokit.rest.reactions.createForIssueComment.mock.calls.length).toBe(2);
        expect(mockOctokit.rest.reactions.createForIssueComment.mock.calls[0][0].content).toBe("eyes");
        expect(mockOctokit.rest.reactions.createForIssueComment.mock.calls[0][0].comment_id).toBe(commentId);

        expect(mockExec.mock.calls[0][0]).toContain("terraform init")
        expect(mockExec.mock.calls[1][0]).toContain("terraform apply")

        expect(mockOctokit.rest.issues.createComment.mock.calls.length).toBe(1);
        expect(mockOctokit.rest.issues.createComment.mock.calls[0][0].body).toContain(":::environment created:::");

        expect(mockOctokit.rest.reactions.createForIssueComment.mock.calls[1][0].content).toBe("rocket");
        expect(mockOctokit.rest.reactions.createForIssueComment.mock.calls[1][0].comment_id).toBe(commentId);
    });

    test('handle /destroy', async () => {
        // Arrange
        const prInfo: PullRequestInfo = {
            branch: "test-branch",
            sha1: "abc1234"
        }
        const command = "/destroy"
        const commentId = 534

        // Act
        await handleSlashCommand(
            mockedTfcApi,
            mockedTfcCli,
            mockedGithubHelper,
            prInfo,
            commentId,
            command
        );

        // Assert
        expect(mockOctokit.rest.reactions.createForIssueComment.mock.calls.length).toBe(2);
        expect(mockOctokit.rest.reactions.createForIssueComment.mock.calls[0][0].content).toBe("eyes");
        expect(mockOctokit.rest.reactions.createForIssueComment.mock.calls[0][0].comment_id).toBe(commentId);

        expect(mockExec.mock.calls[0][0]).toContain("terraform init");
        expect(mockExec.mock.calls[1][0]).toContain("terraform destroy");
        expect(mockFetch.mock.calls[0][1].method).toBe('DELETE')

        expect(mockOctokit.rest.issues.createComment.mock.calls.length).toBe(1);
        expect(mockOctokit.rest.issues.createComment.mock.calls[0][0].body).toContain("deleted");

        expect(mockOctokit.rest.reactions.createForIssueComment.mock.calls[1][0].content).toBe("rocket");
        expect(mockOctokit.rest.reactions.createForIssueComment.mock.calls[1][0].comment_id).toBe(commentId);
    });
});

describe('Terraform S3', () => {
    test('handle /deploy', async () => {
        let mockedTfS3Api = await TerraformS3Api.build(
            "test_workspace",
            "test-s3-bucket",
        )
        let mockedTerraformCli = new TerraformCli(mockedTfS3Api, mockExec);

        // Arrange
        const prInfo: PullRequestInfo = {
            branch: "test-branch",
            sha1: "abc1234"
        }
        const command = "/deploy"
        const commentId = 534

        // Act
        await handleSlashCommand(
            mockedTfS3Api,
            mockedTerraformCli,
            mockedGithubHelper,
            prInfo,
            commentId,
            command
        );

        // Assert
        expect(mockOctokit.rest.reactions.createForIssueComment.mock.calls.length).toBe(2);
        expect(mockOctokit.rest.reactions.createForIssueComment.mock.calls[0][0].content).toBe("eyes");
        expect(mockOctokit.rest.reactions.createForIssueComment.mock.calls[0][0].comment_id).toBe(commentId);

        expect(mockExec.mock.calls[0][0]).toContain("terraform init")
        expect(mockExec.mock.calls[1][0]).toContain("terraform apply")

        expect(mockOctokit.rest.issues.createComment.mock.calls.length).toBe(1);
        expect(mockOctokit.rest.issues.createComment.mock.calls[0][0].body).toContain(":::environment created:::");

        expect(mockOctokit.rest.reactions.createForIssueComment.mock.calls[1][0].content).toBe("rocket");
        expect(mockOctokit.rest.reactions.createForIssueComment.mock.calls[1][0].comment_id).toBe(commentId);

        expect(s3Mock.commandCalls(GetObjectCommand).length).toBeGreaterThan(0)
        expect(s3Mock.commandCalls(PutObjectCommand).length).toBeGreaterThan(0)
    });

    test('handle /destroy', async () => {
        let mockedTfS3Api = await TerraformS3Api.build(
            "test_workspace",
            "test-s3-bucket",
        )
        let mockedTerraformCli = new TerraformCli(mockedTfS3Api, mockExec);

        // Arrange
        const prInfo: PullRequestInfo = {
            branch: "test-branch",
            sha1: "abc1234"
        }
        const command = "/destroy"
        const commentId = 534

        // Act
        await handleSlashCommand(
            mockedTfS3Api,
            mockedTerraformCli,
            mockedGithubHelper,
            prInfo,
            commentId,
            command
        );

        // Assert
        expect(mockOctokit.rest.reactions.createForIssueComment.mock.calls.length).toBe(2);
        expect(mockOctokit.rest.reactions.createForIssueComment.mock.calls[0][0].content).toBe("eyes");
        expect(mockOctokit.rest.reactions.createForIssueComment.mock.calls[0][0].comment_id).toBe(commentId);

        expect(mockExec.mock.calls[0][0]).toContain("terraform init");
        expect(mockExec.mock.calls[1][0]).toContain("terraform destroy");
        
        expect(s3Mock.commandCalls(DeleteObjectCommand).length).toBe(2);

        expect(mockOctokit.rest.issues.createComment.mock.calls.length).toBe(1);
        expect(mockOctokit.rest.issues.createComment.mock.calls[0][0].body).toContain("deleted");

        expect(mockOctokit.rest.reactions.createForIssueComment.mock.calls[1][0].content).toBe("rocket");
        expect(mockOctokit.rest.reactions.createForIssueComment.mock.calls[1][0].comment_id).toBe(commentId);
    });
})