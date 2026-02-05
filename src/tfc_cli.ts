import fs from "fs";
import { TerraformBackend } from "./types";
import { parseTerraformError } from "./terraform_error_parser";
const { execSync } = require("child_process");

export const BACKEND_CONFIG_FILE = 'terraform.tf';

export class TerraformCli {
    private readonly tfBackendApi: TerraformBackend;
    private readonly exec: (string) => Buffer;

    constructor(
        tfBackendApi: TerraformBackend,
        exec: ((string) => Buffer) | undefined = undefined
    ) {
        this.tfBackendApi = tfBackendApi;
        this.exec = exec ? exec : execSync;
    }

    private __exec(command, parseErrors: boolean = true) : string {
        try {
            console.log("Running exec command:");
            console.log(command);
            let stdout = this.exec(command);
            console.log(stdout.toString());
            return stdout.toString();
        } catch (error: any) {
            console.log("I received an error running the exec command");
            if (error) {
                let rawOutput: string = "";
                if (error.stderr) {
                    rawOutput += error.stderr.toString() + "\n";
                }
                if (error.stdout) {
                    rawOutput += error.stdout.toString() + "\n";
                }
                // Log full output for debugging
                console.log("Full error output:");
                console.log(rawOutput);
                
                // Parse and throw a human-readable error message
                const errorMessage = parseErrors ? parseTerraformError(rawOutput) : rawOutput;
                throw Error(errorMessage);
            } else {
                console.log("Error object was null");
                throw Error("Unknown error and error object was null");
            }
        }
    }

    public tfInit(): string {
        fs.writeFileSync(
            BACKEND_CONFIG_FILE,
            this.tfBackendApi.configBlock(),
            'utf-8'
        );

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
