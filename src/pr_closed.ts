import {TerraformCli} from "./tfc_cli";
import { GithubHelper, PullRequestInfo } from "./gh_helper";
import { TerraformBackend } from "./types";

export async function handlePrClosed(
    tfcApi: TerraformBackend,
    tfcCli: TerraformCli,
    ghHelper: GithubHelper,
    prInfo: PullRequestInfo,
){
    try {
        tfcCli.tfInit();
        console.log(`Workspace ${tfcApi.workspaceName} was initialized`);
    } catch (e: any) {
        console.log('Workspace may not have been initialized', e);
    }

    let existingVars = await tfcApi.getExistingVars();
    console.log(`existingVars= ${JSON.stringify(existingVars)}`);
    let allSet = true;
    allSet &&= await tfcApi.setVariable(existingVars["git_branch"], "git_branch", prInfo.branch);
    allSet &&= await tfcApi.setVariable(existingVars["git_sha1"], "git_sha1", prInfo.sha1);
    if (!allSet) {
        throw new Error ("Github identifier variables were not successfully set");
    }

    try {
        tfcCli.tfDestroy();
        console.log(`Workspace ${tfcApi.workspaceName} was destroyed`);
    } catch (e: any) {
        throw new Error(`Workspace ${tfcApi.workspaceName} NOT destroyed`);
    }

    let result = await tfcApi.deleteWorkspace();
    if (result) {
        console.log (`Workspace ${tfcApi.workspaceName} was deleted`)
        await ghHelper.addComment(`Workspace ${tfcApi.workspaceName} was deleted`);
    } else {
        throw new Error(`Workspace ${tfcApi.workspaceName} NOT deleted`);
    }
}
