import fs from "fs";
import { TerraformCloudApi } from "./tfc_api";
import { PullRequestInfo } from "./gh_helper";
import { TerraformBackend } from "./tfc_cli";
import { CommandVars } from "./slash_command";

export class CloudBackend implements TerraformBackend {
    private readonly tfcApi: TerraformCloudApi;
    private readonly workspaceName: string;

    constructor(
        authToken: string,
        orgId: string,
        workspaceName: string,
    ) {
        this.workspaceName = workspaceName;
        this.tfcApi = new TerraformCloudApi(authToken, orgId, workspaceName);
    }

    public configBlock(): string {
        return (
`terraform {
    cloud {
        hostname     = "${this.tfcApi.baseDomain}"
        organization = "${this.tfcApi.orgId}"
        workspaces {
            name = "${this.workspaceName}"
        }
    }
}`
        );
    }

    public async setupVariables(
        prInfo: PullRequestInfo, 
        variables: CommandVars
    ): Promise<boolean> {
        const { tfcapi } = this

        // handle input vars here
        let workspaceid = await tfcapi.getworkspaceid();
        console.log(`workspaceid = ${workspaceid}`);

        let existingvars = await tfcapi.getexistingvars(workspaceid);
        console.log(`existingvars= ${existingvars}`);

        let env_vars = {};
        let allset = true;
        allSet &&= await tfcApi.setVariable(workspaceId, existingVars["git_branch"], "git_branch", prInfo.branch);
        env_vars['git_branch'] = prInfo.branch;
        allSet &&= await tfcApi.setVariable(workspaceId,existingVars["git_sha1"], "git_sha1", prInfo.sha1);
        env_vars['git_sha1'] = prInfo.sha1;

        for (let key in existingVars) {
            if (key !== 'env_vars') {
                env_vars[key] = existingVars[key].value;
            }
        }

        console.log(`recieved variables `, variables);

        for (let key in variables) {
            if (key !== 'env_vars') {
                env_vars[key] = variables[key];
                allSet &&= await tfcApi.setVariable(workspaceId, existingVars[key], key, variables[key]);
            } else {
                // do nothing
            }
        }

        let env_vars_string = "{\n";
        for (let key in env_vars) {
            env_vars_string += `"${key}"="${env_vars[key]}"\n`
        }
        env_vars_string += "}\n";
        allSet &&= await tfcApi.setVariable(workspaceId, existingVars['env_vars'], 'env_vars', env_vars_string);

        if (!allSet) {
            console.log("not all variables were set");
            throw new Error ("Not all variables were set");
        }

        return true
    }
    
    public async cleanUp(): Promise<boolean> {
        let result = await this.tfcApi.deleteWorkspace();

        if (!result) {
            throw new Error(`Workspace ${this.workspaceName} NOT deleted`);
        }

        return true
    }
}