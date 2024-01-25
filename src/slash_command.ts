import {HELP_TEXT} from "./command_help";
import {TerraformCli} from "./tfc_cli";
import {GithubHelper, PullRequestInfo} from "./gh_helper";
import {handlePrClosed} from "./pr_closed";
import { TerraformCloudApi } from "./tfc_api";

export async function handleSlashCommand(
    tfcApi: TerraformCloudApi,
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
        await handlePrClosed(tfcCli, githubHelper);
        await githubHelper.addReaction(commentId, "rocket");
        return;
    } else if (firstLine.startsWith('/deploy')) {
        console.log("Received /deploy command");
        await githubHelper.addReaction(commentId, "eyes");

        tfcCli.tfInit();

        // FUCK

        // handle input vars here

        // get previously set variables from backend
        // TODO: manage s3 backend differences
        // s3 doesn't (technically) reauire a workspaceid
        let workspaceid = await tfcApi.getworkspaceid();
        console.log(`workspaceid = ${workspaceid}`);
        let existingvars = await tfcApi.getexistingvars(workspaceid);
        console.log(`existingvars= ${existingvars}`);

        let env_vars = {};
        let allset = true;
        // manage setVariable differences
        // 
        allSet &&= await tfcApi.setVariable(workspaceId, existingVars["git_branch"], "git_branch", prInfo.branch);
        env_vars['git_branch'] = prInfo.branch;
        allSet &&= await tfcApi.setVariable(workspaceId,existingVars["git_sha1"], "git_sha1", prInfo.sha1);
        env_vars['git_sha1'] = prInfo.sha1;

        for (let key in existingVars) {
            if (key !== 'env_vars') {
                env_vars[key] = existingVars[key].value;
            }
        }

        let variables = extractVars(firstLine.slice(7).trim());
        console.log(`recieved variables `, variables);

        for (let key in variables) {
            if (key !== 'env_vars') {
                env_vars[key] = variables[key];
                allSet &&= await tfcApi.setVariable(workspaceId, existingVars[key], key, variables[key]);
            } else {
                // do nothing
            }
        }

        let env_vars_string = "{\n";
        for (let key in env_vars) {
            env_vars_string += `"${key}"="${env_vars[key]}"\n`
        }
        env_vars_string += "}\n";
        allSet &&= await tfcApi.setVariable(workspaceId, existingVars['env_vars'], 'env_vars', env_vars_string);

        if (!allSet) {
            console.log("not all variables were set");
            throw new Error ("Not all variables were set");
        }

        return true
    }
        // UNFUCK

        tfcCli.tfApply();

        let previewUrl = tfcCli.tfOutputOneVariable("preview_url");
        console.log(`preview_url=${previewUrl}`);

        let output = tfcCli.tfOutput();
        console.log(output);

        await githubHelper.addComment(`Environment is ready at [${previewUrl}](${previewUrl})` +
            "\n\n" +
            "```" +
            output + "```");
        await githubHelper.addReaction(commentId, "rocket");
        return;

    } else {
        console.debug(
            'Unknown command'
        )
        return;
    }
}

export type CommandVars = {
    [key: string]: string
}

export function extractVars(line: string): CommandVars {
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