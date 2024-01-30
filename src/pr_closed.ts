import {TerraformCli} from "./tfc_cli";
import {GithubHelper} from "./gh_helper";
import { TerraformBackend } from "./types";

export async function handlePrClosed(
    tfcApi: TerraformBackend,
    tfcCli: TerraformCli,
    ghHelper: GithubHelper
){
    try {
        let outputInit = tfcCli.tfInit();
        console.log(outputInit);
    } catch (e: any) {
        console.log('Workspace may not have been initialized', e);
    }
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