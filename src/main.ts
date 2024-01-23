import * as core from '@actions/core'
import * as github from '@actions/github'
import {handleSlashCommand} from "./slash_command";
import {handlePrClosed} from "./pr_closed";
import {TerraformCloudApi} from "./tfc_api";
import {TerraformCli} from "./tfc_cli";
import {getIssueNumber, GithubHelper} from "./gh_helper";
import { extractCmd, extractVars } from './comment_parser';
import { CloudBackend } from './tfc_backend';
import { S3Backend } from './s3_backend';

const github_token = core.getInput('gh_comment_token') || process.env['gh_comment_token'];
const tfc_api_token = core.getInput('terraform_cloud_api_token') || process.env['terraform_cloud_api_token'];
const tfc_org = core.getInput('terraform_org') || process.env['terraform_org'];
const workspacePrefix = 'zpr-';

console.log("main.js started");

async function reportHandlerError(githubHelper, commentId, eventName, details) {
    let errorMessage = `I ran into an error processing the ${eventName} event.\n\n`
    errorMessage += "```" + details + "```"

    await githubHelper.addReaction(commentId, "-1");
    await githubHelper.addComment(errorMessage);
}

async function run(): Promise<void> {
    try {
        console.log(`Received eventName=${github.context.eventName} and action=${github.context.payload.action}`);

        // Do validation first, but do not comment on PR
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
        const repo: string = github_context.payload.repository.name
        const repo_owner: string = String(github_context.payload.repository.owner.login)
        const githubHelper = new GithubHelper(octokit, repo_owner, repo, issue_number)
        console.log(`PR Looking at PR: ${repo_owner}/${repo}#${issue_number}`)

        let prInfo = await githubHelper.getPullRequest();
        let workspaceName = `${workspacePrefix}${prInfo.branch}`;
        let tfcApi = new TerraformCloudApi(tfc_api_token, tfc_org, workspaceName);
        let tfcCli = new TerraformCli(tfc_org, workspaceName);
        console.log(`Workspace name=${workspaceName}, branch=${prInfo.branch}, sha1=${prInfo.sha1}`);

        // terraform setup
        let tfBackend;
        if (cmdVars.backend === "s3") {
            tfBackend = new S3Backend(workspaceName)
        } else {
            tfBackend = new CloudBackend(
                tfc_org as string,
                tfc_api_token as string,
                workspaceName
            )
        }

        const tfcCli = new TerraformCli(tfBackend, cmdVars, prInfo);

        // handle slash commands
        if (github.context.eventName === 'issue_comment') {
            if (!github.context.payload.comment) {
                throw new Error('github.context.payload.comment is missing.')
            }

            console.log("Recieved Slash Command");
            try {
                await handleSlashCommand(
                    tfcCli,
                    githubHelper,
                    github.context.payload.comment.id,
                    command,
                    cmdVars,
                    prInfo,
                );
            } catch (e: any) {
                await reportHandlerError("slash command", e.message)
            }

        // handle pr closed event
        } else if (github.context.eventName === 'pull_request') {
            if (github.context.payload.action == 'closed') {
                console.log("PR closed");

                try {
                    await handlePrClosed(
                        tfcCli,
                        githubHelper
                    );
                } catch (e: any) {
                    await reportHandlerError(githubHelper, "pr closed", e.message)
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
