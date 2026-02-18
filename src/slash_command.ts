import fs from "fs";
import {HELP_TEXT} from "./command_help";
import {TerraformCli} from "./tfc_cli";
import {GithubHelper, PullRequestInfo} from "./gh_helper";
import {handlePrClosed} from "./pr_closed";
import { TerraformBackend } from "./types";
import { TFVARS_FILENAME, TerraformS3Api } from "./s3_backend_api";
import { BACKEND_CONFIG_FILE } from "./tfc_cli";
import { createEcsRunnerFromTerraform, TerraformEcsTaskConfig } from "./ecs_runner";

export async function handleSlashCommand(
    tfcApi: TerraformBackend,
    tfcCli: TerraformCli,
    githubHelper: GithubHelper,
    prInfo: PullRequestInfo,
    commentId: number,
    commentBody: string
) {
    const firstLine = commentBody.split(/\r?\n/)[0].trim()
    if (!firstLine || firstLine.length < 2 || !firstLine.startsWith('/')){
        console.debug(
            'The first line of the comment is not a valid slash command.'
        )
        return;
    }
    if (firstLine.startsWith('/help')) {
        console.log("Received /help command");
        await githubHelper.addReaction(commentId, "eyes");
        tfcCli.tfInit();
        let availableVariables = tfcCli.tfShow();
        await githubHelper.addComment(HELP_TEXT + "\n\n" + "```" + availableVariables + "```");
        await githubHelper.addReaction(commentId, "rocket");
        return;
    } else if (firstLine.startsWith('/destroy')) {
        console.log("Received /destroy command");
        await githubHelper.addReaction(commentId, "eyes");
        await handlePrClosed(tfcApi, tfcCli, githubHelper, prInfo);
        await githubHelper.addReaction(commentId, "rocket");
        return;
    } else if (firstLine.startsWith('/deploy')) {
        console.log("Received /deploy command");
        await githubHelper.addReaction(commentId, "eyes");

        tfcCli.tfInit();

        // handle input vars here
        let existingVars = await tfcApi.getExistingVars();
        console.log(`existingVars=${JSON.stringify(existingVars)}`);

        let env_vars = {};
        let allSet = true;
        allSet &&= await tfcApi.setVariable(existingVars["git_branch"], "git_branch", prInfo.branch);
        env_vars['git_branch'] = prInfo.branch;
        allSet &&= await tfcApi.setVariable(existingVars["git_sha1"], "git_sha1", prInfo.sha1);
        env_vars['git_sha1'] = prInfo.sha1;

        for (let key in existingVars) {
            if (key !== 'env_vars') {
                env_vars[key] = existingVars[key].value;
            }
        }

        let variables = extractVars(firstLine.slice(7).trim());
        console.log(`Received variables `, variables);

        for (let key in variables) {
            if (key !== 'env_vars') {
                env_vars[key] = variables[key];
                allSet &&= await tfcApi.setVariable(existingVars[key], key, variables[key]);
            } else {
                // do nothing
            }
        }

        allSet &&= await tfcApi.setVariable(existingVars['env_vars'], 'env_vars', env_vars);

        if (!allSet) {
            console.log("not all variables were set");
            throw new Error ("Not all variables were set");
        }

        try {
            console.log(`[DEBUG] TFVARS_FILENAME (${TFVARS_FILENAME}):`);
            console.log(fs.readFileSync(TFVARS_FILENAME).toString());
        } catch {
            if (tfcApi instanceof TerraformS3Api) {
                console.log(`[WARNING] TFVARS_FILENAME (${TFVARS_FILENAME}) not found.`);
            }
        }
        try {
            console.log(`[DEBUG] BACKEND_CONFIG_FILENAME (${BACKEND_CONFIG_FILE})`)
            console.log(fs.readFileSync(BACKEND_CONFIG_FILE).toString());
        } catch {
            if (tfcApi instanceof TerraformS3Api) {
                console.log(`[WARNING] BACKEND_CONFIG_FILENAME (${BACKEND_CONFIG_FILE}) not found.`)
            }
        }

        // apply the plan
        tfcCli.tfApply()

        const outputs = tfcCli.tfOutputJson();
        console.log("Terraform outputs:", JSON.stringify(outputs, null, 2));

        const previewUrl = outputs.preview_url.value;
        const logsUrl = outputs.logs.value;
        const environmentName = outputs.environment_name.value;
        const environmentVariables = JSON.stringify(outputs.environment_variables.value, null, 2);
        await githubHelper.addComment(
            `Environment is ready at [${previewUrl}](${previewUrl})\n\n` +
            "```\n" +
            `environment_name = "${environmentName}"\n` +
            `environment_variables = ${environmentVariables}\n` +
            "```\n\n" +
            `[View logs](${logsUrl})`
        );
        await githubHelper.addReaction(commentId, "rocket");
        return;

    } else if (firstLine.startsWith('/sync-jurisdictions')) {
        console.log("Received /sync-jurisdictions command");
        await githubHelper.addReaction(commentId, "eyes");
        await handleSyncJurisdictions(tfcCli, githubHelper, commentId, firstLine);
        return;

    } else {
        console.debug('Unknown command')
        return;
    }
}

async function handleSyncJurisdictions(
    tfcCli: TerraformCli,
    githubHelper: GithubHelper,
    commentId: number,
    commandLine: string
) {
    // Extract required jurisdiction directories from command: /sync-jurisdictions <dir1> [dir2] [dir3] ...
    const parts = commandLine.trim().split(/\s+/);
    const jurisdictionDirectories = parts.slice(1);

    if (jurisdictionDirectories.length === 0) {
        throw new Error(
            "Missing required jurisdiction directory.\n\n" +
            "Usage: `/sync-jurisdictions <jurisdiction_directory> [additional_directories...]`\n\n" +
            "Examples:\n" +
            "  `/sync-jurisdictions default`\n" +
            "  `/sync-jurisdictions default/texas`\n" +
            "  `/sync-jurisdictions default new-york-cle`"
        );
    }

    // Initialize terraform to check deployment state
    tfcCli.tfInit();

    // Get environment details and ECS config from terraform outputs
    let environmentName: string;
    let dbName: string;
    let ecsTaskConfig: TerraformEcsTaskConfig;
    try {
        const outputs = tfcCli.tfOutputJson();
        environmentName = outputs.environment_name.value;
        dbName = outputs.db_name.value;
        ecsTaskConfig = outputs.ecs_task_config.value;
        console.log(`Retrieved environment details from terraform outputs: environmentName=${environmentName}, dbName=${dbName}, ecsTaskConfig=${JSON.stringify(ecsTaskConfig)}`);
    } catch (e) {
        throw new Error(
            "No deployment found or deployment may be incomplete. Please run `/deploy` first and wait for it to complete."
        );
    }

    // Check if management role infrastructure exists (required for running ECS tasks)
    if (!ecsTaskConfig.management_role_enabled || !ecsTaskConfig.task_definition) {
        throw new Error(
            "Management role infrastructure not found.\n\n" +
            "The `/sync-jurisdictions` command requires the management role to be deployed.\n\n" +
            "Please redeploy with:\n```\n/deploy include_management_role=true\n```"
        );
    }

    // Create ECS runner from terraform config
    const ecsRunner = createEcsRunnerFromTerraform(ecsTaskConfig);

    const directoriesDisplay = jurisdictionDirectories.join(', ');
    console.log(`Running sync_jurisdictions for jurisdiction directories '${directoriesDisplay}' on tenant '${dbName}' in environment '${environmentName}'`);
    const command = [
        "./entrypoint.sh",
        "execute-command",
        "sync_jurisdictions",
        dbName,
        ...jurisdictionDirectories,
    ];

    await githubHelper.addComment(
        `Starting jurisdiction sync for **${directoriesDisplay}** on tenant **${dbName}**...\n\nThis may take a few minutes.`
    );

    const result = await ecsRunner.runCommand(command, environmentName);

    if (result.success) {
        await githubHelper.addComment(
            `✅ Successfully synced jurisdiction ${jurisdictionDirectories.length === 1 ? 'directory' : 'directories'} **${directoriesDisplay}** on tenant **${dbName}**\n\n[View CloudWatch Logs](${result.cloudwatchUrl})`
        );
        await githubHelper.addReaction(commentId, "rocket");
    } else {
        throw new Error(
            `Jurisdiction sync failed with exit code ${result.exitCode}\n\n` +
            `[View CloudWatch Logs](${result.cloudwatchUrl})`
        );
    }
}

export function extractVars(line: string): {[key: string]: string} {
    if (!line || line.length == 0){
        return {};
    }

    return line
        .split(/\s+/g)
        .reduce( (accum, entry) => {
            let sides = entry.split('=');
            if (sides.length == 2) {
                accum[sides[0]] = sides[1].trim();
            } else if (sides.length == 1 && sides[0].length > 0){
                accum['db_name'] = sides[0];
            } else {
                //console.debug(`Bad split for ${entry}, ${sides}`);
            }
            return accum;
        }, {})
}
