const { execSync } = require("child_process");

function __exec(command) : string {
    try {
        console.log(command);
        let stdout = execSync(command);
        return stdout.toString();
    } catch (error: any) {
        if (error && error.stdout) {
            throw Error(error.stdout.toString());
        } else {
            throw error;
        }
    }
}

export function tfInit(orgId, workspaceName) : string {
    const TERRAFORM_HEADER = `terraform {
  cloud {
    hostname     = "app.terraform.io"
    organization = "${orgId}"
    workspaces {
      name = "${workspaceName}"
    }
  }
}`;
    const fs = require("fs");
    fs.writeFileSync('terraform.tf', TERRAFORM_HEADER, 'utf-8');

    return __exec('terraform init -input=false');
}

export function tfApply(): string {
    return __exec('terraform apply --auto-approve');
}

export function tfOutput(): string {
    return __exec('terraform output -no-color');
}

export function tfDestroy(): string {
    return __exec('terraform destroy --auto-approve')
}