import {deleteWorkspace} from "./tfc_api";
import {tfDestroy, tfInit} from "./tfc_cli";

export async function handlePrClosed(github, core, github_token, tfc_api_token, tfc_org){
    const issueId: number = github.context.payload.pull_request.number!!
    const repo: string = github.context.payload.repository.name
    const owner: string = String(github.context.payload.repository.owner.login)
    let octokit = github.getOctokit(github_token);

    console.log(`Fetching pull request owner=${owner} repo=${repo} pull_number=${issueId} ctx=${JSON.stringify(github.context.payload.repository)}`);

    const { data: pullRequest } = await octokit.rest.pulls.get({
        owner: owner,
        repo: repo,
        pull_number: issueId
    });

    let workspaceName = `zpr-${pullRequest.head.ref}`;

    let outputInit = tfInit(tfc_org, workspaceName);
    console.log(outputInit);
    let outputDestroy = tfDestroy();
    console.log(outputDestroy);

    let result = await deleteWorkspace(tfc_api_token, tfc_org, workspaceName);
    if (result) {
        console.log (`Workspace ${workspaceName} was deleted`)
    } else {
        console.log (`Workspace ${workspaceName} NOT deleted`);
    }
}