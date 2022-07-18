import {Octokit} from "@octokit/core";
import {Api} from "@octokit/plugin-rest-endpoint-methods/dist-types/types";

export const HELP_TEXT = `
Pull Request Deployer ("PR Deployer") runs terraform apply at the root of this repository.

Using terraform cloud, it creates a workspace for the Pull Request based on the branch name for easy creation and destruction.

Available commands:
    
* /deploy [database] [env_var1=value1 env_var2=value2 ...]
* /destroy
* /help

Environment variables persist between runs, so if the only thing that's changed is the build you can run "/deploy"

These variables are calculated and provided by the tool:

"git_branch" = "my-feature-branch"
"git_sha1" = "a35b1b2f59122623907b4693447a354923796b01"
"env_vars" = map of all provided variables from this tool

If preview_url is provided as output, it will be formatted at the top of the success message.

Lastly, closing or merging the PR will result in destroying the workspace.

Specific information about this environment:
`;