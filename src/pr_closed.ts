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
    } catch (e: any) {
        console.log('Workspace may not have been initialized', e);
    }

    let existingVars = await tfcApi.getExistingVars();
    console.log(`existingVars= ${JSON.stringify(existingVars)}`);
    let allSet = true;
    allSet &&= await tfcApi.setVariable(existingVars["git_branch"], "git_branch", prInfo.branch);
    allSet &&= await tfcApi.setVariable(existingVars["git_sha1"], "git_sha1", prInfo.sha1);
    if (!allSet) {
        console.log("not all variables were set");
        throw new Error ("Not all variables were set");
    }

    try {
        tfcCli.tfDestroy();
        console.log(`Workspace ${tfcApi.workspaceName} destroyed`);
    } catch (e: any) {
        console.log('Workspace NOT destroyed:', e);
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