import {HELP_TEXT} from "./command_help";
import {TerraformCli} from "./tfc_cli";
import {TerraformCloudApi} from "./tfc_api";
import {GithubHelper, PullRequestInfo} from "./gh_helper";
import {handlePrClosed} from "./pr_closed";
import { CommandVars } from "./comment_parser";


async function help(
    tfcCli: TerraformCli,
    githubHelper: GithubHelper,
    commentId: number 
) {
    console.log("Received /help command");
    await githubHelper.addReaction(commentId, "eyes");

    tfcCli.tfInit();
    let availableVariables = tfcCli.tfShow();

    await githubHelper.addComment(HELP_TEXT + "\n\n" + "```" + availableVariables + "```");
    await githubHelper.addReaction(commentId, "rocket");
}

async function destroy(
    tfcCli: TerraformCli,
    githubHelper: GithubHelper,
    commentId: number,
) {
    console.log("Received /destroy command");
    await githubHelper.addReaction(commentId, "eyes");
    await handlePrClosed(tfcCli, githubHelper);
    await githubHelper.addReaction(commentId, "rocket");
}

async function deploy(
    tfcCli: TerraformCli,
    githubHelper: GithubHelper,
    commentId: number,
    prInfo: PullRequestInfo,
    cmdVars: CommandVars
) {
    await githubHelper.addReaction(commentId, "eyes");

    tfcCli.tfInit();
    tfcCli.tfApply()

    let previewUrl = tfcCli.tfOutputOneVariable("preview_url");
    console.log(`preview_url=${previewUrl}`);

    let output = tfcCli.tfOutput();
    console.log(output);

    const comment = `Environment is ready at [${previewUrl}](${previewUrl})\n\n` + "```" + output + "```"
    await githubHelper.addComment(comment)
    await githubHelper.addReaction(commentId, "rocket");
}

export async function handleSlashCommand(
    tfcCli: TerraformCli,
    githubHelper: GithubHelper,
    commentId: number,
    command: string,
    commandVars: CommandVars,
    prInfo: PullRequestInfo
) {
    console.log(`Comment id: ${commentId}`)
    console.log(`command: ${command}`)
    console.log(`command variables: ${commandVars}`);

    if (command === 'help') {
        console.log("Received /help command");
        return await help(tfcCli, githubHelper, commentId);
    } else if (command === 'destroy') {
        console.log("Received /destroy command");
        return await destroy(tfcCli, githubHelper, commentId);
    } else if (command === 'deploy') {
        console.log("Received /deploy command");
        return await deploy(
            tfcCli,
            githubHelper,
            commentId,
            prInfo,
            commandVars
        )
    } else {
        console.debug('Unknown command')
        return;
    }
}
