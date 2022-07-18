import fs from "fs";
const { execSync } = require("child_process");

export class TerraformCli {
    public readonly orgId: string;
    public readonly workspaceName: string;

    constructor(orgId: string, workspaceName: string) {
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

    public tfInit() : string {
        const TERRAFORM_HEADER = `terraform {
  cloud {
    hostname     = "app.terraform.io"
    organization = "${this.orgId}"
    workspaces {
      name = "${this.workspaceName}"
    }
  }
}`;
        fs.writeFileSync('terraform.tf', TERRAFORM_HEADER, 'utf-8');

        return this.__exec('terraform init -input=false');
    }

    public tfApply(): string {
        return this.__exec('terraform apply --auto-approve');
    }

    public tfOutput(): string {
        return this.__exec('terraform output -no-color');
    }

    public tfDestroy(): string {
        return this.__exec('terraform destroy --auto-approve')
    }
}