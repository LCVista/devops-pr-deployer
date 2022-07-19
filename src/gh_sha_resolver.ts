import * as github from '@actions/github';
import * as core from '@actions/core';

import {getIssueNumber, GithubHelper} from "./gh_helper";

(async () => {
    try {
        const githubToken = core.getInput('gh_token') || process.env['gh_token'];

        if (!github.context.payload.repository) {
            throw new Error('github.context.payload.repository is missing.')
        }

        let octokit = github.getOctokit(githubToken);
        const issue_number: number = getIssueNumber(github);
        const repo: string = github.context.payload.repository.name
        const repo_owner: string = String(github.context.payload.repository.owner.login)
        let githubHelper = new GithubHelper(octokit, repo_owner, repo, issue_number)
        console.log(`PR Looking at PR: ${repo_owner}/${repo}#${issue_number}`)

        let prInfo = await githubHelper.getPullRequest();

        core.setOutput('head_sha', prInfo.sha1);
        core.setOutput('head_branch', prInfo.branch);
    } catch (error: any) {
        core.setFailed(error.message);
    }
})();