import fs from "fs";
import { TerraformCloudApi } from "./tfc_api";
import { PullRequestInfo } from "./gh_helper";
import { TerraformBackend } from "./tfc_cli";
import { CommandVars } from "./slash_command";

export class CloudBackend implements TerraformBackend {
    public readonly tfcApi: TerraformCloudApi;
    private readonly workspaceName: string;

    constructor(
        authToken: string,
        orgId: string,
        workspaceName: string,
    ) {
        this.workspaceName = workspaceName;
        this.tfcApi = new TerraformCloudApi(authToken, orgId, workspaceName);
    }

    public configure(): boolean {
        const backendConfig = (
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

        fs.writeFileSync('backend.tf', backendConfig, 'utf-8');

        return true
    }

    public async setupVariables(
        prInfo: PullRequestInfo, 
        cmdVars: CommandVars
    ): Promise<boolean> {
        const { tfcApi } = this

        // handle input vars here
        let workspaceId = await tfcApi.getWorkspaceId();
        console.log(`workspaceId = ${workspaceId}`);

        let existingVars = await tfcApi.getExistingVars(workspaceId);
        console.log(`existingVars= ${existingVars}`);

        let env_vars = {};
        let allSet = true;
        allSet &&= await tfcApi.setVariable(workspaceId, existingVars["git_branch"], "git_branch", prInfo.branch);
        env_vars['git_branch'] = prInfo.branch;
        allSet &&= await tfcApi.setVariable(workspaceId,existingVars["git_sha1"], "git_sha1", prInfo.sha1);
        env_vars['git_sha1'] = prInfo.sha1;

        for (let key in existingVars) {
            if (key !== 'env_vars') {
                env_vars[key] = existingVars[key].value;
            }
        }

        console.log(`command variables `, cmdVars);

        for (let key in cmdVars) {
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
    