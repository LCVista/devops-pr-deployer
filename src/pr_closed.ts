import {TerraformCli} from "./tfc_cli";
import { GithubHelper, PullRequestInfo } from "./gh_helper";
import { TerraformBackend } from "./types";

/**
 * Check if terraform state shows any remaining resources
 * Returns true if state is empty (all resources destroyed)
 */
function isStateEmpty(tfShowOutput: string): boolean {
    // "terraform show" on an empty state outputs either:
    // - "No state." (older terraform)
    // - "The state file is empty. No resources are represented." (newer terraform)
    // - Just whitespace/empty
    const trimmed = tfShowOutput.trim().toLowerCase();
    return trimmed === '' || 
           trimmed === 'no state.' ||
           trimmed.includes('the state file is empty') ||
           trimmed.includes('no resources are represented');
}

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

    let allSet = true;
    allSet &&= await tfcApi.setVariable(null, "git_branch", prInfo.branch);
    allSet &&= await tfcApi.setVariable(null, "git_sha1", prInfo.sha1);
    if (!allSet) {
        throw new Error ("Github identifier variables were not successfully set");
    }

    let destroySucceeded = false;
    let destroyError: Error | null = null;
    
    try {
        tfcCli.tfDestroy();
        console.log(`Terraform destroy command completed for workspace ${tfcApi.workspaceName}`);
        destroySucceeded = true;
    } catch (e: any) {
        destroyError = e;
        console.log(`Terraform destroy command failed: ${e.message}`);
    }

    // Verify actual destruction by checking state, regardless of destroy command result
    let stateEmpty = false;
    let stateCheckError: Error | null = null;
    try {
        const tfShowOutput = tfcCli.tfShow();
        stateEmpty = isStateEmpty(tfShowOutput);
        console.log(`State check: empty=${stateEmpty}`);
        if (!stateEmpty) {
            console.log(`Remaining resources in state:\n${tfShowOutput}`);
        }
    } catch (e: any) {
        stateCheckError = e;
        console.log(`Failed to check terraform state: ${e.message}`);
    }

    // Determine final status and appropriate action
    if (destroySucceeded && stateEmpty) {
        // Full success: destroy worked and state is empty
        let result = await tfcApi.deleteWorkspace();
        if (result) {
            console.log(`Workspace ${tfcApi.workspaceName} was deleted`);
            await ghHelper.addComment(`Workspace ${tfcApi.workspaceName} was deleted`);
        } else {
            throw new Error(`Terraform resources were destroyed but workspace ${tfcApi.workspaceName} metadata could NOT be deleted`);
        }
    } else if (destroySucceeded && !stateEmpty) {
        // Destroy command succeeded but resources remain (partial failure)
        let errorMessage = `⚠️ Workspace ${tfcApi.workspaceName} destruction incomplete.\n\n` +
            `The destroy command completed but some resources may still exist. ` +
            `Please check AWS console and manually clean up if needed.\n\n` +
            `The workspace state has been preserved for manual cleanup.`;
        if (stateCheckError) {
            errorMessage += `\n\nNote: Could not verify state: ${stateCheckError.message}`;
        }
        throw new Error(errorMessage);
    } else {
        // Destroy command failed
        let errorMessage = `❌ Workspace ${tfcApi.workspaceName} was NOT destroyed.\n\n`;
        if (destroyError) {
            errorMessage += `Error: ${destroyError.message}`;
        }
        throw new Error(errorMessage);
    }
}
