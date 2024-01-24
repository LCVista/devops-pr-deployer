import { PullRequestInfo } from "./gh_helper";
import { CommandVars } from "./slash_command";
const { execSync } = require("child_process");

export type TerraformBackend = {
    configure: () => boolean,
    cleanUp: () => Promise<boolean>,
    setupVariables: (prInfo: PullRequestInfo, cmdVars: CommandVars) => Promise<boolean>
    hasExistingWorkspace: () => Promise<boolean>
}

export class TerraformCli {
    public readonly backend: TerraformBackend;
    private readonly exec: (string) => Buffer;

    constructor(
        backend: TerraformBackend,
        exec: ((string) => Buffer) | undefined = undefined,
    ) {
        this.backend = backend;
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
        this.backend.configure()

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
