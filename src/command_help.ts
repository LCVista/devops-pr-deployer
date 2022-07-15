import {Octokit} from "@octokit/core";
import {Api} from "@octokit/plugin-rest-endpoint-methods/dist-types/types";

export const HELP_TEXT = `
PR deployer runs terraform apply at the root of this repository.  Available commands:
    
/deploy [database] [env_var1=value1 env_var2=value2 ...]
/destroy
/help

Environment variables persist between runs,
so if the only thing that's changed is the build you can run "/deploy"
`;