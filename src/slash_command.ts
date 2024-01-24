import {HELP_TEXT} from "./command_help";
import {TerraformCli} from "./tfc_cli";
import {GithubHelper, PullRequestInfo} from "./gh_helper";
import {handlePrClosed} from "./pr_closed";

export async function handleSlashCommand(
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

        let variables = extractVars(firstLine.slice(7).trim());

        tfcCli.backend.setupVariables(prInfo, variables)

        tfcCli.tfApply();

        let previewUrl = tfcCli.tfOutputOneVariable("preview_url");
        console.log(`preview_url=${previewUrl}`);

        let output = tfcCli.tfOutput();
        console.log(output);

        const comment = `Environment is ready at [${previewUrl}](${previewUrl})\n\n` + "```" + output + "```"
        await githubHelper.addComment(comment)
        await githubHelper.addReaction(commentId, "rocket");
        return;
    } else {
        console.debug('Unknown command')
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

