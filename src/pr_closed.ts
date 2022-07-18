import {TerraformCloudApi} from "./tfc_api";
import {TerraformCli} from "./tfc_cli";
import {GithubHelper} from "./gh_helper";

export async function handlePrClosed(
    tfcApi: TerraformCloudApi,
    tfcCli: TerraformCli,
    ghHelper: GithubHelper
){
    let outputInit = tfcCli.tfInit();
    console.log(outputInit);
    let outputDestroy = tfcCli.tfDestroy();
    console.log(outputDestroy);

    let result = await tfcApi.deleteWorkspace();
    if (result) {
        console.log (`Workspace ${tfcApi.workspaceName} was deleted`)
        await ghHelper.addComment(`Workspace ${tfcApi.workspaceName} was deleted`);
    } else {
        throw new Error(`Workspace ${tfcApi.workspaceName} NOT deleted`);
    }
}