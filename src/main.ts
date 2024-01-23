import * as core from '@actions/core'
import * as github from '@actions/github'
import {handleSlashCommand} from "./slash_command";
import {handlePrClosed} from "./pr_closed";
import {TerraformCloudApi} from "./tfc_api";
import {TerraformCli} from "./tfc_cli";
import {getIssueNumber, GithubHelper} from "./gh_helper";
import { extractCmd, extractVars } from './comment_parser';
import { CloudBackend } from './tfc_backend';

const github_token = core.getInput('gh_comment_token') || process.env['gh_comment_token'];
const tfc_api_token = core.getInput('terraform_cloud_api_token') || process.env['terraform_cloud_api_token'];
const tfc_org = core.getInput('terraform_org') || process.env['terraform_org'];
const workspacePrefix = 'zpr-';

console.log("main.js started");

function validateInputs() {
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
}

function buildGithubHelper() {
    let octokit = github.getOctokit(github_token);
    const issue_number: number = getIssueNumber(github);
    const repo: string = github.context.payload.repository.name
    const repo_owner: string = String(github.context.payload.repository.owner.login)

    console.log(`PR Looking at PR: ${repo_owner}/${repo}#${issue_number}`)
    return new GithubHelper(octokit, repo_owner, repo, issue_number)
}

async function reportHandlerError(eventName, details) {
    let errorMessage = `I ran into an error processing the ${eventName} event.\n\n`
    errorMessage += "```" + details + "```"

    await githubHelper.addReaction(commentId, "-1");
    await githubHelper.addComment(errorMessage);
}

async function run(): Promise<void> {
    try {
        console.log(`Received eventName=${github.context.eventName} and action=${github.context.payload.action}`);

        // Do validation first, but do not comment on PR
        validateInputs()

        const githubHelper = buildGithubHelper()
        const prInfo = await githubHelper.getPullRequest();
        const workspaceName = `${workspacePrefix}${prInfo.branch}`;

        // parse command and variables from comment body
        const firstLine = github.context.comment.body.split(/\r?\n/)[0].trim()
        const command = extractCmd(firstLine)
        const cmdVars = extractVars(firstLine.slice(7).trim())

        // terraform setup
        const tfBackend = new CloudBackend(
            tfc_org as string,
            tfc_api_token as string,
            workspaceName
        )
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
                        tfcCli.backend.tfcApi,
                        tfcCli,
                        githubHelper
                    );
                } catch (e: any) {
                    await reportHandlerError("pr closed", e.message)
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
