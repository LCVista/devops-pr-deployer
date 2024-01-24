import fs from "fs";
import { PullRequestInfo } from "./gh_helper";
import { TerraformBackend } from "./tfc_cli";
import { 
    S3Client, 
    PutObjectCommand, 
    GetObjectCommand,
    DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { CommandVars } from "./slash_command";

export class S3Backend implements TerraformBackend {
    private readonly workspaceName: string;
    private readonly bucketName: string; 
    private readonly dynamodbTable: string;
    private readonly s3Client: S3Client;

    constructor(
        bucketName: string,
        dynamodbTable: string,
        workspaceName: string
    ) {
        this.bucketName = bucketName;
        this.dynamodbTable = dynamodbTable;
        this.workspaceName = workspaceName;
        this.s3Client = new S3Client();
    }
    
    public async cleanUp(): Promise<boolean> {
        await this.s3Client.send(new DeleteObjectCommand({
            "Bucket": this.bucketName,
            "Key": this.tfstateKey()
        }));

        await this.s3Client.send(new DeleteObjectCommand({
            "Bucket": this.bucketName,
            "Key": this.tfvarsKey()
        }));

        return true
    }

    public configBlock(): string {
        return (
`terraform {
    backend "s3" {
        bucket = "lcv-tfstate"
        key = "${this.tfstateKey()}"
        dynamodb_table = "lcv-tf-locks"
        region = "us-west-2"
    }
}`
        );
    }


    public async setupVariables(
        prInfo: PullRequestInfo, 
        cmdVars: CommandVars
    ): Promise<boolean> {
        const savedVars = await this.getVariableState()
        let variables = {...savedVars, ...cmdVars};

        variables.git_branch = prInfo.branch;
        variables.sha1 = prInfo.sha1;

        fs.writeFileSync(
            `${this.workspaceName}.tfvars.json`, 
            JSON.stringify(variables), 
            'utf-8'
        );

        return await this.saveVariableState(variables)
    }

    private tfvarsKey() {
        return `${this.workspaceName}/terraform.tfvars.json`
    }
    
    private tfstateKey() {
        return `${this.workspaceName}/terraform.tfstate`
    }

    private async saveVariableState(variables: CommandVars): Promise<boolean> {
        const command = new PutObjectCommand({
            "Bucket": this.bucketName,
            "Key": this.tfvarsKey(),
            "Body":  JSON.stringify(variables)
        });

        const response = this.s3Client.send(command);

        return true
    }

    public async getVariableState(): Promise<CommandVars> {
        const command = new GetObjectCommand({
            "Bucket": this.bucketName,
            "Key": this.tfvarsKey(),
        })
        const response = await this.s3Client.send(command);

        return JSON.parse(response.Body);
    }

}
