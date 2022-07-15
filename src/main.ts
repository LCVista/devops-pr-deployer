import * as core from '@actions/core'
import * as github from '@actions/github'
import {handleSlashCommand} from "./slash_command";
import {handlePrClosed} from "./pr_closed";

const github_token = core.getInput('gh_token') || process.env['gh_token'];
const tfc_api_token = core.getInput('terraform_cloud_api_token') || process.env['terraform_cloud_api_token'];
const tfc_org = core.getInput('terraform_org') || process.env['terraform_org'];

console.log("main.js started");

async function run(): Promise<void> {
    try {
        console.log(`Received eventName=${github.context.eventName} and action=${github.context.payload.action}`);
        if (github.context.eventName === 'issue_comment') {
            console.log("Slash Command")
            await handleSlashCommand(github, core, github_token, tfc_api_token, tfc_org);
        } else if (github.context.eventName === 'pull_request') {
            if (github.context.payload.action === 'closed') {
                await handlePrClosed(github, core, github_token, tfc_api_token, tfc_org);
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