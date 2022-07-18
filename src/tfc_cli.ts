import fs from "fs";
const { execSync } = require("child_process");

export class TerraformCli {
    public readonly orgId: string;
    public readonly workspaceName: string;
    public readonly baseDomain: string;

    constructor(orgId: string, workspaceName: string, baseDomain: string | undefined = undefined) {
        this.baseDomain = baseDomain ? baseDomain : "app.terraform.io";
        this.orgId = orgId;
        this.workspaceName = workspaceName;
    }

    private __exec(command) : string {
        try {
            console.log(command);
            let stdout = execSync(command);
            console.log(stdout);
            return stdout.toString();
        } catch (error: any) {
            if (error && error.stdout) {
                console.log(error.stdout);
                throw Error(error.stdout.toString());
            } else {
                console.log(error);
                throw error;
            }
        }
    }

    public tfInit(): string {
        // Because the workspace name is calculated per PR,
        // this terraform cloud setting needs to be set before CLI commands can be called.
        const TERRAFORM_HEADER = `terraform {
  cloud {
    hostname     = "${this.baseDomain}"
    organization = "${this.orgId}"
    workspaces {
      name = "${this.workspaceName}"
    }
  }
}`;
        fs.writeFileSync('terraform.tf', TERRAFORM_HEADER, 'utf-8');

        return this.__exec('terraform init -no-color -input=false');
    }

    public tfShow(): string {
        return this.__exec('terraform show -no-color');
    }

    public tfApply(): string {
        return this.__exec('terraform apply -no-color --auto-approve');
    }

    public tfOutput(): string {
        return this.__exec('terraform output -no-color');
    }

    public tfOutputOneVariable(variableName: string): string {

        return this.__exec(`terraform output -no-color --raw ${variableName}`);
    }

    public tfDestroy(): string {
        return this.__exec('terraform destroy -no-color --auto-approve')
    }
}