import {HELP_TEXT} from "./command_help";
import {tfApply, tfDestroy, tfInit, tfOutput} from "./tfc_cli";
import {deleteWorkspace, getExistingVars, getWorkspaceId, setVariable} from "./tfc_api";
import addCustomEqualityTester = jasmine.addCustomEqualityTester;

export async function handleSlashCommand(github, core, github_token, tfc_api_token, tfc_org) {
    // Check required context properties exist (satisfy type checking)
    if (!github.context.payload.action) {
        throw new Error('github.context.payload.action is missing.')
    }
    if (!github.context.payload.comment) {
        throw new Error('github.context.payload.comment is missing.')
    }
    if (!github.context.payload.repository) {
        throw new Error('github.context.payload.repository is missing.')
    }

    // Only handle 'created' and 'edited' event types
    if (!['created', 'edited'].includes(github.context.payload.action)) {
        core.warning(
            `Event type '${github.context.payload.action}' not supported.`
        )
        return
    }

    // Check required inputs
    if (!github_token) {
        throw new Error(`Missing required input 'token'.`)
    }
    // Check required inputs
    if (!tfc_api_token) {
        throw new Error(`Missing required input 'terraform_cloud_api_token'.`)
    }
    // Check required inputs
    if (!tfc_org) {
        throw new Error(`Missing required input 'tfc_org'.`)
    }

    // Get the comment body and id
    const commentBody: string = github.context.payload.comment.body
    const commentId: number = github.context.payload.comment.id
    const issueId: number = github.context.payload.issue?.number!!
    const repo: string = github.context.payload.repository.name
    const owner: string = String(github.context.payload.repository.owner.login)

    core.debug(`Comment body: ${commentBody}`)
    core.debug(`Comment id: ${commentId}`)
    core.debug(`PR Number: ${issueId}`)

    let octokit = github.getOctokit(github_token);

    console.log(`Fetching pull request owner=${owner} repo=${repo} pull_number=${issueId} ctx=${JSON.stringify(github.context.payload.repository)}`);
    const { data: pullRequest } = await octokit.rest.pulls.get({
        owner: owner,
        repo: repo,
        pull_number: issueId
    });

    let workspaceName = `zpr-${pullRequest.head.ref}`
    let git_branch = pullRequest.head.ref;
    let git_sha1 = pullRequest.head.sha;

    const firstLine = commentBody.split(/\r?\n/)[0].trim()
    if (!firstLine || firstLine.length < 2 || !firstLine.startsWith('/')){
        console.debug(
            'The first line of the comment is not a valid slash command.'
        )
        return;
    }
    if (firstLine.startsWith('/help')){
        core.debug("Received /help command");

        await octokit.rest.reactions.createForIssueComment({
            owner: owner,
            repo: repo,
            comment_id: commentId,
            content: "eyes",
        });

        const { data: comment } = await octokit.rest.issues.createComment({
            owner: owner,
            repo: repo,
            issue_number: issueId,
            body: HELP_TEXT,
        });

        core.info(`Created comment id '${comment.id}' on issue '${issueId}'.`);
        return;
    } else if (firstLine.startsWith('/deploy')) {
        core.debug("Received /deploy command");

        await octokit.rest.reactions.createForIssueComment({
            owner: owner,
            repo: repo,
            comment_id: commentId,
            content: "eyes",
        });

        let initOutput = tfInit(tfc_org, workspaceName);
        core.info(initOutput);

        // handle input vars here
        let workspaceId = await getWorkspaceId(tfc_api_token, tfc_org, workspaceName);
        core.info(`workspaceId = ${workspaceId}`);
        let existingVars = await getExistingVars(tfc_api_token, tfc_org, workspaceId);
        core.info(`existingVars= ${existingVars}`);

        let env_vars = {};
        let allSet = true;
        allSet &&= await setVariable(tfc_api_token, tfc_org, workspaceId, existingVars["git_branch"], "git_branch", git_branch);
        env_vars['git_branch'] = git_branch;
        allSet &&= await setVariable(tfc_api_token, tfc_org, workspaceId,existingVars["git_sha1"], "git_sha1", git_sha1);
        env_vars['git_sha1'] = git_sha1;

        for (let key in existingVars) {
            if (key !== 'env_vars') {
                env_vars[key] = existingVars[key].value;
            }
        }

        let variables = extractVars(firstLine.slice(7).trim());

        core.info(`Received variables ${variables}`);
        console.log(variables);

        for (let key in variables) {
            if (key !== 'env_vars') {
                env_vars[key] = variables[key];
                allSet &&= await setVariable(tfc_api_token, tfc_org, workspaceId, existingVars[key], key, variables[key]);
            } else {
                // do nothing
            }
        }

        let env_vars_string = "{\n";
        for (let key in env_vars) {
            env_vars_string += `"${key}"="${env_vars[key]}"\n`
        }
        env_vars_string += "}\n";
        allSet &&= await setVariable(tfc_api_token, tfc_org, workspaceId, existingVars['env_vars'], 'env_vars', env_vars_string);

        if (!allSet) {
            console.log("not all variables were set");
            process.exit(1);
        }

        // apply the plan

        let applyOutput = tfApply()
        core.info(applyOutput);

        let outputOutput = tfOutput();
        core.info(outputOutput);
        core.setOutput('tf-output', outputOutput);

        await octokit.rest.reactions.createForIssueComment({
            owner: owner,
            repo: repo,
            comment_id: commentId,
            content: "rocket",
        });

        const { data: comment } = await octokit.rest.issues.createComment({
            owner: owner,
            repo: repo,
            issue_number: issueId,
            body: outputOutput,
        });

    } else if (firstLine.startsWith('/destroy')) {
        core.debug("Received /destroy command");

        await octokit.rest.reactions.createForIssueComment({
            owner: owner,
            repo: repo,
            comment_id: commentId,
            content: "eyes",
        });

        tfDestroy();
        await deleteWorkspace(tfc_api_token, tfc_org, workspaceName);

        await octokit.rest.reactions.createForIssueComment({
            owner: owner,
            repo: repo,
            comment_id: commentId,
            content: "+1",
        });

    } else {
        console.debug(
            'Unknown command'
        )
        return;
    }
}

export function extractVars(line: string): {[key: string]: string} {
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