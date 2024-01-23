import {TerraformCloudApi} from "./tfc_api";
import {TerraformCli} from "./tfc_cli";
import {GithubHelper} from "./gh_helper";

export async function handlePrClosed(
    tfcCli: TerraformCli,
    ghHelper: GithubHelper
){
    try {
        let outputInit = tfcCli.tfInit();
        console.log(outputInit);
        let outputDestroy = tfcCli.tfDestroy();
        console.log(outputDestroy);
    } catch (e: any) {
        console.log('Workspace may not have been initialized', e);
    }

    await tfcCli.backend.cleanUp();
    await ghHelper.addComment(`Workspace ${tfcApi.workspaceName} was deleted`);
}
