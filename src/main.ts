import * as core from '@actions/core'
import * as github from '@actions/github'
import {handleSlashCommand} from "./slash_command";
import {handlePrClosed} from "./pr_closed";
import {TerraformCloudApi} from "./tfc_api";
import {TerraformCli} from "./tfc_cli";
import {getIssueNumber, GithubHelper} from "./gh_helper";

const github_token = core.getInput('gh_comment_token') || process.env['gh_comment_token'];
const tfc_api_token = core.getInput('terraform_cloud_api_token') || process.env['terraform_cloud_api_token'];
const tfc_org = core.getInput('terraform_org') || process.env['terraform_org'];
const workspacePrefix = 'zpr-';

console.log("main.js started");

async function run(): Promise<void> {
    // Do validation first, but do not comment on PR
    try {
        console.log(`Received eventName=${github.context.eventName} and action=${github.context.payload.action}`);

        // Check required inputs
        if (!github_token) {
            throw new Error(`Missing required input 'token'.`)
        }
        // Check required inputs
        if (!tfc_api_token) {
            throw new Error(`Missing required input 'terraform_cloud_api_token'.`)
        }
        // Check required inputs
        if (!tfc_org) {
            throw new Error(`Missing required input 'tfc_org'.`)
        }

        // Check required context properties exist (satisfy type checking)
        if (!github.context.payload.repository) {
            throw new Error('github.context.payload.repository is missing.')
        }

        let octokit = github.getOctokit(github_token);
        const issue_number: number = getIssueNumber(github);
        const repo: string = github.context.payload.repository.name
        const repo_owner: string = String(github.context.payload.repository.owner.login)
        let githubHelper = new GithubHelper(octokit, repo_owner, repo, issue_number)
        console.log(`PR Looking at PR: ${repo_owner}/${repo}#${issue_number}`)

        let prInfo = await githubHelper.getPullRequest();
        let workspaceName = `${workspacePrefix}${prInfo.branch}`;
        let tfcApi = new TerraformCloudApi(tfc_api_token, tfc_org, workspaceName);
        let tfcCli = new TerraformCli(tfc_org, workspaceName);
        console.log(`Workspace name=${workspaceName}, branch=${prInfo.branch}, sha1=${prInfo.sha1}`);

        if (github.context.eventName === 'issue_comment') {
            if (!github.context.payload.comment) {
                throw new Error('github.context.payload.comment is missing.')
            }
            const commentBody: string = github.context.payload.comment.body
            const commentId: number = github.context.payload.comment.id
            console.log(`Comment body: ${commentBody}`)
            console.log(`Comment id: ${commentId}`)

            console.log("Slash Command");
            try {
                await handleSlashCommand(
                    tfcApi,
                    tfcCli,
                    githubHelper,
                    prInfo,
                    commentId,
                    commentBody
                );
            } catch (e: any) {
                let errorMessage = `I ran into an error processing the slash command.  Here's more information:\n\n` +
                    `\`\`\`${e.message}\`\`\``;

                await githubHelper.addReaction(commentId, "-1");
                await githubHelper.addComment(errorMessage);
            }
        } else if (github.context.eventName === 'pull_request') {
            if (github.context.payload.action === 'closed') {
                console.log("PR closed");
                try {
                    await handlePrClosed(
                        tfcApi,
                        tfcCli,
                        githubHelper
                    );
                } catch (e: any) {
                    let errorMessage = `I ran into an error handling the closed PR. Here's more information:\n${e.message}`;
                    await githubHelper.addComment(errorMessage);
                }
            }
        }

    } catch (error: any) {
        console.log(error);
        const message: string = error.message
        core.setFailed(message)
        core.setOutput('error-message', message);
    }
}

run();