import fs from "fs";
const { execSync } = require("child_process");

export class TerraformCli {
    public readonly orgId: string;
    public readonly workspaceName: string;
    public readonly baseDomain: string;
    public readonly githubToken: string;
    private readonly exec: (string) => Buffer;

    constructor(
        orgId: string,
        workspaceName: string,
        baseDomain: string | undefined = undefined,
        exec: ((string) => Buffer) | undefined = undefined
    ) {
        this.baseDomain = baseDomain ? baseDomain : "app.terraform.io";
        this.orgId = orgId;
        this.workspaceName = workspaceName;
        this.githubToken = github
        this.exec = exec ? exec : execSync;
    }

    private __exec(command) : string {
        try {
            console.log("Running exec command:");
            console.log(command);
            let stdout = this.exec(command);
            console.log(stdout.toString());
            return stdout.toString();
        } catch (error: any) {
            console.log("I received an error running the exec command");
            if (error) {
                let errorMessage: string = "";
                if (error.stderr) {
                    errorMessage += error.stderr.toString() + "\n";
                }
                if (error.stdout) {
                    errorMessage += error.stdout.toString() + "\n";
                }
                console.log(errorMessage);
                throw Error(errorMessage);
            } else {
                console.log("Error object was null");
                throw Error("Unknown error and error object was null");
            }
        }
    }

    public tfInit(): string {
        // customize terraform code for this PR/branch
        let terraformCode = fs.readFileSync('pr-env.tf');
        terraformCode = terraformCode.replace('$BASE_DOMAIN', this.baseDomain);
        terraformCode = terraformCode.replace('$ORG_ID', this.orgId);
        terraformCode = terraformCode.replace('$WORKSPACE_NAME', this.workspaceName);
        terraformCode = terraformCode.replace('$GITHUB_TOKEN', this.githubToken);
        fs.writeFileSync('pr-env.tf', terraformCode, 'utf-8');

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
