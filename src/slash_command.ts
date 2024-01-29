import fs from "fs";
import {HELP_TEXT} from "./command_help";
import {TerraformCli} from "./tfc_cli";
import {GithubHelper, PullRequestInfo} from "./gh_helper";
import {handlePrClosed} from "./pr_closed";
import { TerraformBackend } from "./types";
import { TFVARS_FILENAME } from "./s3_backend_api";
import { BACKEND_CONFIG_FILE } from "./tfc_cli";

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
        await handlePrClosed(tfcApi, tfcCli, githubHelper);
        await githubHelper.addReaction(commentId, "rocket");
        return;
    } else if (firstLine.startsWith('/deploy')) {
        console.log("Received /deploy command");
        await githubHelper.addReaction(commentId, "eyes");

        tfcCli.tfInit();

        // handle input vars here
        let existingVars = await tfcApi.getExistingVars();
        console.log(`existingVars= ${existingVars}`);

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

        
        console.log('[DEBUG] skipped terraform apply')
        console.log(`[DEBUG] TFVARS_FILENAME (${TFVARS_FILENAME}):`);
        console.log(fs.readFileSync(TFVARS_FILENAME));
        console.log(`[DEBUG] BACKEND_CONFIG_FILENAME (${BACKEND_CONFIG_FILE})`)
        console.log(fs.readFileSync(BACKEND_CONFIG_FILE));

        let previewUrl = tfcCli.tfOutputOneVariable("preview_url");
        console.log(`preview_url=${previewUrl}`);

        throw Error("DEBUG STOP! (this is good!)")

        // apply the plan
        // tfcCli.tfApply()

        // let output = tfcCli.tfOutput();
        // console.log(output);

        // await githubHelper.addComment(`Environment is ready at [${previewUrl}](${previewUrl})` +
        //     "\n\n" +
        //     "```" +
        //     output + "```");
        // await githubHelper.addReaction(commentId, "rocket");
        // return;

    } else {
        console.debug(
            'Unknown command'
        )
        return;
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