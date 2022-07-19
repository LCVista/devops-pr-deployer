export type PullRequestInfo = {
    branch: string,
    sha1: string
}

/**
 * Convenience wrapper for commenting and reactions
 */
export class GithubHelper {
    private readonly octokit;
    private readonly repo_owner: string;
    private readonly repo: string;
    private readonly issue_number: number;

    constructor(octokit, repo_owner: string, repo: string, issue_number: number) {
        this.octokit = octokit;
        this.repo_owner = repo_owner;
        this.repo = repo;
        this.issue_number = issue_number;
    }

    async addComment(body: string): Promise<boolean> {

        const { data: comment } = await this.octokit.rest.issues.createComment({
            owner: this.repo_owner,
            repo: this.repo,
            issue_number: this.issue_number,
            body: body,
        });

        console.log(`Created comment id '${comment.id}' on issue '${this.issue_number}'.`);
        if (comment.id == null) {
            throw new Error(`Failed to create a comment on ${this.issue_number}.  Check the logs to see more.`);
        } else {
            return true;
        }
    }

    async addReaction(commentId: number, reaction: string): Promise<boolean> {
        const { data: any } = await this.octokit.rest.reactions.createForIssueComment({
            owner: this.repo_owner,
            repo: this.repo,
            comment_id: commentId,
            content: reaction,
        });

        return true;
    }

    async getPullRequest(): Promise<PullRequestInfo> {
        const { data: pullRequest } = await this.octokit.rest.pulls.get({
            owner: this.repo_owner,
            repo: this.repo,
            pull_number: this.issue_number
        });

        return {
            branch: pullRequest.head.ref,
            sha1: pullRequest.head.sha
        }
    }
}

export function getIssueNumber(github) : number {
    if (github.context.payload.issue) {
        return github.context.payload.issue.number
    } else if (github.context.payload.pull_request) {
        return github.context.payload.pull_request.number
    }
    throw new Error('PR/Issue number is is missing.  I need it for all events');
}